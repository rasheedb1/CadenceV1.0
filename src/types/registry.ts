// =====================================================
// COMPANY REGISTRY TYPES
// =====================================================

export type RegistryType = 'customer' | 'competitor' | 'dnc' | 'prospected' | 'discovered'
export type RegistrySource = 'csv_import' | 'manual' | 'auto_prospected' | 'discovery'
export type ProspectedVia = 'linkedin_message' | 'linkedin_connect' | 'email'

/** Registry types that count as exclusions in discovery */
export const EXCLUSION_TYPES: RegistryType[] = ['customer', 'competitor', 'dnc']

export interface CompanyRegistryEntry {
  id: string
  owner_id: string
  org_id: string
  company_name: string           // normalized
  company_name_display: string   // original casing
  website: string | null
  industry: string | null
  company_size: string | null
  location: string | null
  registry_type: RegistryType
  source: RegistrySource
  exclusion_reason: string | null
  prospected_at: string | null
  prospected_via: ProspectedVia | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export const REGISTRY_TYPE_CONFIG: Record<RegistryType, { label: string; color: string; description: string }> = {
  customer: { label: 'Cliente', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', description: 'Cliente existente' },
  competitor: { label: 'Competidor', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', description: 'Competidor conocido' },
  dnc: { label: 'No Contactar', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', description: 'Lista de no contactar' },
  prospected: { label: 'Prospectado', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', description: 'Ya contactado' },
  discovered: { label: 'Descubierto', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300', description: 'Encontrado via discovery' },
}

/** Info about a company excluded during discovery */
export interface ExcludedCompanyInfo {
  company_name: string
  registry_type: RegistryType
  exclusion_reason: string | null
  match_type: 'exact' | 'fuzzy'
}

/** Exclusion statistics for the discovery dialog */
export interface ExclusionStats {
  total: number
  byType: Partial<Record<RegistryType, number>>
}
