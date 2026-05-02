require('dotenv').config();
const express = require('express');
const path = require('path');

const { screeningHandler } = require('./server/screening/handler');
const { summaryHandler } = require('./server/reports/summary-handler');
const { apiAuth } = require('./server/middleware/apiAuth');
const { adminAuth } = require('./server/middleware/adminAuth');
const usageLogger = require('./server/lib/usageLogger');

const app = express();
const PORT = process.env.PORT || 3000;

// 基本セキュリティヘッダ
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

// JSON ボディパーサ
app.use(express.json({ limit: '2mb' }));

// API: AIスクリーニング (認証 + レートリミット)
app.post('/api/screen', apiAuth, screeningHandler);

// API: 採用レポートAI要約 (認証 + レートリミット)
app.post('/api/report-summary', apiAuth, summaryHandler);

// 管理画面 API: API 利用状況サマリ
app.get('/api/admin/api-usage', adminAuth, (req, res) => {
  const yearMonth = typeof req.query.yearMonth === 'string' ? req.query.yearMonth : undefined;
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;
  return res.json(usageLogger.summarize({ yearMonth, clientId }));
});

// 管理画面 API: 直近の API 呼び出しログ
app.get('/api/admin/api-usage/recent', adminAuth, (req, res) => {
  const limit = Number(req.query.limit) || 100;
  return res.json({ entries: usageLogger.recent(limit) });
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback: API以外の全パスをindex.htmlに
app.get(/^(?!\/api\/).*$/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
