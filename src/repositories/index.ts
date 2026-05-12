/**
 * Repository シングルトン エクスポート
 *
 * 使い方:
 *   import { clientRepository, clientDataRepository, reportRepository } from '@/repositories';
 *
 * 将来:
 *   バックエンドを差し替える時はここで実装クラスを切り替えるだけで済む。
 *   例) Firestore 移行時:
 *     export const clientRepository = new FirestoreClientRepository();
 *
 * Phase 1 では AuthContext / RecruitmentReport の参照箇所のみが利用する。
 * 他画面は引き続き storage.ts を直接使う（段階移行）。
 */
import { LocalStorageClientRepository } from './localStorage/clientRepository';
import { LocalStorageClientDataRepository } from './localStorage/clientDataRepository';
import { LocalStorageReportRepository } from './localStorage/reportRepository';
import { LocalStorageApplicantRepository } from './localStorage/applicantRepository';
import { LocalStorageMessageRepository } from './localStorage/messageRepository';
import { LocalStorageStatusRepository } from './localStorage/statusRepository';
import { LocalStorageEventRepository } from './localStorage/eventRepository';
import { LocalStorageSlotRepository } from './localStorage/slotRepository';
import { LocalStorageBaseRepository } from './localStorage/baseRepository';
import { LocalStorageJobRepository } from './localStorage/jobRepository';
import { LocalStorageSourceRepository } from './localStorage/sourceRepository';
import { LocalStorageEmailTemplateRepository } from './localStorage/emailTemplateRepository';
import { LocalStorageHearingRepository } from './localStorage/hearingRepository';
import { LocalStorageExclusionRepository } from './localStorage/exclusionRepository';
import { LocalStorageMediaCostRepository } from './localStorage/mediaCostRepository';
import { LocalStorageFilterConditionRepository } from './localStorage/filterConditionRepository';
import { LocalStorageScreeningRepository } from './localStorage/screeningRepository';
import { LocalStorageChatbotRepository } from './localStorage/chatbotRepository';
import { LocalStorageInvoiceRepository } from './localStorage/invoiceRepository';
import type { Client } from '@/types';

export const clientRepository = new LocalStorageClientRepository();
export const clientDataRepository = new LocalStorageClientDataRepository();
export const reportRepository = new LocalStorageReportRepository();
export const applicantRepository = new LocalStorageApplicantRepository();
export const messageRepository = new LocalStorageMessageRepository();
export const statusRepository = new LocalStorageStatusRepository();
export const eventRepository = new LocalStorageEventRepository();
export const slotRepository = new LocalStorageSlotRepository();
export const baseRepository = new LocalStorageBaseRepository();
export const jobRepository = new LocalStorageJobRepository();
export const sourceRepository = new LocalStorageSourceRepository();
export const emailTemplateRepository = new LocalStorageEmailTemplateRepository();
export const hearingRepository = new LocalStorageHearingRepository();
export const exclusionRepository = new LocalStorageExclusionRepository();
export const mediaCostRepository = new LocalStorageMediaCostRepository();
export const filterConditionRepository = new LocalStorageFilterConditionRepository();
export const screeningRepository = new LocalStorageScreeningRepository();
export const chatbotRepository = new LocalStorageChatbotRepository();
export const invoiceRepository = new LocalStorageInvoiceRepository();

/**
 * 子アカウントの場合は親clientId に変換するヘルパ。
 * 現状 AuthContext / RecruitmentReport の両方で同じロジックが重複していたため集約。
 */
export function resolveDataOwnerId(client: Pick<Client, 'id' | 'accountType' | 'parentId'>): string {
  return client.accountType === 'child' && client.parentId ? client.parentId : client.id;
}

export type {
  ClientRepository,
  ClientDataRepository,
  ReportRepository,
  ApplicantRepository,
  MessageRepository,
  StatusRepository,
  EventRepository,
  SlotRepository,
  BaseRepository,
  JobRepository,
  DeleteJobCascadeResult,
  RemoveJobBaseOverrideResult,
  SourceRepository,
  DeleteSourceCascadeResult,
  RemoveSourceBaseOverrideResult,
  EmailTemplateRepository,
  DeleteEmailTemplateResult,
  RemoveEmailTemplateBaseOverrideResult,
  HearingRepository,
  ExclusionRepository,
  ExclusionAddResult,
  MediaCostRepository,
  SaveMediaCostDraftResult,
  RemoveMediaCostSourceResult,
  FilterConditionRepository,
  UpdateFilterConditionResult,
  ScreeningRepository,
  ChatbotRepository,
  InvoiceRepository,
  DeleteBaseCascadeResult,
  BulkStageChangePatch,
  BulkStageChangeOptions,
  BulkStageChangeResult,
  ClearStageForDeletedStatusResult,
  DeleteApplicantResult,
  DeleteClientResult,
  DetachChildBaseNameResult,
  ListEventsByDateRangeParams,
  RemoveEventResult,
  RemoveWithCancelRecordResult,
  ScheduleInterviewResult,
  SlotDayCapacity,
  SlotBulkPatch,
  BulkSetCapacityResult,
  RemoveBaseSlotsResult,
} from './types';
