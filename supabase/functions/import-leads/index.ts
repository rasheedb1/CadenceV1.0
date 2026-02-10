// Edge Function: Import Leads from CSV
// POST /functions/v1/import-leads
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthUser, logActivity } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface LeadRow {
  first_name: string
  last_name: string
  email?: string
  company?: string
  title?: string
  linkedin_url?: string
  phone?: string
}

interface ImportRequest {
  rows: LeadRow[]
}

interface ImportError {
  row: number
  error: string
  data?: LeadRow
}

// Parse CSV text into rows
function parseCSV(csvText: string): LeadRow[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]).map((h) => normalizeHeader(h))

  // Validate required headers
  if (!headers.includes('first_name') && !headers.includes('firstname')) {
    throw new Error('CSV must have a "first_name" column')
  }
  if (!headers.includes('last_name') && !headers.includes('lastname')) {
    throw new Error('CSV must have a "last_name" column')
  }

  // Parse data rows
  const rows: LeadRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    const row: Record<string, string> = {}

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || ''
    })

    // Map normalized headers to standard field names
    rows.push({
      first_name: row['first_name'] || row['firstname'] || '',
      last_name: row['last_name'] || row['lastname'] || '',
      email: row['email'] || row['email_address'] || undefined,
      company: row['company'] || row['organization'] || undefined,
      title: row['title'] || row['job_title'] || row['position'] || undefined,
      linkedin_url: row['linkedin_url'] || row['linkedin'] || row['linkedinurl'] || undefined,
      phone: row['phone'] || row['phone_number'] || row['phonenumber'] || undefined,
    })
  }

  return rows
}

// Parse a single CSV line, handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

// Normalize header names to snake_case
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// Validate a single lead row
function validateRow(row: LeadRow, index: number): ImportError | null {
  if (!row.first_name || row.first_name.trim() === '') {
    return { row: index, error: 'Missing required field: first_name', data: row }
  }
  if (!row.last_name || row.last_name.trim() === '') {
    return { row: index, error: 'Missing required field: last_name', data: row }
  }

  // Validate email format if provided
  if (row.email && !isValidEmail(row.email)) {
    return { row: index, error: 'Invalid email format', data: row }
  }

  // Validate LinkedIn URL format if provided
  if (row.linkedin_url && !isValidLinkedInUrl(row.linkedin_url)) {
    return { row: index, error: 'Invalid LinkedIn URL format', data: row }
  }

  return null
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function isValidLinkedInUrl(url: string): boolean {
  return url.includes('linkedin.com/in/') || url.includes('linkedin.com/sales/')
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const user = await getAuthUser(authHeader)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    // Determine content type and parse data
    const contentType = req.headers.get('Content-Type') || ''
    let rows: LeadRow[]

    if (contentType.includes('text/csv')) {
      // Parse CSV text directly
      const csvText = await req.text()
      rows = parseCSV(csvText)
    } else if (contentType.includes('application/json')) {
      // Parse JSON with rows array
      const body: ImportRequest = await req.json()
      if (!body.rows || !Array.isArray(body.rows)) {
        return errorResponse('Request body must contain a "rows" array')
      }
      rows = body.rows
    } else {
      return errorResponse('Content-Type must be text/csv or application/json')
    }

    if (rows.length === 0) {
      return errorResponse('No data rows to import')
    }

    // Validate all rows first
    const validationErrors: ImportError[] = []
    const validRows: LeadRow[] = []

    rows.forEach((row, index) => {
      const error = validateRow(row, index + 1) // +1 for 1-based row numbers
      if (error) {
        validationErrors.push(error)
      } else {
        validRows.push(row)
      }
    })

    if (validRows.length === 0) {
      return jsonResponse({
        success: false,
        imported: 0,
        errors: validationErrors,
        message: 'No valid rows to import',
      })
    }

    // Prepare leads for bulk insert
    const leadsToInsert = validRows.map((row) => ({
      owner_id: user.id,
      first_name: row.first_name.trim(),
      last_name: row.last_name.trim(),
      email: row.email?.trim() || null,
      company: row.company?.trim() || null,
      title: row.title?.trim() || null,
      linkedin_url: row.linkedin_url?.trim() || null,
      phone: row.phone?.trim() || null,
      timezone: 'UTC', // Default timezone
      status: 'pending',
    }))

    // Bulk insert leads
    const supabase = createSupabaseClient()
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select('id')

    if (insertError) {
      console.error('Insert error:', insertError)
      return errorResponse(`Failed to import leads: ${insertError.message}`, 500)
    }

    const importedCount = insertedLeads?.length || 0

    // Log activity
    await logActivity({
      ownerId: user.id,
      action: 'import_leads',
      status: 'ok',
      details: {
        imported: importedCount,
        errors: validationErrors.length,
        totalRows: rows.length,
      },
    })

    return jsonResponse({
      success: true,
      imported: importedCount,
      errors: validationErrors,
      message: `Successfully imported ${importedCount} leads${validationErrors.length > 0 ? ` with ${validationErrors.length} errors` : ''}`,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
