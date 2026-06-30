/** 日本の学校年度（4/1始まり）を "YYYY" 形式で返す */
export function currentSchoolYear(now = new Date()): string {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 4 ? String(year) : String(year - 1)
}
