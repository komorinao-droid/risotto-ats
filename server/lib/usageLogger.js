/**
 * Anthropic API 利用ログ（サーバー内メモリのリングバッファ + JSONL 永続化）。
 *
 * - メイン: メモリ上のリングバッファ。集計・APIレスポンスはここから生成（高速）
 * - 永続化: USAGE_LOG_PATH が指定されていれば毎件 append（Railway Volume 想定）
 *   起動時に同ファイルから直近 MAX_ENTRIES を読み込んでメモリを復元する
 * - USAGE_LOG_PATH 未設定だと永続化スキップ（dev/preview 互換）
 *
 * 価格表は 2026-01 時点の参考値。実コストは Anthropic Console を一次情報に。
 */

const fs = require('fs');
const path = require('path');

/**
 * 1 リング内の最大件数。1 件あたり ~600B 想定で 5000 件 ≒ 3MB。
 */
const MAX_ENTRIES = 5000;

/**
 * 価格表（USD per 1M tokens）。新モデル追加時はここを増やす。
 * 出典: https://www.anthropic.com/pricing#api （適宜更新）
 */
const PRICE_TABLE = {
  // Claude Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  // Claude Sonnet 4.6
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  // Claude Opus 4.6
  'claude-opus-4-6': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
};

const DEFAULT_PRICE = { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };

/** @type {Array<import('./usageTypes').ApiCallLog>} */
const buffer = [];
let nextId = 1;

/** 永続化先（環境変数で制御）。Railway Volume では `/data/api-usage.jsonl` 等を指定する想定 */
const LOG_PATH = process.env.USAGE_LOG_PATH || '';

/**
 * 起動時にファイルから直近 MAX_ENTRIES 件を読み込んでメモリを復元する。
 * 失敗しても起動は続ける（破損ログのスキップ）。
 */
function loadFromDisk() {
  if (!LOG_PATH) return;
  try {
    if (!fs.existsSync(LOG_PATH)) {
      // 親ディレクトリがあるか確認し、なければ作る
      const dir = path.dirname(LOG_PATH);
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return;
    }
    const text = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = text.split('\n').filter((l) => l.trim());
    // 末尾 MAX_ENTRIES だけ取り、新しい順に並んでいる前提で push
    const recent = lines.slice(-MAX_ENTRIES);
    let maxId = 0;
    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry.id === 'number') {
          buffer.push(entry);
          if (entry.id > maxId) maxId = entry.id;
        }
      } catch {
        // 1行壊れていても続行
      }
    }
    if (maxId > 0) nextId = maxId + 1;
    console.log(`[usageLogger] loaded ${buffer.length} entries from ${LOG_PATH}`);
  } catch (e) {
    console.warn(`[usageLogger] failed to load ${LOG_PATH}: ${e && e.message}`);
  }
}

/** 1 行 append。失敗しても呼び出し元には伝播させない（記録漏れ < 機能停止） */
function appendToDisk(entry) {
  if (!LOG_PATH) return;
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    console.warn(`[usageLogger] failed to append to ${LOG_PATH}: ${e && e.message}`);
  }
}

// 起動時に同期ロード（小さい想定なので同期で十分）
loadFromDisk();

/**
 * Anthropic SDK の resp.usage オブジェクトと文脈情報を受けてログを 1 件追加。
 *
 * @param {object} args
 * @param {string} [args.clientId]
 * @param {'screening'|'reportSummary'|'jobpost'|'other'} args.purpose
 * @param {string} args.model
 * @param {{ input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number, cache_read_input_tokens?: number }} [args.usage]
 * @param {number} [args.applicantId]
 * @param {'success'|'failed'} args.status
 * @param {string} [args.errorMessage]
 * @returns {object} 作成したログレコード
 */
