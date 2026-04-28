/**
 * Claude API ラッパー（v1/v2 両対応）
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
 * @param {{ system: string, user: string, multiAxis?: boolean }} prompt
 * @param {{ axes?: Array<{ id:string, name:string, weight:number }> }} [criteria]
 * @returns {Promise<object>}
 */
async function runScreening(prompt, criteria) {
  const c = getClient();
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: prompt.multiAxis ? 2048 : 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });

  const textBlock = (resp.content || []).find((b) => b.type === 'text');
  const text = textBlock ? textBlock.text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response as JSON: ' + text.slice(0, 200));
  }
  const parsed = JSON.parse(jsonMatch[0]);

  if (prompt.multiAxis) {
    return parseMultiAxisResult(parsed, criteria);
  }
  return parseLegacyResult(parsed);
}

function parseLegacyResult(parsed) {
  return {
    score: clamp(Math.round(Number(parsed.score) || 0), 0, 100),
    recommendation: validReco(parsed.recommendation),
    reasons: stringList(parsed.reasons),
    concerns: stringList(parsed.concerns),
    model: MODEL,
  };
}

function parseMultiAxisResult(parsed, criteria) {
  const axes = (criteria && criteria.axes) || [];
  const axisScoresRaw = parsed.axisScores || {};
  const axisScores = axes.map((a) => {
    const raw = axisScoresRaw[a.name] || {};
    return {
      axisId: a.id,
      axisName: a.name,
      score: clamp(Math.round(Number(raw.score) || 0), 0, 100),
      weight: a.weight,
      reasons: stringList(raw.reasons),
      concerns: stringList(raw.concerns),
    };
  });

  // 念のため: 全体スコアが返ってきていない場合はウェイト加重平均で算出
  let total = Number(parsed.totalScore);
  if (!Number.isFinite(total)) {
    const totalWeight = axes.reduce((s, a) => s + a.weight, 0) || 1;
    total = axisScores.reduce((s, a) => s + a.score * (a.weight / totalWeight), 0);
  }

  return {
    score: clamp(Math.round(total), 0, 100),
    recommendation: validReco(parsed.recommendation),
    reasons: stringList(parsed.totalReasons),
    concerns: stringList(parsed.totalConcerns),
    axisScores,
    model: MODEL,
  };
}

function stringList(arr) {
  return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string').slice(0, 5) : [];
}

function validReco(v) {
  return ['pass', 'review', 'reject'].includes(v) ? v : 'review';
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = { runScreening, MODEL };
