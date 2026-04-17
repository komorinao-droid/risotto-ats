import type { ClientOperationLog } from '@/types';

const MAX_LOGS = 1000;

const logKey = (clientId: string) => `hireflow:client:${clientId}:logs`;

export function getClientLogs(clientId: string): ClientOperationLog[] {
  try {
    const raw = localStorage.getItem(logKey(clientId));
    return raw ? (JSON.parse(raw) as ClientOperationLog[]) : [];
  } catch {
    return [];
  }
}

export function saveClientLogs(clientId: string, logs: ClientOperationLog[]) {
  localStorage.setItem(logKey(clientId), JSON.stringify(logs.slice(0, MAX_LOGS)));
}

export function pushClientLog(
  clientId: string,
  entry: Omit<ClientOperationLog, 'id' | 'timestamp'>
) {
  const logs = getClientLogs(clientId);
  logs.unshift({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  saveClientLogs(clientId, logs);
}

export function clearClientLogs(clientId: string) {
  localStorage.removeItem(logKey(clientId));
}

export function formatLogTimestamp(ts: string): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
