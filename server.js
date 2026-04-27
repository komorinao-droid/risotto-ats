require('dotenv').config();
const express = require('express');
const path = require('path');

const { screeningHandler } = require('./server/screening/handler');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON ボディパーサ
app.use(express.json({ limit: '1mb' }));

// API: AIスクリーニング
app.post('/api/screen', screeningHandler);

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback: API以外の全パスをindex.htmlに
app.get(/^(?!\/api\/).*$/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
