/**
 * 採用レポート AI要約ハンドラ
 * POST /api/report-summary  body: { report: RecruitmentReport, prevReport?: RecruitmentReport }
 */
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client = new Anthropic({ apiKey });
  return client;
}

function pct(n) {
  return Number.isFinite(n) ? n.toFixed(2) + '%' : '-';
}

function summarizeReport(r) {
  const t = r.total;
  return {
    range: `${r.range.start} 〜 ${r.range.end}`,
    funnel: {
      応募: t.applications,
      有効応募: t.validApplications,
      面接設定: t.interviewScheduled,
      内定: t.offered,
      採用: t.hired,
      稼働: t.active,
      有効率: pct(t.validRate),
      面接設定率: pct(t.validToInterviewRate),
      採用率: pct(t.applicationToHireRate),
      稼働率: pct(t.applicationToActiveRate),
    },
    ng: r.ngBreakdown,
    byBaseTop5: r.byBase.slice(0, 5).map((b) => ({
      base: b.label,
      応募: b.applications,
      採用: b.hired,
      採用率: pct(b.applicationToHireRate),
    })),
    bySourceTop5: r.bySource.slice(0, 5).map((s) => ({
      source: s.label,
      応募: s.applications,
      採用: s.hired,
      採用率: pct(s.applicationToHireRate),
    })),
    byAge: r.byAge.map((a) => ({
      age: a.ageGroup,
      応募: a.applications,
      採用: a.hired,
      採用割合: pct(a.hireRate),
    })),
  };
}

function buildPrompt(report, prevReport) {
  const cur = summarizeReport(report);
  const prev = prevReport ? summarizeReport(prevReport) : null;

  const system = [
    'あなたは採用代行（RPO）の経験豊富なアナリストです。',
    '与えられた採用レポートのデータから、簡潔で示唆に富む日本語の総評を作成してください。',
    '事実ベースで、具体的な数値を引用しながら分析してください。媚びた表現や過度な賛辞は避けてください。',
    '出力は必ず以下のJSONフォーマットのみで返してください。説明文や前置きは不要です。',
    '',
    '{',
    '  "headline": "1〜2行の総評（数値を含めること）",',
    '  "highlights": ["注目すべきポジティブな点", ...最大3件],',
    '  "concerns": ["懸念点・リスク・要因", ...最大3件],',
    '  "recommendations": ["次月のアクション提案（具体的に）", ...最大3件]',
    '}',
  ].join('\n');

  const lines = ['## 当期データ', JSON.stringify(cur, null, 2)];
  if (prev) {
    lines.push('', '## 前期データ（比較用）', JSON.stringify(prev, null, 2));
    lines.push('', '前期との変化（増減の要因と意味）も踏まえて分析してください。');
  }
  return { system, user: lines.join('\n') };
}

async function summaryHandler(req, res) {
  try {
    const { report, prevReport } = req.body || {};
    if (!report || !report.total) {
      return res.status(400).json({ error: 'report is required' });
    }

    const { system, user } = buildPrompt(report, prevReport);

    const c = getClient();
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = (resp.content || []).find((b) => b.type === 'text');
    const text = textBlock ? textBlock.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Failed to parse AI response', raw: text.slice(0, 500) });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const safeArr = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, 5) : []);

    res.json({
      headline: typeof parsed.headline === 'string' ? parsed.headline : '',
      highlights: safeArr(parsed.highlights),
      concerns: safeArr(parsed.concerns),
      recommendations: safeArr(parsed.recommendations),
      model: MODEL,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[report-summary] error:', e);
    res.status(500).json({ error: e.message || 'internal error' });
  }
}

module.exports = { summaryHandler };
