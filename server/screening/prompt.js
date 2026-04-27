/**
 * AIスクリーニング プロンプト生成
 *
 * 純粋関数として切り出し。将来別プロジェクト化する際はこのファイルをそのまま移動できる。
 */

/**
 * @param {{
 *   applicant: object,   // 応募者の素データ（個人特定情報を最小化したサニタイズ済オブジェクト推奨）
 *   criteria: {
 *     evaluationPoints: string,
 *     requiredQualities: string,
 *     ngQualities: string,
 *     passThreshold: number,
 *     rejectThreshold: number,
 *   }
 * }} params
 * @returns {{ system: string, user: string }}
 */
function buildScreeningPrompt({ applicant, criteria }) {
  const system = `あなたは採用代行会社の書類選考スペシャリストです。
応募者情報を読み、クライアント企業の評価基準に基づいてスコアリングと推奨アクションを判定します。

【出力ルール】
- 必ず以下のJSON形式のみで回答してください。前後に説明文を一切付けないでください。
- score は 0-100 の整数。
- recommendation は "pass" | "review" | "reject" のいずれか。
  - score >= ${criteria.passThreshold} なら "pass"
  - score <= ${criteria.rejectThreshold} なら "reject"
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

  return { system, user };
}

/**
 * 応募者オブジェクトを評価用テキストに整形（個人特定情報は最小化）
 */
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

module.exports = { buildScreeningPrompt };
