/**
 * Claude API ラッパー
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * @param {{ system: string, user: string }} prompt
 * @returns {Promise<{ score: number, recommendation: 'pass'|'review'|'reject', reasons: string[], concerns: string[], model: string }>}
 */
async function runScreening(prompt) {
  const c = getClient();
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });

  // 最初のテキストブロックを取得
  const textBlock = (resp.content || []).find((b) => b.type === 'text');
  const text = textBlock ? textBlock.text : '';

  // JSON 抽出（前後に余計なテキストが付いた場合への防御）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response as JSON: ' + text.slice(0, 200));
  }
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    score: clamp(Math.round(Number(parsed.score) || 0), 0, 100),
    recommendation: ['pass', 'review', 'reject'].includes(parsed.recommendation)
      ? parsed.recommendation
      : 'review',
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.filter((s) => typeof s === 'string').slice(0, 5) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter((s) => typeof s === 'string').slice(0, 5) : [],
    model: MODEL,
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = { runScreening, MODEL };
