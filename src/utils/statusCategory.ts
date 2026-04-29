/**
 * ステータス名 → 分類タグの解決ユーティリティ
 *
 * Status.category が設定されていればそれを使う。未設定の場合は
 * 名前から正規表現で推定する（既存データの後方互換）。
 */
import type { Status, StatusCategory } from '@/types';

/** 名前から分類タグを推定（後方互換用フォールバック） */
export function inferCategoryFromName(name: string | undefined | null): StatusCategory {
  if (!name) return 'screening';
  // 順序重要: 「内定承諾」は「内定」より先に判定する
  if (/稼働|入社/.test(name)) return 'active';
  if (/採用|内定承諾|内定【承諾】|面接合格|研没/.test(name)) return 'hired';
  if (/内定/.test(name)) return 'offered';
  if (/不合格|対象外|条件不一致|連絡不通|重複|辞退/.test(name)) return 'ng';
  if (/面接/.test(name)) return 'interview';
  return 'screening';
}

/** statuses 設定を引いて分類タグを返す。未設定/未登録なら名前から推定。 */
export function getStatusCategory(stageName: string | undefined | null, statuses: Status[] | undefined): StatusCategory {
  if (!stageName) return 'screening';
  if (statuses && statuses.length) {
    const s = statuses.find((st) => st.name === stageName);
    if (s?.category) return s.category;
  }
  return inferCategoryFromName(stageName);
}

/** 分類タグの日本語ラベル */
export function categoryLabel(c: StatusCategory): string {
  return {
    screening: '選考中',
    interview: '面接',
    offered: '内定',
    hired: '採用',
    active: '稼働',
    ng: 'NG・辞退',
  }[c];
}

export const ALL_CATEGORIES: StatusCategory[] = ['screening', 'interview', 'offered', 'hired', 'active', 'ng'];
