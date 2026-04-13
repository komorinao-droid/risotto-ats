/**
 * ふりがな・カタカナ変換ユーティリティ
 */

const HIRAGANA_START = 0x3041;

const KATAKANA_START = 0x30a1;

/**
 * ひらがなをカタカナに変換
 */
export function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (ch) => {
    return String.fromCharCode(ch.charCodeAt(0) - HIRAGANA_START + KATAKANA_START);
  });
}

/**
 * カタカナをひらがなに変換
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) => {
    return String.fromCharCode(ch.charCodeAt(0) - KATAKANA_START + HIRAGANA_START);
  });
}

/**
 * 文字列がカタカナのみかチェック（スペース・長音符許容）
 */
export function isKatakanaOnly(str: string): boolean {
  if (!str) return false;
  return /^[\u30A0-\u30FF\u3000\s\u30FC]+$/.test(str);
}

/**
 * 文字列がひらがなのみかチェック（スペース・長音符許容）
 */
export function isHiraganaOnly(str: string): boolean {
  if (!str) return false;
  return /^[\u3040-\u309F\u3000\s\u30FC]+$/.test(str);
}

/**
 * ふりがなバリデーション: カタカナのみ許可
 * ひらがなの場合は自動変換して返す
 */
export function normalizeFurigana(input: string): string {
  return hiraganaToKatakana(input.trim());
}
