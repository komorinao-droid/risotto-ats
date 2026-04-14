import { useEffect, useRef } from 'react';
import { getSnapshotConfig, getSnapshots, takeSnapshot } from '@/utils/storage';

/**
 * 毎日指定時刻に自動スナップショットを保存するフック
 * - アプリ起動時に当日スナップショット未保存かつ指定時刻を過ぎていれば即保存
 * - 以降は1分ごとに時刻チェック
 */
export function useDailySnapshotScheduler(clientId: string) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!clientId) return;

    const tryAutoSave = () => {
      const config = getSnapshotConfig(clientId);
      if (!config.enabled) return;

      const now = new Date();
      const [schedH, schedM] = config.scheduleTime.split(':').map(Number);
      const today = now.toISOString().slice(0, 10);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const schedMinutes = schedH * 60 + schedM;

      if (nowMinutes < schedMinutes) return;

      // 今日のスナップショットが既に存在するか確認
      const existing = getSnapshots(clientId);
      const todayExists = existing.some(s => s.date === today);
      if (todayExists) return;

      // 保存実行
      takeSnapshot(clientId);
      console.info(`[RISOTTO] 日次スナップショット保存: ${today}`);
    };

    // 起動時に即チェック
    tryAutoSave();

    // 1分ごとに再チェック
    timerRef.current = setInterval(tryAutoSave, 60 * 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [clientId]);
}
