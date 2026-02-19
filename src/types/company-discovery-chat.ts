// Types for the Company Discovery Chat feature
// Conversational AI flow for iteratively discovering target companies

import type { ICPBuilderData } from './icp-builder'

/** A company suggested by the AI within a chat turn */
export interface SuggestedCompany {
  company_name: string
  industry: string | null
  company_size: string | null
  website: string | null
  location: string | null
  description: string | null
  reason_for_suggesting: string
}

/** User decision on a suggested company */
export type CompanyDecision = 'accepted' | 'rejected' | 'pending'

/** A suggested company card in the UI, with user decision state */
export interface SuggestedCompanyWithDecision extends SuggestedCompany {
  decision: CompanyDecision
}

/** One message in the conversation */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Only present on assistant messages that include company suggestions */
  companies?: SuggestedCompanyWithDecision[]
  timestamp: Date
}

/** Request body sent to the chat-discover-companies edge function */
export interface ChatDiscoverRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  icpContext: {
    icpDescription: string | null
    builderData: ICPBuilderData | null
  }
  acceptedCompanies: SuggestedCompany[]
  rejectedCompanies: SuggestedCompany[]
  existingCompanyNames: string[]
  userMessage: string
}

/** Response from the chat-discover-companies edge function */
export interface ChatDiscoverResponse {
  success: boolean
  responseText: string
  companies: SuggestedCompany[]
  error?: string
}
