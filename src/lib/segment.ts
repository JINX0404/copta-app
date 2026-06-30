export type AnnouncementSegment = {
  all?: boolean
  grade_labels?: string[]
  class_names?: string[]
}

export function parseSegment(json: string): AnnouncementSegment {
  try {
    return JSON.parse(json) as AnnouncementSegment
  } catch {
    return { all: true }
  }
}

export function segmentMatchesUser(
  segment: AnnouncementSegment,
  userChildren: Array<{ grade_label: string | null; class_name: string | null }>,
): boolean {
  if (segment.all) return true
  if (userChildren.length === 0) return false

  return userChildren.some((child) => {
    const gradeMatch =
      !segment.grade_labels?.length ||
      (child.grade_label != null && segment.grade_labels.includes(child.grade_label))
    const classMatch =
      !segment.class_names?.length ||
      (child.class_name != null && segment.class_names.includes(child.class_name))
    return gradeMatch && classMatch
  })
}

export function maskDisplayName(name: string): string {
  if (name.length <= 1) return '＊'
  return name[0] + '＊'.repeat(Math.min(name.length - 1, 2))
}
