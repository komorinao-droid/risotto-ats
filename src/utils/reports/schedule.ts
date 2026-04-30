/**
 * レポート定期配信のスケジュール計算
 */
import type { ReportScheduleSetting } from '@/types';

/** 次回の配信予定日時を計算 */
export function nextScheduledRun(setting: ReportScheduleSetting | undefined, from = new Date()): Date | null {
  if (!setting || !setting.enabled) return null;
  const [hh, mm] = (setting.time || '09:00').split(':').map(Number);

  if (setting.frequency === 'monthly') {
    const day = setting.dayOfMonth || 1;
    const candidate = new Date(from.getFullYear(), from.getMonth(), day, hh, mm, 0);
    if (candidate <= from) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    return candidate;
  }

  if (setting.frequency === 'weekly' || setting.frequency === 'biweekly') {
    const targetDow = setting.dayOfWeek ?? 1; // 月曜デフォルト
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hh, mm, 0);
    let daysAhead = (targetDow - candidate.getDay() + 7) % 7;
    if (daysAhead === 0 && candidate <= from) daysAhead = 7;
    candidate.setDate(candidate.getDate() + daysAhead);
    if (setting.frequency === 'biweekly' && setting.lastRunAt) {
      // 前回配信から14日以上空いているか
      const last = new Date(setting.lastRunAt);
      const elapsedDays = Math.floor((candidate.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
      if (elapsedDays < 14) {
        candidate.setDate(candidate.getDate() + 7);
      }
    }
    return candidate;
  }

  return null;
}

/** 人間に読みやすい配信頻度ラベル */
export function frequencyLabel(setting: ReportScheduleSetting): string {
  const time = setting.time || '09:00';
  if (setting.frequency === 'monthly') {
    return `毎月${setting.dayOfMonth || 1}日 ${time}`;
  }
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  const dow = dows[setting.dayOfWeek ?? 1];
  if (setting.frequency === 'weekly') return `毎週${dow}曜日 ${time}`;
  return `隔週${dow}曜日 ${time}`;
}

const RANGE_LABELS = {
  lastMonth: '先月',
  lastQuarter: '前四半期',
  lastHalf: '前期(半期)',
};

export function rangePresetLabel(preset: ReportScheduleSetting['rangePreset']): string {
  return RANGE_LABELS[preset];
}
