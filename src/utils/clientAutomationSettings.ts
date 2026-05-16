/**
 * クライアント別の自動処理設定 helper (2026-05 Step 6-A 追加)。
 *
 * 現状の対象: 「反応なし判定日数」(`Client.noResponseThresholdDays`)。
 *  - 値は 1〜30 日。未設定の場合は表示上 3 日扱い。
 *  - 既存データに勝手に値を書かない（normalize は read 経路のみ）。
 *  - Step 6-B 以降の no_response 自動付与で本 helper を共有する。
 */

export const DEFAULT_NO_RESPONSE_THRESHOLD_DAYS = 3;
export const MIN_NO_RESPONSE_THRESHOLD_DAYS = 1;
export const MAX_NO_RESPONSE_THRESHOLD_DAYS = 30;

/** UI の select options。運用ミス低減のため離散値を提示する。 */
export const NO_RESPONSE_THRESHOLD_DAYS_OPTIONS: number[] = [1, 2, 3, 5, 7, 10, 14, 30];

/**
 * 任意入力値を 1〜30 の整数にクランプ。
 *  - 数値化できない / NaN / Infinity は DEFAULT にフォールバック
 *  - 小数は `trunc` で切り捨て
 *  - 範囲外は min/max にクランプ
 */
export function normalizeNoResponseThresholdDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_NO_RESPONSE_THRESHOLD_DAYS;
  const truncated = Math.trunc(n);
  return Math.min(
    MAX_NO_RESPONSE_THRESHOLD_DAYS,
    Math.max(MIN_NO_RESPONSE_THRESHOLD_DAYS, truncated),
  );
}

/**
 * Client 風オブジェクトから反応なし判定日数を取り出す。
 * 未設定 / 不正値は DEFAULT にフォールバックする。
 */
export function getNoResponseThresholdDays(
  client: { noResponseThresholdDays?: number } | null | undefined,
): number {
  if (!client || client.noResponseThresholdDays == null) {
    return DEFAULT_NO_RESPONSE_THRESHOLD_DAYS;
  }
  return normalizeNoResponseThresholdDays(client.noResponseThresholdDays);
}
