// =====================================================
// ICP GUIDED BUILDER TYPES
// =====================================================

export interface ICPBuilderData {
  // Section 1: About Your Company
  companyDescription: string
  productCategory: string
  existingCustomers: string[]

  // Section 2: Target Company Profile
  businessModels: string[]
  industries: string[]
  companySizes: string[]
  revenueRangeMin: string
  revenueRangeMax: string
  companyStages: string[]

  // Section 3: Geography
  targetRegions: string[]
  mustOperateIn: string[]

  // Section 4: Digital Characteristics
  digitalPresence: string[]
  techSignals: string[]

  // Section 5: Buying Signals
  buyingSignals: string[]
  customSignals: string

  // Section 6: Exclusions
  exclusionCriteria: string[]
  excludedCompanies: string[]
  excludedIndustries: string[]
}

export const EMPTY_ICP_BUILDER_DATA: ICPBuilderData = {
  companyDescription: '',
  productCategory: '',
  existingCustomers: [],
  businessModels: [],
  industries: [],
  companySizes: [],
  revenueRangeMin: '',
  revenueRangeMax: '',
  companyStages: [],
  targetRegions: [],
  mustOperateIn: [],
  digitalPresence: [],
  techSignals: [],
  buyingSignals: [],
  customSignals: '',
  exclusionCriteria: [],
  excludedCompanies: [],
  excludedIndustries: [],
}
