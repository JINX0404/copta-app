export type OrganizationType = 'pta' | 'kodomokai' | 'hogosyakai' | 'other'
export type SchoolType = 'yochien' | 'hoikuen' | 'shogakko' | 'chugakko' | 'kotogakko' | 'other'
export type MembershipStatus = 'active' | 'inactive'
export type ChildStatus = 'active' | 'graduated' | 'withdrawn'
export type ContactMethod = 'email' | 'phone'
export type ApprovalStatus = 'draft' | 'pending_approval' | 'published'

export type PermissionSet = {
  can_publish?: boolean
  can_view_finance?: boolean
  can_view_roster_detail?: boolean
  can_manage_roles?: boolean
  can_manage_org?: boolean
}

export type Organization = {
  id: string
  name: string
  type: OrganizationType
  school_name: string | null
  school_type: SchoolType | null
  final_grade_label: string | null
  data_residency: string
  created_at: string
}

export type User = {
  id: string
  display_name: string
  contact_method: ContactMethod
  contact_value_hash: string
  created_at: string
}

export type OrganizationMembership = {
  id: string
  user_id: string
  organization_id: string
  status: MembershipStatus
  joined_at: string
}

export type Child = {
  id: string
  organization_id: string
  class_name: string | null
  grade_label: string | null
  child_code: string
  status: ChildStatus
  graduated_at: string | null
  created_at: string
}

export type Role = {
  id: string
  organization_id: string
  name: string
  permission_set: string
}

export type RoleAssignment = {
  id: string
  user_id: string
  role_id: string
  school_year: string
  active: number
  created_at: string
}

export type MagicLinkToken = {
  id: string
  contact_method: ContactMethod
  contact_value_hash: string
  display_name: string | null
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export type Session = {
  id: string
  user_id: string
  expires_at: string
  created_at: string
}

export function parsePermissionSet(json: string): PermissionSet {
  try {
    return JSON.parse(json) as PermissionSet
  } catch {
    return {}
  }
}

export const DEFAULT_PARENT_PERMISSION: PermissionSet = {
  can_publish: false,
  can_view_finance: false,
  can_view_roster_detail: false,
  can_manage_roles: false,
  can_manage_org: false,
}

export const PARENT_ROLE_NAME = '一般保護者'

export const OFFICER_PUBLISHER_PERMISSION: PermissionSet = {
  can_publish: true,
  can_view_finance: false,
  can_view_roster_detail: true,
  can_manage_roles: false,
  can_manage_org: false,
}

export const OFFICER_ADMIN_PERMISSION: PermissionSet = {
  can_publish: true,
  can_view_finance: true,
  can_view_roster_detail: true,
  can_manage_roles: true,
  can_manage_org: true,
}
