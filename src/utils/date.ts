/**
 * 日付ユーティリティ
 */

/**
 * 今日の日付を YYYY-MM-DD で返す
 */
export function today(): string {
  const d = new Date();
  return formatDate(d);
}

/**
 * Date を YYYY-MM-DD にフォーマット
 */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * YYYY-MM-DD を日本語表示 (YYYY年M月D日)
 */
export function formatDateJP(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${y}年${m}月${d}日`;
}

/**
 * YYYY-MM-DD を M/D 形式で返す
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

/**
 * 生年月日から年齢を計算
 */
export function calcAge(birthDate: string, baseDate?: string): number {
  if (!birthDate) return 0;
  const base = baseDate ? new Date(baseDate) : new Date();
  const birth = new Date(birthDate);

  let age = base.getFullYear() - birth.getFullYear();
  const monthDiff = base.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && base.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * 指定日が今月かどうか判定
 */
export function isThisMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * 指定日が今日かどうか判定
 */
export function isToday(dateStr: string): boolean {
  return dateStr === today();
}

/**
 * 二つの日付の差を日数で返す (date1 - date2)
 */
export function diffDays(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = d1.getTime() - d2.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 月の最初の日を YYYY-MM-DD で返す
 */
export function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * 月の日数を返す
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * 曜日を日本語で返す
 */
export function dayOfWeekJP(dateStr: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(dateStr);
  return days[d.getDay()];
}

/**
 * HH:MM を分に変換
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 分を HH:MM に変換
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
