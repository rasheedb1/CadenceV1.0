export type OrgRole = 'admin' | 'manager' | 'member' | 'viewer'

export interface OrgPermissions {
  // Leads & Prospects
  leads_view: boolean
  leads_create: boolean
  leads_edit: boolean
  leads_delete: boolean
  leads_import: boolean

  // Cadences
  cadences_view: boolean
  cadences_create: boolean
  cadences_edit: boolean
  cadences_delete: boolean
  cadences_activate: boolean
  cadences_execute: boolean

  // Workflows
  workflows_view: boolean
  workflows_create: boolean
  workflows_edit: boolean
  workflows_delete: boolean
  workflows_activate: boolean

  // Templates & AI Prompts
  templates_view: boolean
  templates_create: boolean
  templates_edit: boolean
  templates_delete: boolean
  ai_prompts_view: boolean
  ai_prompts_create: boolean
  ai_prompts_edit: boolean
  ai_prompts_delete: boolean

  // Account Mapping
  account_mapping_view: boolean
  account_mapping_create: boolean
  account_mapping_edit: boolean
  account_mapping_delete: boolean
  account_mapping_search: boolean

  // Company Registry
  registry_view: boolean
  registry_create: boolean
  registry_edit: boolean
  registry_delete: boolean

  // LinkedIn/Email
  inbox_view: boolean
  inbox_send: boolean

  // Activity & Analytics
  activity_view: boolean
  activity_view_all: boolean

  // Org Management
  org_settings_view: boolean
  org_settings_edit: boolean
  members_view: boolean
  members_invite: boolean
  members_manage_roles: boolean
  members_remove: boolean
}

export const DEFAULT_ROLE_PERMISSIONS: Record<OrgRole, OrgPermissions> = {
  admin: {
    leads_view: true, leads_create: true, leads_edit: true, leads_delete: true, leads_import: true,
    cadences_view: true, cadences_create: true, cadences_edit: true, cadences_delete: true,
    cadences_activate: true, cadences_execute: true,
    workflows_view: true, workflows_create: true, workflows_edit: true, workflows_delete: true,
    workflows_activate: true,
    templates_view: true, templates_create: true, templates_edit: true, templates_delete: true,
    ai_prompts_view: true, ai_prompts_create: true, ai_prompts_edit: true, ai_prompts_delete: true,
    account_mapping_view: true, account_mapping_create: true, account_mapping_edit: true,
    account_mapping_delete: true, account_mapping_search: true,
    registry_view: true, registry_create: true, registry_edit: true, registry_delete: true,
    inbox_view: true, inbox_send: true,
    activity_view: true, activity_view_all: true,
    org_settings_view: true, org_settings_edit: true,
    members_view: true, members_invite: true, members_manage_roles: true, members_remove: true,
  },
  manager: {
    leads_view: true, leads_create: true, leads_edit: true, leads_delete: true, leads_import: true,
    cadences_view: true, cadences_create: true, cadences_edit: true, cadences_delete: true,
    cadences_activate: true, cadences_execute: true,
    workflows_view: true, workflows_create: true, workflows_edit: true, workflows_delete: true,
    workflows_activate: true,
    templates_view: true, templates_create: true, templates_edit: true, templates_delete: true,
    ai_prompts_view: true, ai_prompts_create: true, ai_prompts_edit: true, ai_prompts_delete: true,
    account_mapping_view: true, account_mapping_create: true, account_mapping_edit: true,
    account_mapping_delete: true, account_mapping_search: true,
    registry_view: true, registry_create: true, registry_edit: true, registry_delete: true,
    inbox_view: true, inbox_send: true,
    activity_view: true, activity_view_all: true,
    org_settings_view: true, org_settings_edit: false,
    members_view: true, members_invite: true, members_manage_roles: false, members_remove: false,
  },
  member: {
    leads_view: true, leads_create: true, leads_edit: true, leads_delete: false, leads_import: true,
    cadences_view: true, cadences_create: true, cadences_edit: true, cadences_delete: false,
    cadences_activate: true, cadences_execute: true,
    workflows_view: true, workflows_create: true, workflows_edit: true, workflows_delete: false,
    workflows_activate: true,
    templates_view: true, templates_create: true, templates_edit: true, templates_delete: false,
    ai_prompts_view: true, ai_prompts_create: true, ai_prompts_edit: true, ai_prompts_delete: false,
    account_mapping_view: true, account_mapping_create: true, account_mapping_edit: true,
    account_mapping_delete: false, account_mapping_search: true,
    registry_view: true, registry_create: true, registry_edit: true, registry_delete: false,
    inbox_view: true, inbox_send: true,
    activity_view: true, activity_view_all: false,
    org_settings_view: false, org_settings_edit: false,
    members_view: true, members_invite: false, members_manage_roles: false, members_remove: false,
  },
  viewer: {
    leads_view: true, leads_create: false, leads_edit: false, leads_delete: false, leads_import: false,
    cadences_view: true, cadences_create: false, cadences_edit: false, cadences_delete: false,
    cadences_activate: false, cadences_execute: false,
    workflows_view: true, workflows_create: false, workflows_edit: false, workflows_delete: false,
    workflows_activate: false,
    templates_view: true, templates_create: false, templates_edit: false, templates_delete: false,
    ai_prompts_view: true, ai_prompts_create: false, ai_prompts_edit: false, ai_prompts_delete: false,
    account_mapping_view: true, account_mapping_create: false, account_mapping_edit: false,
    account_mapping_delete: false, account_mapping_search: false,
    registry_view: true, registry_create: false, registry_edit: false, registry_delete: false,
    inbox_view: true, inbox_send: false,
    activity_view: true, activity_view_all: false,
    org_settings_view: false, org_settings_edit: false,
    members_view: true, members_invite: false, members_manage_roles: false, members_remove: false,
  },
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member',
  viewer: 'Viewer',
}

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  admin: 'Full control over the organization, members, and all data',
  manager: 'Can manage data, delete items, invite members, and view all activity',
  member: 'Can create and edit data, execute outreach, but cannot delete or manage members',
  viewer: 'Read-only access to all data, cannot create or modify anything',
}
