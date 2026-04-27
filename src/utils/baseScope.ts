import type { ClientData, Job, Source, EmailTemplate, ScreeningCriteria } from '@/types';

/**
 * 拠点別オーバーライドの解決ヘルパー（継承モデル）
 *
 * - baseName が指定され、拠点別レイヤに値があればそれを返す
 * - そうでなければ全社共通を返す
 *
 * 親アカウント（baseName 未指定）は常に全社共通を使う前提。
 * 子アカウントは自拠点の baseName を渡して読む。
 */

export function resolveJobs(data: ClientData, baseName?: string): Job[] {
  if (baseName && data.jobsByBase?.[baseName]) {
    return data.jobsByBase[baseName];
  }
  return data.jobs || [];
}

export function resolveSources(data: ClientData, baseName?: string): Source[] {
  if (baseName && data.sourcesByBase?.[baseName]) {
    return data.sourcesByBase[baseName];
  }
  return data.sources || [];
}

export function resolveEmailTemplates(data: ClientData, baseName?: string): EmailTemplate[] {
  if (baseName && data.emailTemplatesByBase?.[baseName]) {
    return data.emailTemplatesByBase[baseName];
  }
  return data.emailTemplates || [];
}

/** 拠点別オーバーライドが存在するか */
export function hasJobsOverride(data: ClientData, baseName: string): boolean {
  return !!data.jobsByBase?.[baseName];
}
export function hasSourcesOverride(data: ClientData, baseName: string): boolean {
  return !!data.sourcesByBase?.[baseName];
}
export function hasEmailTemplatesOverride(data: ClientData, baseName: string): boolean {
  return !!data.emailTemplatesByBase?.[baseName];
}

/**
 * AIスクリーニング基準を職種スコープで解決
 * - jobName が指定され、その職種のオーバーライドがあれば本文3項目を差し替え
 * - enabled / passThreshold / rejectThreshold は常に全社共通
 */
export function resolveScreeningCriteria(
  criteria: ScreeningCriteria | undefined,
  jobName?: string
): ScreeningCriteria | null {
  if (!criteria) return null;
  if (jobName && criteria.byJob?.[jobName]) {
    const o = criteria.byJob[jobName];
    return {
      ...criteria,
      evaluationPoints: o.evaluationPoints,
      requiredQualities: o.requiredQualities,
      ngQualities: o.ngQualities,
    };
  }
  return criteria;
}

export function hasScreeningJobOverride(criteria: ScreeningCriteria | undefined, jobName: string): boolean {
  return !!criteria?.byJob?.[jobName];
}
