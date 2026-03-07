// =====================================================
// FEATURE FLAGS — Per-Organization Feature Control
// =====================================================

export interface OrgFeatureFlags {
  // Sidebar sections
  section_cadences: boolean
  section_workflows: boolean
  section_account_mapping: boolean
  section_company_registry: boolean
  section_company_research: boolean
  section_business_cases: boolean
  section_leads: boolean
  section_templates: boolean
  section_ai_prompts: boolean
  section_linkedin_inbox: boolean
  section_notifications: boolean
  // Account Executive section
  section_account_executive: boolean
  ae_gong_integration: boolean
  ae_calendar_integration: boolean
  ae_email_analysis: boolean
  // Cadence sub-features
  cadence_automate: boolean
  cadence_import_leads: boolean
  cadence_ai_generate: boolean
  cadence_manual_execute: boolean
  // Account Mapping sub-features
  acctmap_ai_discovery: boolean
  acctmap_chat_discovery: boolean
  acctmap_ai_polish: boolean
  acctmap_persona_suggest: boolean
  acctmap_batch_search: boolean
}

export type FeatureFlagKey = keyof OrgFeatureFlags

// Default: everything ON — new orgs get full access
export const DEFAULT_FEATURE_FLAGS: OrgFeatureFlags = {
  section_cadences: true,
  section_workflows: true,
  section_account_mapping: true,
  section_company_registry: true,
  section_company_research: true,
  section_business_cases: true,
  section_leads: true,
  section_templates: true,
  section_ai_prompts: true,
  section_linkedin_inbox: true,
  section_notifications: true,
  section_account_executive: true,
  ae_gong_integration: true,
  ae_calendar_integration: true,
  ae_email_analysis: true,
  cadence_automate: true,
  cadence_import_leads: true,
  cadence_ai_generate: true,
  cadence_manual_execute: true,
  acctmap_ai_discovery: true,
  acctmap_chat_discovery: true,
  acctmap_ai_polish: true,
  acctmap_persona_suggest: true,
  acctmap_batch_search: true,
}

// Human-readable labels for the Super Admin UI
export const FEATURE_FLAG_LABELS: Record<FeatureFlagKey, string> = {
  section_cadences: 'Cadences',
  section_workflows: 'Workflows',
  section_account_mapping: 'Account Mapping',
  section_company_registry: 'Company Registry',
  section_company_research: 'Company Research',
  section_business_cases: 'Business Cases',
  section_leads: 'Leads',
  section_templates: 'Templates',
  section_ai_prompts: 'AI Prompts',
  section_linkedin_inbox: 'LinkedIn Inbox',
  section_notifications: 'Notifications',
  section_account_executive: 'Account Executive',
  ae_gong_integration: 'Gong Integration',
  ae_calendar_integration: 'Google Calendar',
  ae_email_analysis: 'Email Analysis',
  cadence_automate: 'Automate Cadence',
  cadence_import_leads: 'Import Leads',
  cadence_ai_generate: 'AI Generate Messages',
  cadence_manual_execute: 'Manual Execute / Send',
  acctmap_ai_discovery: 'AI Company Discovery',
  acctmap_chat_discovery: 'Chat Discovery',
  acctmap_ai_polish: 'AI Polish',
  acctmap_persona_suggest: 'Suggest Personas',
  acctmap_batch_search: 'Batch Search',
}

// Grouped for the toggle grid in Super Admin
export const FEATURE_FLAG_GROUPS: { label: string; flags: FeatureFlagKey[]; parentFlag?: FeatureFlagKey }[] = [
  {
    label: 'Sections',
    flags: [
      'section_cadences',
      'section_workflows',
      'section_account_mapping',
      'section_company_registry',
      'section_company_research',
      'section_business_cases',
      'section_leads',
      'section_templates',
      'section_ai_prompts',
      'section_linkedin_inbox',
      'section_account_executive',
      'section_notifications',
    ],
  },
  {
    label: 'Cadence Sub-Features',
    parentFlag: 'section_cadences',
    flags: [
      'cadence_automate',
      'cadence_import_leads',
      'cadence_ai_generate',
      'cadence_manual_execute',
    ],
  },
  {
    label: 'Account Mapping Sub-Features',
    parentFlag: 'section_account_mapping',
    flags: [
      'acctmap_ai_discovery',
      'acctmap_chat_discovery',
      'acctmap_ai_polish',
      'acctmap_persona_suggest',
      'acctmap_batch_search',
    ],
  },
  {
    label: 'Account Executive Sub-Features',
    parentFlag: 'section_account_executive',
    flags: [
      'ae_gong_integration',
      'ae_calendar_integration',
      'ae_email_analysis',
    ],
  },
]
