require('dotenv').config();
const express = require('express');
const path = require('path');

const { screeningHandler } = require('./server/screening/handler');
const { summaryHandler } = require('./server/reports/summary-handler');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON ボディパーサ
app.use(express.json({ limit: '2mb' }));

// API: AIスクリーニング
app.post('/api/screen', screeningHandler);

// API: 採用レポートAI要約
app.post('/api/report-summary', summaryHandler);

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback: API以外の全パスをindex.htmlに
app.get(/^(?!\/api\/).*$/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
