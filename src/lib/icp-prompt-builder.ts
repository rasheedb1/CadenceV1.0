import type { ICPBuilderData } from '@/types/icp-builder'
import {
  COMPANY_SIZES,
  BUYING_SIGNALS,
  DIGITAL_PRESENCE_SIGNALS,
  EXCLUSION_CRITERIA,
} from './icp-constants'

/** Convert structured ICP builder data into an optimized natural-language prompt */
export function buildICPPrompt(data: ICPBuilderData): string {
  const sections: string[] = []

  // Section 1: About the company
  if (data.companyDescription || data.productCategory || data.existingCustomers.length > 0) {
    const parts: string[] = []
    if (data.companyDescription) {
      parts.push(`We are a company that ${data.companyDescription.trim()}.`)
    }
    if (data.productCategory) {
      parts.push(`Our product is in the ${data.productCategory} category.`)
    }
    if (data.existingCustomers.length > 0) {
      parts.push(
        `Our existing customers include: ${data.existingCustomers.join(', ')}. Find companies similar to these.`
      )
    }
    sections.push(`ABOUT US:\n${parts.join(' ')}`)
  }

  // Section 2: Target company profile
  const profileParts: string[] = []
  if (data.businessModels.length > 0) {
    profileParts.push(`Business models: ${data.businessModels.join(', ')}`)
  }
  if (data.industries.length > 0) {
    profileParts.push(`Industries: ${data.industries.join(', ')}`)
  }
  if (data.companySizes.length > 0) {
    const sizeLabels = data.companySizes.map(v => {
      const match = COMPANY_SIZES.find(s => s.value === v)
      return match ? `${match.label} (${match.range})` : v
    })
    profileParts.push(`Company size: ${sizeLabels.join(', ')}`)
  }
  if (data.revenueRangeMin || data.revenueRangeMax) {
    const min = data.revenueRangeMin || 'any'
    const max = data.revenueRangeMax || 'any'
    profileParts.push(`Annual revenue: ${min} to ${max}`)
  }
  if (data.companyStages.length > 0) {
    profileParts.push(`Company stage: ${data.companyStages.join(', ')}`)
  }
  if (profileParts.length > 0) {
    sections.push(`TARGET COMPANY PROFILE:\n${profileParts.map(p => `- ${p}`).join('\n')}`)
  }

  // Section 3: Geography
  const geoParts: string[] = []
  if (data.targetRegions.length > 0) {
    geoParts.push(`Target regions: ${data.targetRegions.join(', ')}`)
  }
  if (data.mustOperateIn.length > 0) {
    geoParts.push(`Must operate in: ${data.mustOperateIn.join(', ')}`)
  }
  if (geoParts.length > 0) {
    sections.push(`GEOGRAPHY:\n${geoParts.map(p => `- ${p}`).join('\n')}`)
  }

  // Section 4: Digital characteristics
  const digitalParts: string[] = []
  if (data.digitalPresence.length > 0) {
    const labels = data.digitalPresence.map(v => {
      const match = DIGITAL_PRESENCE_SIGNALS.find(s => s.value === v)
      return match ? match.label : v
    })
    digitalParts.push(`Digital presence: ${labels.join(', ')}`)
  }
  if (data.techSignals.length > 0) {
    digitalParts.push(`Technology stack includes: ${data.techSignals.join(', ')}`)
  }
  if (digitalParts.length > 0) {
    sections.push(`DIGITAL & TECH SIGNALS:\n${digitalParts.map(p => `- ${p}`).join('\n')}`)
  }

  // Section 5: Buying signals
  const signalParts: string[] = []
  if (data.buyingSignals.length > 0) {
    const labels = data.buyingSignals.map(v => {
      const match = BUYING_SIGNALS.find(s => s.value === v)
      return match ? `${match.label} (${match.description})` : v
    })
    signalParts.push(...labels.map(l => `Prioritize: ${l}`))
  }
  if (data.customSignals.trim()) {
    signalParts.push(`Additional signals: ${data.customSignals.trim()}`)
  }
  if (signalParts.length > 0) {
    sections.push(`BUYING SIGNALS:\n${signalParts.map(p => `- ${p}`).join('\n')}`)
  }

  // Section 6: Exclusions
  const exclusionParts: string[] = []
  if (data.exclusionCriteria.length > 0) {
    const labels = data.exclusionCriteria.map(v => {
      const match = EXCLUSION_CRITERIA.find(e => e.value === v)
      return match ? match.label : v
    })
    exclusionParts.push(`Exclude companies that: ${labels.join('; ')}`)
  }
  if (data.excludedCompanies.length > 0) {
    exclusionParts.push(`Exclude these specific companies: ${data.excludedCompanies.join(', ')}`)
  }
  if (data.excludedIndustries.length > 0) {
    exclusionParts.push(`Exclude these industries: ${data.excludedIndustries.join(', ')}`)
  }
  if (exclusionParts.length > 0) {
    sections.push(`EXCLUSIONS:\n${exclusionParts.map(p => `- ${p}`).join('\n')}`)
  }

  if (sections.length === 0) {
    return ''
  }

  return `Find companies that match this Ideal Customer Profile:\n\n${sections.join('\n\n')}\n\nFor each company found, evaluate fit based on: industry match, company size, geography, business model alignment, digital presence, and detected buying signals.`
}

/** Check if any meaningful data has been entered in the builder */
export function isICPBuilderPopulated(data: ICPBuilderData): boolean {
  return !!(
    data.companyDescription ||
    data.productCategory ||
    data.existingCustomers.length > 0 ||
    data.businessModels.length > 0 ||
    data.industries.length > 0 ||
    data.companySizes.length > 0 ||
    data.targetRegions.length > 0 ||
    data.digitalPresence.length > 0 ||
    data.buyingSignals.length > 0
  )
}
