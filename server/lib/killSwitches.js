/**
 * 機能キルスイッチストア（運営側からの緊急停止フラグ）。
 *
 * - データ: { [clientId]: { aiScreening?: bool, recruitmentReport?: bool, ... } }
 * - 永続化: KILLSWITCHES_PATH（Railway Volume 想定 `/data/kill-switches.json`）
 *   未設定時はメモリのみ（dev / preview 互換）
 * - メモリキャッシュ常駐。書き込み時に都度ファイル全置換（小さいので OK）
 *
 * 使い方:
 *   const { isFeatureKilled, getAll, setForClient, featureGate } = require('./killSwitches');
 *   app.post('/api/screen', apiAuth, featureGate('aiScreening'), screeningHandler);
 */

const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.KILLSWITCHES_PATH || '';

/** @type {Record<string, Record<string, boolean>>} */
let store = {};

function loadFromDisk() {
  if (!STORE_PATH) return;
  try {
    if (!fs.existsSync(STORE_PATH)) {
      const dir = path.dirname(STORE_PATH);
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return;
    }
    const text = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(text || '{}');
    if (parsed && typeof parsed === 'object') store = parsed;
    console.log(`[killSwitches] loaded ${Object.keys(store).length} clients from ${STORE_PATH}`);
  } catch (e) {
    console.warn(`[killSwitches] failed to load ${STORE_PATH}: ${e && e.message}`);
  }
}

function saveToDisk() {
  if (!STORE_PATH) return;
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[killSwitches] failed to save ${STORE_PATH}: ${e && e.message}`);
  }
}

loadFromDisk();

/** クライアントの全フラグを取得（無ければ空オブジェクト） */
function getForClient(clientId) {
  return { ...(store[clientId] || {}) };
}

/** 全クライアントぶん（運営画面表示用） */
function getAll() {
  return JSON.parse(JSON.stringify(store));
}

/** 1 機能のキル状態を判定 */
function isFeatureKilled(clientId, featureKey) {
  if (!clientId || !featureKey) return false;
  const flags = store[clientId];
  return Boolean(flags && flags[featureKey]);
}

/**
 * クライアント分のフラグを上書き保存。
 * @param {string} clientId
 * @param {Record<string, boolean>} flags
 */
function setForClient(clientId, flags) {
  if (!clientId || typeof clientId !== 'string') throw new Error('clientId required');
  const sanitized = {};
  if (flags && typeof flags === 'object') {
    for (const k of Object.keys(flags)) {
      sanitized[k] = Boolean(flags[k]);
    }
  }
  store[clientId] = sanitized;
  saveToDisk();
  return getForClient(clientId);
}

/**
 * Express ミドルウェア。指定機能が kill されていれば 503 で即返す。
 * apiAuth の後段に挟む想定（req.body.clientId / x-client-id を見る）。
 */
function featureGate(featureKey) {
  return function (req, res, next) {
    const clientId = (req.body && req.body.clientId) || req.headers['x-client-id'];
    if (clientId && isFeatureKilled(clientId, featureKey)) {
      console.warn(`[killSwitches] blocked ${featureKey} for client=${clientId}`);
      return res.status(503).json({
        error: `Feature "${featureKey}" is temporarily disabled by operator`,
        feature: featureKey,
        code: 'FEATURE_KILLED',
      });
    }
    next();
  };
}

module.exports = {
  getForClient,
  getAll,
  isFeatureKilled,
  setForClient,
  featureGate,
  storePath: STORE_PATH || null,
};
