/**
 * 和暦・西暦変換ユーティリティ
 *
 * 対応形式:
 * - R5.4.1, R5/4/1, 令和5年4月1日 → 2023-04-01
 * - H10.5.20, H10/5/20, 平成10年5月20日 → 1998-05-20
 * - S45.3.15, S45/3/15, 昭和45年3月15日 → 1970-03-15
 * - T11.1.1, T11/1/1, 大正11年1月1日 → 1922-01-01
 * - 2023-04-01, 2023/04/01 → そのまま
 * - 2023-04 → 2023-04-01 (日を01で補完)
 */

interface EraInfo {
  kanji: string;
  alpha: string;
  startYear: number;
}

const ERAS: EraInfo[] = [
  { kanji: '令和', alpha: 'R', startYear: 2019 },
  { kanji: '平成', alpha: 'H', startYear: 1989 },
  { kanji: '昭和', alpha: 'S', startYear: 1926 },
  { kanji: '大正', alpha: 'T', startYear: 1912 },
];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * 和暦文字列を YYYY-MM-DD に変換
 * 西暦の場合はそのまま返す
 */
export function warekiToDate(input: string): string | null {
  if (!input || !input.trim()) return null;

  const s = input.trim();

  // 西暦 YYYY-MM-DD or YYYY/MM/DD
  const westernFull = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (westernFull) {
    const [, y, m, d] = westernFull;
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;
  }

  // 西暦 YYYY-MM (日を01で補完)
  const westernPartial = s.match(/^(\d{4})[/-](\d{1,2})$/);
  if (westernPartial) {
    const [, y, m] = westernPartial;
    return `${y}-${pad2(Number(m))}-01`;
  }

  // 漢字和暦: 令和5年4月1日
  for (const era of ERAS) {
    const kanjiPattern = new RegExp(
      `^${era.kanji}(\\d{1,2})年(\\d{1,2})月(\\d{1,2})日?$`
    );
    const kanjiMatch = s.match(kanjiPattern);
    if (kanjiMatch) {
      const [, ey, m, d] = kanjiMatch;
      const year = era.startYear + Number(ey) - 1;
      return `${year}-${pad2(Number(m))}-${pad2(Number(d))}`;
    }

    // 漢字和暦 年月のみ: 令和5年4月
    const kanjiPartial = new RegExp(
      `^${era.kanji}(\\d{1,2})年(\\d{1,2})月$`
    );
    const kanjiPartialMatch = s.match(kanjiPartial);
    if (kanjiPartialMatch) {
      const [, ey, m] = kanjiPartialMatch;
      const year = era.startYear + Number(ey) - 1;
      return `${year}-${pad2(Number(m))}-01`;
    }
  }

  // アルファベット和暦: R5.4.1, R5/4/1, H10.5.20
  for (const era of ERAS) {
    const alphaPattern = new RegExp(
      `^${era.alpha}(\\d{1,2})[./](\\d{1,2})[./](\\d{1,2})$`,
      'i'
    );
    const alphaMatch = s.match(alphaPattern);
    if (alphaMatch) {
      const [, ey, m, d] = alphaMatch;
      const year = era.startYear + Number(ey) - 1;
      return `${year}-${pad2(Number(m))}-${pad2(Number(d))}`;
    }

    // アルファベット和暦 年月のみ: R5.4
    const alphaPartial = new RegExp(
      `^${era.alpha}(\\d{1,2})[./](\\d{1,2})$`,
      'i'
    );
    const alphaPartialMatch = s.match(alphaPartial);
    if (alphaPartialMatch) {
      const [, ey, m] = alphaPartialMatch;
      const year = era.startYear + Number(ey) - 1;
      return `${year}-${pad2(Number(m))}-01`;
    }
  }

  return null;
}

/**
 * YYYY-MM-DD を和暦文字列(漢字)に変換
 */
export function dateToWareki(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  for (const era of ERAS) {
    if (year >= era.startYear) {
      const eraYear = year - era.startYear + 1;
      return `${era.kanji}${eraYear}年${month}月${day}日`;
    }
  }

  return dateStr;
}
