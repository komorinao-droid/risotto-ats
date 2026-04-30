/**
 * 認証付き API クライアント
 *
 * - X-API-SECRET (Vite環境変数 VITE_API_SECRET) を付与
 * - クライアントID を body と header に付与してサーバ側のレートリミット用に
 * - 全API呼び出しはこのヘルパ経由にする
 */

const API_SECRET = (import.meta as any).env?.VITE_API_SECRET as string | undefined;

export interface ApiOptions {
  clientId: string;
  body: Record<string, any>;
  signal?: AbortSignal;
}

export async function apiPost<T = any>(path: string, opts: ApiOptions): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Id': opts.clientId,
  };
  if (API_SECRET) {
    headers['X-API-Secret'] = API_SECRET;
  }

  const resp = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...opts.body, clientId: opts.clientId }),
    signal: opts.signal,
  });

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const data = await resp.json();
      errMsg = data.error || errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  return resp.json();
}
