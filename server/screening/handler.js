/**
 * Express handler for POST /api/screen
 *
 * 切り出しやすさのため、Express依存を最小に。req.body を受けて結果を res.json で返すのみ。
 */
const { buildScreeningPrompt } = require('./prompt');
const { runScreening } = require('./claude');

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function screeningHandler(req, res) {
  try {
    const { applicant, criteria } = req.body || {};

    if (!applicant || typeof applicant !== 'object') {
      return res.status(400).json({ error: 'applicant is required' });
    }
    if (!criteria || typeof criteria !== 'object') {
      return res.status(400).json({ error: 'criteria is required' });
    }

    const passThreshold = Number(criteria.passThreshold) || 75;
    const rejectThreshold = Number(criteria.rejectThreshold) || 30;

    const prompt = buildScreeningPrompt({
      applicant,
      criteria: {
        evaluationPoints: String(criteria.evaluationPoints || ''),
        requiredQualities: String(criteria.requiredQualities || ''),
        ngQualities: String(criteria.ngQualities || ''),
        passThreshold,
        rejectThreshold,
      },
    });

    const result = await runScreening(prompt);

    return res.json({
      ...result,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err && err.message ? err.message : 'Internal error';
    console.error('[screening]', message);
    return res.status(500).json({ error: message });
  }
}

module.exports = { screeningHandler };
