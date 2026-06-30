import type { PermissionSet } from '../db/schema'

export type Bindings = {
  DB: D1Database
  ATTACHMENTS: R2Bucket
  SESSION_SECRET?: string
  /** POCデモモード: デモログイン・ダミーデータ利用可 */
  POC_MODE?: string
  /** ローカル開発時にマジックリンクURLをレスポンスに含める */
  DEV_EXPOSE_MAGIC_LINK?: string
}

export type RoleContext = {
  roleId: string
  roleName: string
  organizationId: string
  permissions: PermissionSet
  schoolYear: string
}

export type Variables = {
  userId: string
  sessionId: string
  roleContext?: RoleContext
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
