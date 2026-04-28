/**
 * AIスクリーニング プロンプト生成
 *
 * 純粋関数として切り出し。将来別プロジェクト化する際はこのファイルをそのまま移動できる。
 *
 * v1（フリーテキスト3項目）と v2（多軸）両対応。
 * criteria.axes が存在すれば v2 として扱う。
 */

/**
 * @param {{ applicant: object, criteria: object }} params
 * @returns {{ system: string, user: string, multiAxis: boolean }}
 */
function buildScreeningPrompt({ applicant, criteria }) {
  const useMultiAxis = Array.isArray(criteria.axes) && criteria.axes.length > 0;
  if (useMultiAxis) {
    return buildMultiAxisPrompt({ applicant, criteria });
  }
  return buildLegacyPrompt({ applicant, criteria });
}

/* =========================================================
   v2: 多軸プロンプト
   ========================================================= */
function buildMultiAxisPrompt({ applicant, criteria }) {
  const axes = criteria.axes;
  const passThreshold = criteria.passThreshold ?? 75;
  const rejectThreshold = criteria.rejectThreshold ?? 30;

  const axisJsonShape = axes
    .map((a) => `    "${escapeJson(a.name)}": { "score": <number 0-100>, "reasons": [...], "concerns": [...] }`)
    .join(',\n');

  const system = `あなたは採用代行会社の書類選考スペシャリストです。
応募者情報を読み、定義された複数の評価軸ごとにスコアリングし、ウェイトを掛けた総合スコアと推奨アクションを判定します。

【評価ルール】
- 各軸は 0-100 でスコアリング。
- 必須要件を満たさない軸は大幅に減点（典型的に 50 以下）。
- 望ましい/避けたい要件は重要度シンボル（★1〜★3）で示される。重要度に応じて評価への影響度を変える。
- 総合スコアは各軸スコア × ウェイトの加重平均。
- 推奨は score >= ${passThreshold} で "pass"、score <= ${rejectThreshold} で "reject"、その間は "review"。

【出力ルール】
- 必ず以下のJSON形式のみで回答。前後に説明文を一切付けないでください。
- reasons / concerns は短い日本語（各40字以内）で簡潔に。最大5件。
- 必須要件を満たさない場合は concerns に必ず明記。

【出力形式】
{
  "totalScore": <number 0-100>,
  "axisScores": {
${axisJsonShape}
  },
  "totalReasons": [<string>, ...],
  "totalConcerns": [<string>, ...],
  "recommendation": "<pass|review|reject>"
}`;

  const axesText = axes.map((a, i) => formatAxisForPrompt(a, i + 1)).join('\n\n');

  const user = `# 評価軸（合計100%、加重平均で総合スコア算出）

${axesText}

# 応募者情報

${formatApplicantForPrompt(applicant)}

上記の評価軸ごとに 0-100 のスコアを付け、加重平均で総合スコアを算出してください。
定められたJSON形式のみで回答してください。`;

  return { system, user, multiAxis: true };
}

function formatAxisForPrompt(axis, index) {
  const lines = [];
  lines.push(`## ${index}. ${axis.name}（重要度ウェイト: ${axis.weight}%）`);
  if (axis.description) lines.push(`説明: ${axis.description}`);

  if (axis.requirements && axis.requirements.length > 0) {
    lines.push('');
    lines.push('### 必須要件（満たさないと大幅減点）');
    axis.requirements.forEach((it) => lines.push('- ' + formatItem(it, false)));
  }

  if (axis.preferences && axis.preferences.length > 0) {
    lines.push('');
    lines.push('### 望ましい要件（重要度順）');
    [...axis.preferences]
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .forEach((it) => lines.push('- ' + formatItem(it, true)));
  }

  if (axis.avoidances && axis.avoidances.length > 0) {
    lines.push('');
    lines.push('### 避けたい要件（重要度順）');
    [...axis.avoidances]
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .forEach((it) => lines.push('- ' + formatItem(it, true)));
  }

  if (axis.guidance) {
    lines.push('');
    lines.push(`### 補足指示\n${axis.guidance}`);
  }

  return lines.join('\n');
}

