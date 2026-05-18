import type { Applicant, CancelledInterview, InterviewEvent } from '@/types';
import { storage } from '@/utils/storage';
import { withStageChange } from '@/utils/applicantLifecycle';
import { canOverwriteAutomationStatusForInterviewConfirmed } from '@/utils/applicantAutomation';
import type {
  EventRepository,
  ListEventsByDateRangeParams,
  RemoveEventResult,
  RemoveWithCancelRecordResult,
  ScheduleInterviewResult,
} from '../types';
/**
 * 既存 storage.ts をラップする EventRepository 実装。
 *
 * 責務:
 *  - ClientData.events 配列の CRUD
 *  - 応募者連動が必要な書込 (`removeWithCancelRecord` / `scheduleInterview`) を 1 メソッドに集約
 *  - applicant 側の同時更新は `withStageChange` などの pure helper を直接呼び、
 *    1 回の `storage.saveClientData` で events / applicants を同時に書く（H-5 で原子化）
 *
 * 注意:
 *  - localStorage キー (`hireflow:client:${id}:data`) は変更しない
 *  - cancelledInterviews append は updatedAt を触らない既存挙動を維持
 *  - 子アカウントの拠点フィルタは AuthContext 側責務として残す（既存 Repository と同じ）
 *
 * 移行履歴:
 *  - H-1: 型 + LocalStorage 実装の追加（画面未連携）
 *  - H-2: Calendar.handleBook → create / Calendar.handleCancelEvent → remove
 *  - H-3: ApplicantDetail.handleReschedule → remove
 *  - H-4: ApplicantDetail.handleCancelEvent → removeWithCancelRecord
 *  - H-5: ApplicantDetail.handleScheduled → scheduleInterview（1 saveClientData 化）
 */
export class LocalStorageEventRepository implements EventRepository {
  listByApplicant(clientId: string, applicantId: number): InterviewEvent[] {
    const data = storage.getClientData(clientId);
    return (data.events ?? []).filter((e) => e.applicantId === applicantId);
  }

  listByDateRange(clientId: string, params: ListEventsByDateRangeParams = {}): InterviewEvent[] {
    const { fromDate, toDate, baseName } = params;
    const all = storage.getClientData(clientId).events ?? [];
    return all.filter((e) => {
      if (baseName !== undefined && e.base !== baseName) return false;
      if (fromDate !== undefined && e.date < fromDate) return false;
      if (toDate !== undefined && e.date > toDate) return false;
      return true;
    });
  }

  create(
    clientId: string,
    event: Omit<InterviewEvent, 'id'> & Partial<Pick<InterviewEvent, 'id'>>,
  ): InterviewEvent {
    const data = storage.getClientData(clientId);
    const events = data.events ?? [];

    // id が未指定 / 0 / NaN の場合は max + 1 で採番（Calendar.handleBook 互換）
    const provided = typeof event.id === 'number' && Number.isFinite(event.id) && event.id > 0 ? event.id : undefined;
    const nextId = provided ?? events.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;

    const created: InterviewEvent = { ...event, id: nextId };
    storage.saveClientData(clientId, {
      ...data,
      events: [...events, created],
    });
    return created;
  }

  remove(clientId: string, eventId: number): RemoveEventResult {
    const data = storage.getClientData(clientId);
    const events = data.events ?? [];
    const nextEvents = events.filter((e) => e.id !== eventId);
    if (nextEvents.length === events.length) return { removed: false };
    storage.saveClientData(clientId, { ...data, events: nextEvents });
    return { removed: true };
  }

  removeWithCancelRecord(
    clientId: string,
    eventId: number,
    applicantId: number,
  ): RemoveWithCancelRecordResult {
    const data = storage.getClientData(clientId);
    const events = data.events ?? [];
    const applicants = data.applicants ?? [];

    const targetEvent = events.find((e) => e.id === eventId);
    const nextEvents = events.filter((e) => e.id !== eventId);
    const removedEvent = nextEvents.length !== events.length;

    let updatedApplicant = false;
    let nextApplicants: Applicant[] = applicants;

    if (targetEvent && applicants.some((a) => a.id === applicantId)) {
      const cancelledEntry: CancelledInterview = {
        date: targetEvent.date,
        start: targetEvent.start,
        end: targetEvent.end,
        base: targetEvent.base,
        method: targetEvent.method || '',
        cancelledAt: new Date().toLocaleString('ja-JP'),
      };
      nextApplicants = applicants.map((a) =>
        a.id === applicantId
          ? {
              ...a,
              cancelledInterviews: [...(a.cancelledInterviews || []), cancelledEntry],
            }
          : a,
      );
      updatedApplicant = true;
    }

    if (!removedEvent && !updatedApplicant) {
      return { removedEvent: false, updatedApplicant: false };
    }

    storage.saveClientData(clientId, {
      ...data,
      events: nextEvents,
      applicants: nextApplicants,
    });
    return { removedEvent, updatedApplicant };
  }

  scheduleInterview(
    clientId: string,
    applicantId: number,
    event: Omit<InterviewEvent, 'id'> & Partial<Pick<InterviewEvent, 'id'>>,
    options: { operator: string; reason: 'interview_scheduled' },
  ): ScheduleInterviewResult {
    // H-5: events 追加 + stage 遷移を 1 saveClientData にまとめる。
    //  - 旧実装は this.create + applicantRepository.changeStage の 2 saveClientData だったが、
    //    Firestore 化時の runTransaction 候補として原子性を確保するため単一 save に再構成。
    //  - withStageChange は同一 stage 時に元参照を返すため、`next !== prev` で no-op 判定可能
    //    （履歴汚染なし、stageHistory 重複追加なし）。
    const data = storage.getClientData(clientId);
    const events = data.events ?? [];
    const applicants = data.applicants ?? [];

    // id 採番: 提供された positive number を尊重、なければ max+1（旧 create と同一ロジック）
    const provided =
      typeof event.id === 'number' && Number.isFinite(event.id) && event.id > 0 ? event.id : undefined;
    const nextId = provided ?? events.reduce((mx, e) => Math.max(mx, e.id), 0) + 1;
    const createdEvent: InterviewEvent = { ...event, id: nextId, applicantId };

    // 該当 applicant の stage 遷移（pure helper、same-stage で同参照返却 = no-op）
    //  - 加えて、強い終端状態（filled_received / excluded / hired / rejected / interview_no_show）
    //    と既に interview_confirmed のケース以外は automationStatus も 'interview_confirmed' に進める。
    let nextApplicants: Applicant[] = applicants;
    let updatedApplicant: Applicant | undefined;
    const idx = applicants.findIndex((a) => a.id === applicantId);
    if (idx >= 0) {
      const prev = applicants[idx];
      const staged = withStageChange(prev, '面接確定', {
        operator: options.operator,
        reason: options.reason,
      });
      const shouldUpdateAutomation = canOverwriteAutomationStatusForInterviewConfirmed(
        prev.automationStatus,
      );
      const next: Applicant = shouldUpdateAutomation
        ? { ...staged, automationStatus: 'interview_confirmed' }
        : staged;
      if (next !== prev) {
        nextApplicants = applicants.slice();
        nextApplicants[idx] = next;
        updatedApplicant = next;
      }
    }

    storage.saveClientData(clientId, {
      ...data,
      events: [...events, createdEvent],
      applicants: nextApplicants,
    });

    return { createdEvent, updatedApplicant };
  }
}
