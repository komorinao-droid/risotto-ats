import type { ScoringAxis, ScreeningCriteriaBody } from '@/types';

/** ユニークID生成（時刻+乱数） */
export function genId(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** デフォルト5軸 */
export function defaultAxes(): ScoringAxis[] {
  return [
    {
      id: genId('ax_'),
      name: '経験・スキル',
      description: '職務経験、専門スキル、業界知識',
      weight: 30,
      guidance: '',
      requirements: [],
      preferences: [],
      avoidances: [],
    },
    {
      id: genId('ax_'),
      name: 'カルチャーフィット',
      description: '価値観、コミュニケーション、チームワーク',
      weight: 25,
      guidance: '',
      requirements: [],
      preferences: [],
      avoidances: [],
    },
    {
      id: genId('ax_'),
      name: '通勤・条件',
      description: '勤務地・稼働日数・希望条件のマッチ度',
      weight: 15,
      guidance: '',
      requirements: [],
      preferences: [],
      avoidances: [],
    },
    {
      id: genId('ax_'),
      name: '志望度・意欲',
      description: '応募の本気度、入社意欲',
      weight: 15,
      guidance: '',
      requirements: [],
      preferences: [],
      avoidances: [],
    },
    {
      id: genId('ax_'),
      name: '将来性・成長',
      description: 'ポテンシャル、長期就業の見込み',
      weight: 15,
      guidance: '',
      requirements: [],
      preferences: [],
      avoidances: [],
    },
  ];
}

/**
 * v1 (フリーテキスト3項目) → v2 (多軸) へのマイグレーション
 * - 既存のフリーテキストを「全体評価軸」1つに集約して開始ポイントとする
 * - クライアントが「軸を分割」する前のソフトランディング
 */
export function migrateToAxes(body: ScreeningCriteriaBody): ScoringAxis[] {
  if (body.axes && body.axes.length > 0) return body.axes;

  // フリーテキストがある場合は1軸にまとめて移行
  const hasV1Content = body.evaluationPoints || body.requiredQualities || body.ngQualities;
  if (hasV1Content) {
    return [
      {
        id: genId('ax_'),
        name: '総合評価',
        description: '旧形式から自動移行された統合軸',
        weight: 100,
        guidance: body.evaluationPoints || '',
        requirements: body.requiredQualities
          ? [
              {
                id: genId('it_'),
                label: body.requiredQualities,
                type: 'text',
                textValue: body.requiredQualities,
              },
            ]
          : [],
        preferences: [],
        avoidances: body.ngQualities
          ? [
              {
                id: genId('it_'),
                label: body.ngQualities,
                type: 'text',
                importance: 3,
                textValue: body.ngQualities,
              },
            ]
          : [],
      },
    ];
  }

  return defaultAxes();
}

/** ウェイト合計が100になるように正規化 */
export function normalizeWeights(axes: ScoringAxis[]): ScoringAxis[] {
  const total = axes.reduce((s, a) => s + (a.weight || 0), 0);
  if (total === 0 || total === 100) return axes;
  return axes.map((a) => ({ ...a, weight: Math.round((a.weight / total) * 100) }));
}

/** 重要度のラベル化 */
export function importanceLabel(imp?: number): string {
  if (imp === 3) return '★★★';
  if (imp === 2) return '★★';
  if (imp === 1) return '★';
  return '★';
}
