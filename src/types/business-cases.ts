export interface BcSlideField {
  key: string
  name: string
  field_type: 'auto' | 'dynamic' | 'fixed'
  output_type: 'text' | 'list' | 'number'
  ai_instruction: string | null
  fallback_behavior: 'use_benchmarks' | 'leave_blank' | 'use_default'
  fallback_default: string | null
  example_output: string | null
  max_length: number
  data_sources: string[]
  sort_order: number
}

export interface BcSlide {
  slide_number: number
  title: string
  type: 'fixed' | 'dynamic' | 'mixed'
  layout: 'cover' | 'title_only' | 'title_and_body' | 'title_and_bullets' | 'two_columns' | 'big_number' | 'comparison_table'
  fixed_content: string | null
  fields: BcSlideField[]
}

// ── PPTX Upload Template types ────────────────────────────────────────────────

/**
 * A variable detected inside an uploaded PPTX template.
 * - type 'auto': filled from lead data using the field_key mapping
 * - type 'ai': Claude generates content based on the instruction
 */
export interface DetectedVariable {
  /** The raw text inside {{ }}, e.g. "empresa" or "AI: Write a value prop" */
  key: string
  /** The full placeholder as it appears in the PPTX, e.g. "{{empresa}}" */
  raw: string
  /** Whether this is auto-filled from lead data or AI-generated */
  type: 'auto' | 'ai'
  /** Lead field to map to (for auto type), e.g. "company", "contact_name" */
  field_key?: string
  /** Instruction for Claude (for ai type) */
  instruction?: string
  /** Human-readable label shown in the UI (optional override of key) */
  display_name?: string
}

// ── Template ──────────────────────────────────────────────────────────────────

export interface BusinessCaseTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  source: 'ai_generated' | 'user_uploaded'
  /** 'ai_structured' = generated via generate-bc-structure, 'uploaded_pptx' = user uploaded */
  template_type: 'ai_structured' | 'uploaded_pptx'
  generation_prompt: string | null
  slide_structure: BcSlide[]
  /** Supabase Storage path for uploaded PPTX files */
  pptx_storage_path: string | null
  /** Variables detected from the uploaded PPTX */
  detected_variables: DetectedVariable[]
  /** Pre-rendered slide thumbnail paths in Supabase Storage (bc-templates bucket) */
  thumbnail_paths: string[] | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Business Case ─────────────────────────────────────────────────────────────

export interface BusinessCase {
  id: string
  org_id: string
  template_id: string
  lead_id: string | null
  company_name: string
  contact_name: string | null
  generated_content: Record<string, string>
  edited_content: Record<string, string> | null
  signals_used: Array<{ name: string; summary: string; sourceUrl?: string }>
  research_data: Record<string, unknown> | null
  status: 'draft' | 'generated' | 'edited' | 'sent'
  created_by: string | null
  created_at: string
  updated_at: string
  template?: BusinessCaseTemplate
}
