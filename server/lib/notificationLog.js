/**
 * 通知ログ（Email / Webhook 等の送信記録の受け皿）。
 *
 * 本コミット時点では送信機能本体が無いので、ログ書き込みの API/受け皿だけを
 * 用意して将来の埋め込みに備える。
 *
 * - メモリリングバッファ + JSONL 永続化（usageLogger と同じパターン）
 * - NOTIFICATIONS_LOG_PATH（Railway Volume `/data/notifications.jsonl` 想定）
 * - 未設定なら永続化スキップ（dev/preview 互換）
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 5000;
const LOG_PATH = process.env.NOTIFICATIONS_LOG_PATH || '';

/** @type {Array<{id:number,createdAt:string,type:'email'|'webhook'|'sms',clientId?:string,target?:string,subject?:string,status:'success'|'failed',errorMessage?:string,meta?:object}>} */
const buffer = [];
let nextId = 1;

function loadFromDisk() {
  if (!LOG_PATH) return;
  try {
    if (!fs.existsSync(LOG_PATH)) {
      const dir = path.dirname(LOG_PATH);
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return;
    }
    const text = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = text.split('\n').filter((l) => l.trim());
    const recent = lines.slice(-MAX_ENTRIES);
    let maxId = 0;
    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry.id === 'number') {
          buffer.push(entry);
          if (entry.id > maxId) maxId = entry.id;
        }
      } catch { /* skip broken line */ }
    }
    if (maxId > 0) nextId = maxId + 1;
    console.log(`[notificationLog] loaded ${buffer.length} entries from ${LOG_PATH}`);
  } catch (e) {
    console.warn(`[notificationLog] failed to load ${LOG_PATH}: ${e && e.message}`);
  }
}

function appendDisk(entry) {
  if (!LOG_PATH) return;
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    console.warn(`[notificationLog] failed to append: ${e && e.message}`);
  }
}

loadFromDisk();

/**
 * ログを 1 件記録する。
 * @param {{type:'email'|'webhook'|'sms',clientId?:string,target?:string,subject?:string,status:'success'|'failed',errorMessage?:string,meta?:object}} payload
 */
function record(payload) {
  if (!payload || !payload.type || !payload.status) {
    throw new Error('type and status are required');
  }
  const entry = {
    id: nextId++,
    createdAt: new Date().toISOString(),
    type: payload.type,
    clientId: payload.clientId || undefined,
    target: payload.target || undefined,
    subject: payload.subject || undefined,
    status: payload.status,
    errorMessage: payload.errorMessage || undefined,
    meta: payload.meta || undefined,
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  appendDisk(entry);
  return entry;
}

/** 直近 N 件を新しい順で返す（type フィルタ対応） */
function recent(limit = 100, type) {
  let arr = buffer;
  if (type) arr = arr.filter((e) => e.type === type);
  return arr.slice(-limit).reverse();
}

/** type ごとの件数 + 失敗数集計（簡易） */
function summary() {
  const out = { total: buffer.length, byType: {} };
  for (const e of buffer) {
    if (!out.byType[e.type]) out.byType[e.type] = { total: 0, failed: 0 };
    out.byType[e.type].total += 1;
    if (e.status === 'failed') out.byType[e.type].failed += 1;
  }
  return out;
}

module.exports = {
  record,
  recent,
  summary,
  storePath: LOG_PATH || null,
};
