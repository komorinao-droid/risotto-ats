/**
 * 拠点×職種 募集状況 (RecruitmentOpening) 周辺の共通ヘルパ。
 *
 * 本ファイル (Step 1) で提供するのは natural key 生成だけ。
 * Step 2 で `isOpeningFilled` などの判定ヘルパを追加予定。
 *
 * id を Firestore doc id と兼ねるため、LocalStorage 実装と将来の Firestore 実装で
 * 同じエンコーディング規約を共有する。
 *
 * rename カスケードに関するメモ (Step 1, 2026-05):
 *  - 本 Step では拠点・職種の **delete cascade** のみ実装している
 *    (`baseRepository.deleteWithCascade` / `jobRepository.deleteWithCascade`)
 *  - rename cascade は既存 `baseRepository.update` / `jobRepository.update` が
 *    `applicants[].base` / `jobsByBase[oldName]` 等の追従も実装していないため、
 *    本 Repository だけ rename 追従を入れると逆に不整合になりかねない。
 *    既存全体の rename 方針と合わせて別タスクとして扱う。
 *  - Firestore 化時は `makeOpeningId` の戻り値がそのまま doc id になるため、
 *    rename は「旧 id の doc を delete + 新 id で create」をトランザクションで
 *    実行する必要がある（フィールド更新だけでは doc id を変えられない）。
 */

/**
 * 拠点名と職種名から RecruitmentOpening の natural key を生成する。
 *
 * 採用方針:
 *  - `encodeURIComponent` で日本語・スペース・記号を percent-encode（小文字化したうえで）
 *  - 拠点名と職種名は `__` 区切りで連結
 *  - これにより:
 *      1. 日本語名でも空文字にならない（"東京本社" → "%e6%9d%b1%e4%ba%ac%e6%9c%ac%e7%a4%be"）
 *      2. `/` `#` `?` 等 Firestore doc path で問題になる文字も percent-encode される
 *      3. 同じ (baseName, jobName) ペアは常に同じ id にエンコードされる（決定的）
 *      4. `trim` 済みのため先頭末尾の空白差分は吸収（"東京本社 " === "東京本社"）
 *
 * 例:
 *   makeOpeningId("Tokyo", "Sales")      → "tokyo__sales"
 *   makeOpeningId("東京本社", "営業職")  → "%e6%9d%b1%e4%ba%ac%e6%9c%ac%e7%a4%be__%e5%96%b6%e6%a5%ad%e8%81%b7"
 *   makeOpeningId("Sales/CS", "PM")      → "sales%2fcs__pm"
 *
 * Firestore マッピング:
 *  - clients/{clientId}/recruitmentOpenings/{openingId}
 *  - openingId は本関数の戻り値をそのまま使用
 *  - Firestore doc id の最大長 1500 バイト制限内に十分収まる（拠点名 + 職種名が現実的な長さで）
 */
export function makeOpeningId(baseName: string, jobName: string): string {
  const encode = (value: string) => encodeURIComponent(value.trim().toLowerCase());
  return `${encode(baseName)}__${encode(jobName)}`;
}
