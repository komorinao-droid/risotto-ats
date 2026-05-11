/**
 * 応募者の分析用メタ情報を扱う純粋関数群。
 *
 * 方針:
 *  - localStorage への一括書き込み（マイグレーション）は行わない
 *  - 補完は in-memory のみ。永続化は「更新が発生したタイミング」に自然に乗せる
 *  - 既存データ (createdAt 等が無い応募者) でも壊れないこと
 *
 * 使い方:
 *  - 新規作成:    withCreatedMeta(applicant)
 *  - 任意更新:    withUpdatedMeta(applicant)
 *  - ステージ変更: withStageChange(applicant, toStage, { operator, reason })
 *  - 読み取り補完: inferCreatedAt(applicant)
 */
import type { Applicant, StageChangeReason, StageHistoryEntry } from '@/types';

const nowIso = (): string => new Date().toISOString();

/**
 * `Applicant.date` (YYYY-MM-DD) を ISO 8601 に正規化する。
 * 失敗したら null。
 */
function dateStringToIso(date: string | undefined): string | null {
  if (!date) return null;
  // YYYY-MM-DD と判定できる形式のみ受け付ける（無効値で Invalid Date を返さない）
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const t = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/**
 * createdAt を推定する。優先順:
 *  1. applicant.createdAt が ISO 8601 として有効ならそれを返す
 *  2. applicant.date を ISO に変換できればそれを返す
 *  3. 現在時刻
 */
export function inferCreatedAt(applicant: Pick<Applicant, 'createdAt' | 'date'>): string {
  if (applicant.createdAt && !Number.isNaN(Date.parse(applicant.createdAt))) {
    return applicant.createdAt;
  }
  const fromDate = dateStringToIso(applicant.date);
  if (fromDate) return fromDate;
  return nowIso();
}

/**
 * stageChangedAt を推定する。
 * 既存値があればそれを、なければ stageHistory の最終エントリ、なければ createdAt 推定値を返す。
 */
export function inferStageChangedAt(applicant: Pick<Applicant, 'stageChangedAt' | 'stageHistory' | 'createdAt' | 'date'>): string {
  if (applicant.stageChangedAt && !Number.isNaN(Date.parse(applicant.stageChangedAt))) {
    return applicant.stageChangedAt;
  }
  const hist = applicant.stageHistory;
  if (hist && hist.length > 0) {
    const last = hist[hist.length - 1];
    if (last?.changedAt && !Number.isNaN(Date.parse(last.changedAt))) {
      return last.changedAt;
    }
  }
  return inferCreatedAt(applicant);
}

/**
 * 新規作成時のメタ情報を付与。createdAt/updatedAt/stageChangedAt がまだ無ければセット。
 * 既存値は尊重する（破壊しない）。
 */
export function withCreatedMeta<T extends Applicant>(applicant: T): T {
  const created = inferCreatedAt(applicant);
  return {
    ...applicant,
    createdAt: applicant.createdAt ?? created,
    updatedAt: applicant.updatedAt ?? created,
    stageChangedAt: applicant.stageChangedAt ?? created,
  };
}

/**
 * 任意更新時に updatedAt を現在時刻に更新する。
 * createdAt が未設定なら同タイミングで補完する（自然補完）。
 */
export function withUpdatedMeta<T extends Applicant>(applicant: T): T {
  const now = nowIso();
  const next: T = { ...applicant, updatedAt: now };
  if (!next.createdAt) {
    next.createdAt = inferCreatedAt(applicant);
  }
  return next;
}

export interface ContactMetaOptions {
  /** 連絡時刻 (ISO 8601)。未指定なら現在時刻。 */
  contactedAt?: string;
  /**
   * 連絡試行回数の増分。デフォルト 1。
   * inbound（応募者からの返信）でカウントしたくない場合は 0 を渡す。
   */
  attemptIncrement?: number;
}

/**
 * 連絡メタ情報を更新する純粋関数（2026-05 追加）。
 *
 * 動作:
 *  - firstContactedAt が未設定なら今回の contactedAt をセット
 *  - lastContactedAt は常に最新で上書き
 *  - contactAttemptCount は attemptIncrement（既定 1）だけ増やす
 *  - updatedAt も同時に更新
 *
 * 想定呼び出しタイミング:
 *  - 送信ログ作成時（messageRepository.create の outbound ログ確定時）
 *  - 既存画面への適用は段階的（呼び出し側責務）
 */
export function withContactMeta<T extends Applicant>(applicant: T, opts: ContactMetaOptions = {}): T {
  const at = opts.contactedAt ?? nowIso();
  const inc = opts.attemptIncrement ?? 1;
  const prevCount = applicant.contactAttemptCount ?? 0;
  return {
    ...applicant,
    firstContactedAt: applicant.firstContactedAt ?? at,
    lastContactedAt: at,
    contactAttemptCount: prevCount + inc,
    updatedAt: at,
  };
}

export interface StageChangeOptions {
  /** 操作者表示名 */
  operator?: string;
  /**
   * 変更理由。指定された場合のみ stageHistory のエントリに記録される。
   * 既存の単一手動経路はまだ未指定のため、フィールドは optional のまま。
   */
  reason?: StageChangeReason;
  /** タイムスタンプ上書き（テスト等用途） */
  changedAt?: string;
}

/**
 * ステータス変更を反映する。
 *
 * 動作:
 *  - 既存 ApplicantDetail.handleStatusChange の挙動を踏襲しつつ、
 *    `fromStage / toStage / operator / reason` を任意で記録できるようにする
 *  - stage が変わらない呼び出しでは applicant をそのまま返す
 *  - stageHistory が空 かつ 既存 stage がある場合は初期エントリを補完
 *  - stageChangedAt / updatedAt も同時に更新
 */
export function withStageChange<T extends Applicant>(applicant: T, toStage: string, opts: StageChangeOptions = {}): T {
  const fromStage = applicant.stage;
  if (fromStage === toStage) return applicant;
  const changedAt = opts.changedAt ?? nowIso();
  const history: StageHistoryEntry[] = [...(applicant.stageHistory || [])];
  // 既存挙動互換: 履歴が空なら、応募日 (date) を起点に旧 stage を1件積む
  if (history.length === 0 && fromStage) {
    const initial = dateStringToIso(applicant.date) ?? changedAt;
    history.push({ stage: fromStage, changedAt: initial });
  }
  const entry: StageHistoryEntry = {
    stage: toStage,
    changedAt,
  };
  if (fromStage) entry.fromStage = fromStage;
  entry.toStage = toStage;
  if (opts.operator) entry.operator = opts.operator;
  if (opts.reason) entry.reason = opts.reason;
  history.push(entry);
  const created = applicant.createdAt ?? inferCreatedAt(applicant);
  return {
    ...applicant,
    stage: toStage,
    subStatus: '',
    stageHistory: history,
    stageChangedAt: changedAt,
    updatedAt: changedAt,
    createdAt: created,
  };
}