function formatItem(item, withImportance) {
  let body = item.label;
  if (item.type === 'number' && item.numberValue != null) {
    const op = item.numberOperator === 'lte' ? '以下' : item.numberOperator === 'eq' ? '' : '以上';
    body = `${item.label} ${item.numberValue}${item.numberUnit || ''}${op}`;
  } else if (item.type === 'text' && item.textValue) {
    body = item.textValue;
  }
  if (withImportance) {
    const stars = '★'.repeat(item.importance || 1);
    return `[${stars}] ${body}`;
  }
  return body;
}

/* =========================================================
   v1: 旧フリーテキスト形式プロンプト（互換維持）
   ========================================================= */
function buildLegacyPrompt({ applicant, criteria }) {
  const passThreshold = criteria.passThreshold ?? 75;
  const rejectThreshold = criteria.rejectThreshold ?? 30;
  const system = `あなたは採用代行会社の書類選考スペシャリストです。
応募者情報を読み、クライアント企業の評価基準に基づいてスコアリングと推奨アクションを判定します。

【出力ルール】
- 必ず以下のJSON形式のみで回答してください。前後に説明文を一切付けないでください。
- score は 0-100 の整数。
- recommendation は "pass" | "review" | "reject" のいずれか。
  - score >= ${passThreshold} なら "pass"
  - score <= ${rejectThreshold} なら "reject"
  - その間なら "review"
- reasons は加点ポイント（最大5件、各40字以内、簡潔な日本語）。
- concerns は懸念ポイント（最大5件、各40字以内）。なければ空配列。

【出力形式】
{
  "score": <number>,
  "recommendation": "<pass|review|reject>",
  "reasons": [<string>, ...],
  "concerns": [<string>, ...]
}`;

  const user = `# クライアント評価基準

## 評価観点
${criteria.evaluationPoints || '（指定なし）'}

## 必須要件
${criteria.requiredQualities || '（指定なし）'}

## NG要件
${criteria.ngQualities || '（指定なし）'}

# 応募者情報

${formatApplicantForPrompt(applicant)}

上記情報をもとに評価し、定められたJSON形式のみで回答してください。`;

  return { system, user, multiAxis: false };
}

/* =========================================================
   応募者情報の整形（共通）
   ========================================================= */
function formatApplicantForPrompt(a) {
  const lines = [];
  if (a.age) lines.push(`年齢: ${a.age}歳`);
  if (a.gender) lines.push(`性別: ${a.gender}`);
  if (a.currentJob) lines.push(`現職: ${a.currentJob}`);
  if (a.job) lines.push(`応募職種: ${a.job}`);
  if (a.src) lines.push(`応募媒体: ${a.src}`);
  if (a.base) lines.push(`応募拠点: ${a.base}`);

  if (a.educationWorkHistory) {
    const edu = a.educationWorkHistory;
    if (edu.finalEducation) lines.push(`最終学歴: ${edu.finalEducation}`);
    if (edu.graduationYear) lines.push(`卒業年: ${edu.graduationYear}`);
    if (edu.employmentStatus) lines.push(`現在の就業状況: ${edu.employmentStatus}`);
    if (edu.jobChangeCount) lines.push(`転職回数: ${edu.jobChangeCount}`);
    if (edu.workHistory) lines.push(`職務経歴: ${edu.workHistory}`);
    if (edu.qualifications) lines.push(`資格: ${edu.qualifications}`);
  }

  if (a.desiredConditions) {
    const dc = a.desiredConditions;
    if (dc.preferredLocation) lines.push(`希望勤務地: ${dc.preferredLocation}`);
    if (dc.availableDays) lines.push(`稼働可能日: ${dc.availableDays}`);
    if (dc.availableHours) lines.push(`稼働可能時間: ${dc.availableHours}`);
    if (dc.selfPr) lines.push(`自己PR:\n${dc.selfPr}`);
    if (dc.motivation) lines.push(`志望動機:\n${dc.motivation}`);
    if (dc.otherQuestions) lines.push(`その他:\n${dc.otherQuestions}`);
  }

  if (Array.isArray(a.chatAnswers) && a.chatAnswers.length) {
    lines.push('チャット回答:');
    a.chatAnswers.forEach((c) => {
      if (c.question && c.answer) lines.push(`  Q: ${c.question}\n  A: ${c.answer}`);
    });
  }

  if (a.note) lines.push(`メモ:\n${a.note}`);

  return lines.length ? lines.join('\n') : '（情報なし）';
}

function escapeJson(s) {
  return String(s).replace(/"/g, '\\"');
}

module.exports = { buildScreeningPrompt };
