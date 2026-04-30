/**
 * API 認証 + レートリミット ミドルウェア
 *
 * 設計:
 *  - 共有秘密 API_SHARED_SECRET をリクエストヘッダ x-api-secret で受け取る
 *  - フロント側はビルド時に環境変数 VITE_API_SECRET 経由で同じ値を埋め込む
 *  - シークレット未設定時はワーニングを出して開発のみ通す（本番では必須）
 *  - クライアントID毎に直近1分間で30リクエストまでに制限（簡易メモリ実装）
 *
 * 注意:
 *  - localStorage は誰でも参照可能なので「完全な認証」ではないが、
 *    無制限な curl 攻撃を防ぐ最低限の対策として機能する
 *  - 将来的には Supabase JWT などへの移行を想定
 */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 30;

// クライアントID毎のリクエストタイムスタンプ配列
const rateBuckets = new Map(); // key: clientId, value: number[]

function checkRateLimit(clientId) {
  if (!clientId) return true; // 後段でreject
  const now = Date.now();
  const arr = (rateBuckets.get(clientId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(clientId, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(clientId, arr);
  return true;
}

function apiAuth(req, res, next) {
  const expectedSecret = process.env.API_SHARED_SECRET;
  const providedSecret = req.headers['x-api-secret'];

  // シークレット未設定環境では警告のみ（開発時の利便性）
  if (!expectedSecret) {
    console.warn('[api-auth] API_SHARED_SECRET is not set. Endpoint is unprotected (dev mode).');
  } else if (providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized: invalid API secret' });
  }

  // clientId 必須
  const clientId = (req.body && req.body.clientId) || req.headers['x-client-id'];
  if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
    return res.status(400).json({ error: 'clientId is required (in body or x-client-id header)' });
  }

  // レートリミット
  if (!checkRateLimit(clientId)) {
    return res.status(429).json({ error: `Rate limit exceeded: max ${RATE_MAX_PER_WINDOW} req/min per client` });
  }

  // リクエスト本文サイズチェック (express.json の limit:2mb と二重)
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'Request body too large' });
  }

  // PII漏洩防止: ログには clientId と endpoint だけ出す（本文は出さない）
  console.log(`[api-auth] OK ${req.method} ${req.path} client=${clientId}`);

  next();
}

module.exports = { apiAuth };