function recordUsage(args) {
  const usage = args.usage || {};
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  const cacheCreationTokens = Number(usage.cache_creation_input_tokens) || 0;
  const cacheReadTokens = Number(usage.cache_read_input_tokens) || 0;

  const price = PRICE_TABLE[args.model] || DEFAULT_PRICE;
  const estimatedUsd =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output +
    (cacheReadTokens / 1_000_000) * price.cacheRead +
    (cacheCreationTokens / 1_000_000) * price.cacheWrite;

  const entry = {
    id: nextId++,
    calledAt: new Date().toISOString(),
    clientId: args.clientId || 'unknown',
    purpose: args.purpose,
    model: args.model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    estimatedUsd: Number(estimatedUsd.toFixed(6)),
    applicantId: args.applicantId,
    status: args.status,
    errorMessage: args.errorMessage,
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  appendToDisk(entry);

  return entry;
}

/**
 * 月単位の集計を返す。yearMonth 未指定なら全期間。
 *
 * @param {object} [opts]
 * @param {string} [opts.yearMonth]   "YYYY-MM"
 * @param {string} [opts.clientId]    特定クライアント絞り込み
 * @returns {object}
 */
function summarize(opts) {
  const o = opts || {};
  const filtered = buffer.filter((e) => {
    if (o.yearMonth && !e.calledAt.startsWith(o.yearMonth)) return false;
    if (o.clientId && e.clientId !== o.clientId) return false;
    return true;
  });

  const totalCalls = filtered.length;
  const failed = filtered.filter((e) => e.status === 'failed').length;
  const totalInputTokens = filtered.reduce((s, e) => s + e.inputTokens, 0);
  const totalOutputTokens = filtered.reduce((s, e) => s + e.outputTokens, 0);
  const totalCacheReadTokens = filtered.reduce((s, e) => s + (e.cacheReadTokens || 0), 0);
  const totalCacheCreationTokens = filtered.reduce((s, e) => s + (e.cacheCreationTokens || 0), 0);
  const totalUsd = filtered.reduce((s, e) => s + e.estimatedUsd, 0);

  // クライアント別
  const byClientMap = new Map();
  filtered.forEach((e) => {
    const cur = byClientMap.get(e.clientId) || {
      clientId: e.clientId,
      calls: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
    };
    cur.calls += 1;
    if (e.status === 'failed') cur.failed += 1;
    cur.inputTokens += e.inputTokens;
    cur.outputTokens += e.outputTokens;
    cur.estimatedUsd += e.estimatedUsd;
    byClientMap.set(e.clientId, cur);
  });
  const byClient = Array.from(byClientMap.values())
    .map((c) => ({ ...c, estimatedUsd: Number(c.estimatedUsd.toFixed(6)) }))
    .sort((a, b) => b.estimatedUsd - a.estimatedUsd);

  // 用途別
  const byPurposeMap = new Map();
  filtered.forEach((e) => {
    const cur = byPurposeMap.get(e.purpose) || { purpose: e.purpose, calls: 0, estimatedUsd: 0 };
    cur.calls += 1;
    cur.estimatedUsd += e.estimatedUsd;
    byPurposeMap.set(e.purpose, cur);
  });
  const byPurpose = Array.from(byPurposeMap.values())
    .map((p) => ({ ...p, estimatedUsd: Number(p.estimatedUsd.toFixed(6)) }))
    .sort((a, b) => b.estimatedUsd - a.estimatedUsd);

  return {
    totalCalls,
    failed,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    totalUsd: Number(totalUsd.toFixed(6)),
    byClient,
    byPurpose,
    bufferSize: buffer.length,
    bufferLimit: MAX_ENTRIES,
    yearMonth: o.yearMonth || null,
    /** 永続化先（未設定 = 揮発モード） */
    persistencePath: LOG_PATH || null,
  };
}

/**
 * 直近 N 件のログを返す（新しい順）。
 * @param {number} [limit=100]
 */
function recent(limit) {
  const n = Math.max(1, Math.min(Number(limit) || 100, MAX_ENTRIES));
  return buffer.slice(-n).reverse();
}

module.exports = { recordUsage, summarize, recent, PRICE_TABLE };
