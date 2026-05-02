/**
 * 運営管理画面（super 管理者）用のサーバー認証ミドルウェア。
 *
 * apiAuth はクライアントテナント用。これは運営側が API コスト集計などを取得するための別経路。
 *
 * - 必須環境変数 ADMIN_API_SECRET（未設定時は dev 限定で通す）
 * - リクエストヘッダ x-admin-secret に同値を入れる
 * - フロントは管理画面ログイン後に sessionStorage に保管された値を都度ヘッダ付与
 * - clientId は不要
 */

function adminAuth(req, res, next) {
  // 専用 ADMIN_API_SECRET があればそれを優先。なければ API_SHARED_SECRET にフォールバック
  // （運営画面とテナントは別シークレットを推奨だが、最小構成では共通でも可）
  const expected = process.env.ADMIN_API_SECRET || process.env.API_SHARED_SECRET;
  const provided = req.headers['x-admin-secret'] || req.headers['x-api-secret'];

  if (!expected) {
    console.warn('[admin-auth] ADMIN_API_SECRET / API_SHARED_SECRET is not set. Endpoint is unprotected (dev mode).');
  } else if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin secret' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 1 * 1024 * 1024) {
    return res.status(413).json({ error: 'Request body too large' });
  }

  console.log(`[admin-auth] OK ${req.method} ${req.path}`);
  next();
}

module.exports = { adminAuth };
