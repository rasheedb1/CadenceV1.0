import { useState, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  AlertTriangle,
  Users,
  Copy,
  UserX,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'

// ── Column definitions grouped by category ──────────────────────
const EXPECTED_COLUMNS = [
  // Required
  { key: 'first_name', label: 'First Name', required: true, group: 'required' },
  { key: 'last_name', label: 'Last Name', required: true, group: 'required' },
  { key: 'title', label: 'Title', required: true, group: 'required' },
  { key: 'company', label: 'Company', required: true, group: 'required' },
  // Contact — at least one needed
  { key: 'email', label: 'Email', required: false, group: 'contact' },
  { key: 'linkedin_url', label: 'LinkedIn URL', required: false, group: 'contact' },
  { key: 'phone', label: 'Phone', required: false, group: 'contact' },
  // Optional enrichment
  { key: 'industry', label: 'Industry', required: false, group: 'optional' },
  { key: 'website', label: 'Website', required: false, group: 'optional' },
  { key: 'company_linkedin_url', label: 'Company LinkedIn', required: false, group: 'optional' },
  { key: 'annual_revenue', label: 'Annual Revenue', required: false, group: 'optional' },
  { key: 'total_funding', label: 'Total Funding', required: false, group: 'optional' },
  { key: 'latest_funding', label: 'Latest Funding', required: false, group: 'optional' },
  { key: 'latest_funding_amount', label: 'Latest Funding Amount', required: false, group: 'optional' },
  { key: 'department', label: 'Department', required: false, group: 'optional' },
  { key: 'corporate_phone', label: 'Corporate Phone', required: false, group: 'optional' },
  { key: 'personal_phone', label: 'Personal Phone', required: false, group: 'optional' },
] as const

type ColumnKey = (typeof EXPECTED_COLUMNS)[number]['key']
type Step = 'upload' | 'mapping' | 'review' | 'importing' | 'result'

interface ParsedRow {
  [key: string]: string
}

interface ColumnMapping {
  [expectedColumn: string]: string | null
}

interface ImportError {
  row: number
  error: string
  data?: Record<string, unknown>
}

interface ImportResult {
  success: boolean
  imported: number
  updated: number
  errors: ImportError[]
  message: string
}

interface TransformedRow {
  [key: string]: string | undefined
}

interface DuplicateInfo {
  email: string
  existingLead: { id: string; first_name: string; last_name: string; company: string | null }
  newRow: TransformedRow
  action: 'skip' | 'replace'
}

interface ImportLeadsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preSelectedCadenceId?: string
}

export function ImportLeadsDialog({ open, onOpenChange, preSelectedCadenceId }: ImportLeadsDialogProps) {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { cadences } = useCadence()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Core state
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [selectedCadenceId, setSelectedCadenceId] = useState<string>(preSelectedCadenceId || '')

  // Review state
  const [validLeads, setValidLeads] = useState<TransformedRow[]>([])
  const [noContactLeads, setNoContactLeads] = useState<TransformedRow[]>([])
  const [invalidLeads, setInvalidLeads] = useState<{ row: TransformedRow; reason: string }[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([])
  const [existingToAdd, setExistingToAdd] = useState<{id: string, email: string}[]>([])
  const [includeNoContact, setIncludeNoContact] = useState(false)
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)

  // Import state
  const [, setIsLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // ── Column alias detection (Apollo CSV compatible) ────────────
  function getColumnAliases(key: ColumnKey): string[] {
    const aliases: Record<ColumnKey, string[]> = {
      first_name: ['first_name', 'firstname', 'first', 'given_name', 'givenname'],
      last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name', 'familyname'],
      title: ['title', 'job_title', 'jobtitle', 'position', 'role'],
      company: ['company', 'organization', 'org', 'employer', 'company_name', 'company_name_for_emails'],
      email: ['email', 'email_address', 'emailaddress', 'e_mail'],
      linkedin_url: ['linkedin_url', 'linkedin', 'linkedinurl', 'linkedin_profile', 'linkedin_link', 'person_linkedin_url'],
      phone: ['phone', 'phone_number', 'phonenumber', 'telephone', 'mobile', 'cell', 'work_direct_phone'],
      industry: ['industry'],
      website: ['website'],
      company_linkedin_url: ['company_linkedin_url'],
      annual_revenue: ['annual_revenue'],
      total_funding: ['total_funding'],
      latest_funding: ['latest_funding'],
      latest_funding_amount: ['latest_funding_amount'],
      department: ['department', 'sub_departments'],
      corporate_phone: ['corporate_phone'],
      personal_phone: ['personal_phone', 'mobile_phone', 'home_phone'],
    }
    return aliases[key] || [key]
  }

  function normalizeHeader(header: string): string {
    return header.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }

  const autoDetectMapping = useCallback((headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {}
    const normalizedHeaders = headers.map((h) => normalizeHeader(h))

    EXPECTED_COLUMNS.forEach((col) => {
      const possibleNames = getColumnAliases(col.key)

      // 1st pass: exact match
      let matchIndex = normalizedHeaders.findIndex((h) =>
        possibleNames.some((name) => h === name)
      )

      // 2nd pass: contains match (only with aliases >= 5 chars to avoid false positives)
      if (matchIndex < 0) {
        matchIndex = normalizedHeaders.findIndex((h) =>
          possibleNames.some((name) => name.length >= 5 && h.includes(name))
        )
      }

      mapping[col.key] = matchIndex >= 0 ? headers[matchIndex] : null
    })

    return mapping
  }, [])

  // ── Read file as text with encoding detection ──────────────
  async function readFileAsText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Detect UTF-16 LE (BOM: FF FE)
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buffer)
    }
    // Detect UTF-16 BE (BOM: FE FF)
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(buffer)
    }
    // Detect UTF-16 LE without BOM (null bytes in even positions)
    if (bytes.length >= 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
      return new TextDecoder('utf-16le').decode(buffer)
    }

    // Default: UTF-8 (handles UTF-8 BOM automatically)
    return new TextDecoder('utf-8').decode(buffer)
  }

  // Fix CSV files where each data row is wrapped in one big quote
  // (common in Salesforce/Apollo exports)
  // Pattern: header row is normal, but data rows are like: "val1,val2,val3,..."
  function fixWholeRowQuoting(text: string): string {
    const lines = text.split('\n')
    if (lines.length < 2) return text

    const headerLine = lines[0]
    const fixedLines = [headerLine]

    for (let i = 1; i < lines.length; i++) {
      let line = lines[i].trim()
      if (!line) continue

      // Check if the entire line is wrapped in quotes: starts with " and ends with "
      // but the header line is NOT quoted
      if (line.startsWith('"') && line.endsWith('"') && !headerLine.startsWith('"')) {
        // Unwrap the outer quotes
        line = line.slice(1, -1)
        // Inside, doubled quotes ("") that represent empty fields or escaped quotes
        // need to be converted back to proper CSV quoting.
        // The pattern from Apollo: """" means an empty quoted field (literal "")
        // and ""value"" means a quoted value with commas inside
        // We need to: replace """" with "" (empty string) and ""text"" with "text"
        // Strategy: replace the internal doubled-quote escaping
        // First handle empty fields: ,"""", → ,"",  (which is just an empty string in CSV)
        // Handle quoted fields with content: ,""value"", → ,"value",
        line = line.replace(/""([^"]*)""/g, (_match, content) => {
          if (!content) return '' // """" → empty
          return `"${content}"` // ""value"" → "value"
        })
      }
      fixedLines.push(line)
    }

    return fixedLines.join('\n')
  }

  // Check if parsed data actually has values in multiple columns
  function isParseValid(result: Papa.ParseResult<ParsedRow>): boolean {
    const headers = result.meta.fields || []
    const firstRow = result.data[0]
    if (headers.length <= 1 || !firstRow) return false

    const nonEmptyValues = headers.filter((h) => {
      const val = firstRow[h]
      return val && String(val).trim() !== ''
    })
    return nonEmptyValues.length >= 2
  }

  // Parse CSV text with multiple fallback strategies
  function parseCsvText(text: string): Papa.ParseResult<ParsedRow> {
    const parseOpts = {
      header: true,
      skipEmptyLines: 'greedy' as const,
      transformHeader: (h: string) => h.trim(),
    }

    // Strategy 1: standard auto-detect parse
    const result = Papa.parse<ParsedRow>(text, parseOpts)
    if (isParseValid(result)) return result

    // Strategy 2: fix whole-row quoting (Salesforce/Apollo format)
    const fixedText = fixWholeRowQuoting(text)
    if (fixedText !== text) {
      const fixedResult = Papa.parse<ParsedRow>(fixedText, parseOpts)
      if (isParseValid(fixedResult)) return fixedResult
    }

    // Strategy 3: semicolon delimiter (European CSV exports)
    const semiResult = Papa.parse<ParsedRow>(text, { ...parseOpts, delimiter: ';' })
    if (isParseValid(semiResult)) return semiResult

    // Strategy 4: tab delimiter
    const tabResult = Papa.parse<ParsedRow>(text, { ...parseOpts, delimiter: '\t' })
    if (isParseValid(tabResult)) return tabResult

    // Return the result with most headers
    return result
  }

  // ── File parsing ──────────────────────────────────────────────
  const parseFile = useCallback(
    async (selectedFile: File) => {
      setIsParsing(true)
      setParseError(null)
      setParsedData([])
      setOriginalHeaders([])
      setColumnMapping({})

      try {
        const extension = selectedFile.name.split('.').pop()?.toLowerCase()

        if (extension === 'csv') {
          // Read file with proper encoding detection
          let text = await readFileAsText(selectedFile)

          // Strip BOM character
          text = text.replace(/^\uFEFF/, '')

          // Normalize line endings
          text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

          const results = parseCsvText(text)

          // Check for fatal errors
          const fatalErrors = results.errors.filter(
            (e) => e.type !== 'FieldMismatch'
          )
          if (fatalErrors.length > 0 && results.data.length === 0) {
            setParseError(`CSV parsing error: ${fatalErrors[0].message}`)
            setIsParsing(false)
            return
          }

          const headers = results.meta.fields || []

          if (headers.length <= 1) {
            setParseError('Could not detect columns. The file may not be a valid CSV.')
            setIsParsing(false)
            return
          }

          // Filter out empty rows
          const cleanData = results.data.filter((row) =>
            Object.values(row).some((v) => v && String(v).trim() !== '')
          )

          if (cleanData.length === 0) {
            setParseError('No data rows found in the file')
            setIsParsing(false)
            return
          }

          setOriginalHeaders(headers)
          setParsedData(cleanData)
          setColumnMapping(autoDetectMapping(headers))
          setIsParsing(false)
          setStep('mapping')
        } else if (extension === 'xlsx' || extension === 'xls') {
          const arrayBuffer = await selectedFile.arrayBuffer()
          const workbook = XLSX.read(arrayBuffer, { type: 'array' })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, { header: 1 })

          if (jsonData.length < 2) {
            setParseError('File must have a header row and at least one data row')
            setIsParsing(false)
            return
          }

          const headers = (jsonData[0] as unknown as string[]).map(String)
          const dataRows = jsonData.slice(1).map((row) => {
            const rowObj: ParsedRow = {}
            headers.forEach((header, index) => {
              rowObj[header] = String((row as unknown as string[])[index] || '')
            })
            return rowObj
          })

          setOriginalHeaders(headers)
          setParsedData(dataRows)
          setColumnMapping(autoDetectMapping(headers))
          setIsParsing(false)
          setStep('mapping')
        } else {
          setParseError('Unsupported file format. Please use .csv or .xlsx files.')
          setIsParsing(false)
        }
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Failed to parse file')
        setIsParsing(false)
      }
    },
    [autoDetectMapping]
  )

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0]
      if (selectedFile) {
        setFile(selectedFile)
        parseFile(selectedFile)
      }
    },
    [parseFile]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const droppedFile = event.dataTransfer.files[0]
      if (droppedFile) {
        setFile(droppedFile)
        parseFile(droppedFile)
      }
    },
    [parseFile]
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])

  const updateMapping = useCallback((expectedColumn: string, sourceColumn: string | null) => {
    setColumnMapping((prev) => ({
      ...prev,
      [expectedColumn]: sourceColumn === 'none' ? null : sourceColumn,
    }))
  }, [])

  // ── Transform parsed data using column mapping ────────────────
  const transformData = useCallback((): TransformedRow[] => {
    return parsedData.map((row) => {
      const transformed: TransformedRow = {}
      EXPECTED_COLUMNS.forEach((col) => {
        const sourceColumn = columnMapping[col.key]
        if (sourceColumn) {
          transformed[col.key] = row[sourceColumn] || undefined
        }
      })
      return transformed
    })
  }, [parsedData, columnMapping])

  // ── Validate and check duplicates ─────────────────────────────
  const handleProceedToReview = useCallback(async () => {
    setIsCheckingDuplicates(true)
    const transformed = transformData()

    let valid: TransformedRow[] = []
    let noContact: TransformedRow[] = []
    const invalid: { row: TransformedRow; reason: string }[] = []

    // Categorize each row
    for (const row of transformed) {
      const firstName = row.first_name?.trim()
      const lastName = row.last_name?.trim()
      const title = row.title?.trim()
      const company = row.company?.trim()

      // Missing required fields
      const missingFields: string[] = []
      if (!firstName) missingFields.push('First Name')
      if (!lastName) missingFields.push('Last Name')
      if (!title) missingFields.push('Title')
      if (!company) missingFields.push('Company')

      if (missingFields.length > 0) {
        invalid.push({ row, reason: `Missing: ${missingFields.join(', ')}` })
        continue
      }

      // Check contact info
      const hasEmail = !!row.email?.trim()
      const hasLinkedin = !!row.linkedin_url?.trim()
      const hasPhone = !!row.phone?.trim()

      if (!hasEmail && !hasLinkedin && !hasPhone) {
        noContact.push(row)
      } else {
        valid.push(row)
      }
    }

    // Deduplicate rows within the CSV by email (keep first occurrence)
    const seenEmails = new Set<string>()
    const deduplicateRows = (rows: TransformedRow[]): TransformedRow[] => {
      return rows.filter((r) => {
        const email = r.email?.trim().toLowerCase()
        if (!email) return true // Keep rows without email (can't dedup)
        if (seenEmails.has(email)) return false
        seenEmails.add(email)
        return true
      })
    }
    valid = deduplicateRows(valid)
    noContact = deduplicateRows(noContact)

    // Check for duplicates by email
    const emailsToCheck = [...valid, ...noContact]
      .map((r) => r.email?.trim())
      .filter((e): e is string => !!e && e.length > 0)

    const uniqueEmails = [...new Set(emailsToCheck)]
    const foundDuplicates: DuplicateInfo[] = []
    const foundExistingToAdd: {id: string, email: string}[] = []

    if (uniqueEmails.length > 0 && user) {
      // Query existing leads by email in batches of 50
      const allExistingLeads: {id: string; first_name: string; last_name: string; company: string | null; email: string}[] = []
      for (let i = 0; i < uniqueEmails.length; i += 50) {
        const batch = uniqueEmails.slice(i, i + 50)
        const { data: existing } = await supabase
          .from('leads')
          .select('id, first_name, last_name, company, email')
          .eq('org_id', orgId!)
          .in('email', batch)

        if (existing) {
          allExistingLeads.push(...existing)
        }
      }

      // If a cadence is selected, check which existing leads are already in it
      const cadenceId = selectedCadenceId && selectedCadenceId !== 'none' ? selectedCadenceId : null
      const leadsInCadence = new Set<string>()

      if (cadenceId && allExistingLeads.length > 0) {
        const existingLeadIds = allExistingLeads.map(l => l.id)
        for (let i = 0; i < existingLeadIds.length; i += 50) {
          const batch = existingLeadIds.slice(i, i + 50)
          const { data: cadenceLeadData } = await supabase
            .from('cadence_leads')
            .select('lead_id')
            .eq('cadence_id', cadenceId)
            .in('lead_id', batch)

          if (cadenceLeadData) {
            for (const cl of cadenceLeadData) {
              leadsInCadence.add(cl.lead_id)
            }
          }
        }
      }

      for (const lead of allExistingLeads) {
        const matchingRow = [...valid, ...noContact].find(
          (r) => r.email?.trim().toLowerCase() === lead.email?.toLowerCase()
        )
        if (!matchingRow) continue

        if (cadenceId) {
          if (leadsInCadence.has(lead.id)) {
            // Already in this cadence — true duplicate
            foundDuplicates.push({
              email: lead.email!,
              existingLead: lead,
              newRow: matchingRow,
              action: 'skip',
            })
          } else {
            // Exists globally but NOT in this cadence — just add to cadence
            foundExistingToAdd.push({ id: lead.id, email: lead.email! })
          }
        } else {
          // No cadence selected — global duplicate check
          foundDuplicates.push({
            email: lead.email!,
            existingLead: lead,
            newRow: matchingRow,
            action: 'skip',
          })
        }
      }
    }

    setValidLeads(valid)
    setNoContactLeads(noContact)
    setInvalidLeads(invalid)
    setDuplicates(foundDuplicates)
    setExistingToAdd(foundExistingToAdd)
    setIsCheckingDuplicates(false)
    setStep('review')
  }, [transformData, user, selectedCadenceId])

  // ── Import execution ──────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    setStep('importing')

    try {
      // Build final row lists
      const duplicateEmails = new Set(duplicates.map((d) => d.email.toLowerCase()))
      const duplicatesToReplace = duplicates.filter((d) => d.action === 'replace')
      const duplicatesToSkip = new Set(
        duplicates.filter((d) => d.action === 'skip').map((d) => d.email.toLowerCase())
      )

      // New rows: valid leads that aren't duplicates + optionally noContact leads
      const newRows = [
        ...validLeads.filter((r) => {
          const email = r.email?.trim().toLowerCase()
          if (!email) return true
          return !duplicateEmails.has(email)
        }),
        ...(includeNoContact
          ? noContactLeads.filter((r) => {
              const email = r.email?.trim().toLowerCase()
              if (!email) return true
              return !duplicateEmails.has(email)
            })
          : []),
      ]

      // Upsert rows: duplicates user chose to replace
      const upsertRows = duplicatesToReplace.map((d) => d.newRow)

      // Also skip duplicates the user chose to skip — they're just excluded
      // Filter out any newRows that are in the skip set
      const finalNewRows = newRows.filter((r) => {
        const email = r.email?.trim().toLowerCase()
        if (!email) return true
        return !duplicatesToSkip.has(email)
      })

      // Filter out leads that already exist globally and just need cadence assignment
      const existingToAddEmails = new Set(existingToAdd.map(e => e.email.toLowerCase()))
      const trulyNewRows = finalNewRows.filter((r) => {
        const email = r.email?.trim().toLowerCase()
        if (!email) return true
        return !existingToAddEmails.has(email)
      })

      if (trulyNewRows.length === 0 && upsertRows.length === 0 && existingToAdd.length === 0) {
        setImportResult({
          success: true,
          imported: 0,
          updated: 0,
          errors: [],
          message: 'No leads to import after applying filters.',
        })
        setStep('result')
        setIsLoading(false)
        return
      }

      const response = await supabase.functions.invoke('import-leads', {
        body: {
          rows: trulyNewRows,
          upsertRows,
          existingLeadIds: existingToAdd.map(e => e.id),
          cadenceId: selectedCadenceId && selectedCadenceId !== 'none' ? selectedCadenceId : null,
        },
      })

      if (response.error) {
        throw new Error(response.error.message)
      }

      const result = response.data as ImportResult
      setImportResult(result)
      setStep('result')

      if (result.success && (result.imported > 0 || result.updated > 0)) {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
        queryClient.invalidateQueries({ queryKey: ['cadence-leads'] })
        queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        updated: 0,
        errors: [],
        message: error instanceof Error ? error.message : 'Import failed',
      })
      setStep('result')
    } finally {
      setIsLoading(false)
    }
  }, [user, validLeads, noContactLeads, includeNoContact, duplicates, existingToAdd, selectedCadenceId, queryClient])

  // ── Reset everything ──────────────────────────────────────────
  const handleClose = useCallback(
    (openState: boolean) => {
      if (!openState) {
        setStep('upload')
        setFile(null)
        setParsedData([])
        setOriginalHeaders([])
        setColumnMapping({})
        setImportResult(null)
        setParseError(null)
        setSelectedCadenceId(preSelectedCadenceId || '')
        setValidLeads([])
        setNoContactLeads([])
        setInvalidLeads([])
        setDuplicates([])
        setExistingToAdd([])
        setIncludeNoContact(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
      onOpenChange(openState)
    },
    [onOpenChange, preSelectedCadenceId]
  )

  // ── Derived state ─────────────────────────────────────────────
  const requiredMappingsComplete = EXPECTED_COLUMNS.filter((col) => col.required).every(
    (col) => columnMapping[col.key] !== null && columnMapping[col.key] !== undefined
  )

  const mappedCount = EXPECTED_COLUMNS.filter((col) => columnMapping[col.key]).length

  const totalToImport =
    validLeads.filter((r) => {
      const email = r.email?.trim().toLowerCase()
      const dupEmails = new Set(duplicates.map((d) => d.email.toLowerCase()))
      if (!email) return true
      return !dupEmails.has(email)
    }).length +
    (includeNoContact
      ? noContactLeads.filter((r) => {
          const email = r.email?.trim().toLowerCase()
          const dupEmails = new Set(duplicates.map((d) => d.email.toLowerCase()))
          if (!email) return true
          return !dupEmails.has(email)
        }).length
      : 0) +
    duplicates.filter((d) => d.action === 'replace').length

  // ── Render helpers ────────────────────────────────────────────
  const renderColumnGroup = (group: string, title: string) => {
    const cols = EXPECTED_COLUMNS.filter((c) => c.group === group)
    return (
      <div key={group} className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        <div className="grid grid-cols-2 gap-2">
          {cols.map((col) => (
            <div key={col.key} className="flex items-center gap-2">
              <Label className="text-sm min-w-[120px] truncate">
                {col.label}
                {col.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <Select
                value={columnMapping[col.key] || 'none'}
                onValueChange={(value) => updateMapping(col.key, value)}
              >
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Not mapped --</SelectItem>
                  {originalHeaders.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const stepTitles: Record<Step, string> = {
    upload: 'Upload File',
    mapping: 'Map Columns',
    review: 'Review & Warnings',
    importing: 'Importing...',
    result: 'Import Complete',
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Leads — {stepTitles[step]}</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV or Excel file to import multiple leads at once'}
            {step === 'mapping' && `${parsedData.length} rows found — Map your file columns to lead fields`}
            {step === 'review' && 'Review warnings before importing'}
            {step === 'importing' && 'Please wait while your leads are being imported...'}
            {step === 'result' && 'Import process completed'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step !== 'upload' && step !== 'result' && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
            {['upload', 'mapping', 'review', 'importing'].map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span
                  className={
                    s === step ? 'font-semibold text-foreground' : s < step ? 'text-primary' : ''
                  }
                >
                  {i + 1}. {stepTitles[s as Step]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* ── STEP: Upload ─────────────────────────────────── */}
          {step === 'upload' && (
            <>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium">Drop your file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports CSV and Excel files (.csv, .xlsx)</p>
              </div>

              {isParsing && (
                <div className="flex items-center justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mr-3" />
                  <span className="text-sm">Parsing file...</span>
                </div>
              )}

              {parseError && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Failed to parse file</p>
                    <p className="text-sm mt-1">{parseError}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP: Column Mapping ─────────────────────────── */}
          {step === 'mapping' && file && parsedData.length > 0 && (
            <>
              {/* File info bar */}
              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedData.length} rows &middot; {mappedCount}/{EXPECTED_COLUMNS.length} columns mapped
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep('upload')
                    setFile(null)
                    setParsedData([])
                    setOriginalHeaders([])
                    setColumnMapping({})
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Change file
                </Button>
              </div>

              {/* Unmapped required fields warning */}
              {!requiredMappingsComplete && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Some required columns couldn't be auto-detected. Please map them manually below.
                    {' '}Detected {originalHeaders.length} columns in your file: {originalHeaders.slice(0, 5).join(', ')}{originalHeaders.length > 5 ? '...' : ''}
                  </p>
                </div>
              )}

              {/* Column mapping grouped */}
              <div className="space-y-4">
                {renderColumnGroup('required', 'Required Fields')}
                {renderColumnGroup('contact', 'Contact Info (at least one recommended)')}
                {renderColumnGroup('optional', 'Optional / Enrichment')}
              </div>

              {/* Cadence Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Add to Cadence (Optional)</Label>
                <Select value={selectedCadenceId} onValueChange={setSelectedCadenceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cadence (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- No cadence --</SelectItem>
                    {cadences
                      .filter((c) => c.status === 'active' || c.status === 'draft')
                      .map((cadence) => (
                        <SelectItem key={cadence.id} value={cadence.id}>
                          {cadence.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview table */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Preview (first 3 rows)</Label>
                <ScrollArea className="border rounded-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {EXPECTED_COLUMNS.filter((col) => columnMapping[col.key]).map((col) => (
                            <th key={col.key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.slice(0, 3).map((row, index) => (
                          <tr key={index} className="border-b last:border-0">
                            {EXPECTED_COLUMNS.filter((col) => columnMapping[col.key]).map((col) => (
                              <td key={col.key} className="px-2 py-1.5 truncate max-w-[150px]">
                                {columnMapping[col.key] ? row[columnMapping[col.key]!] || '-' : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          {/* ── STEP: Review Warnings ────────────────────────── */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Import Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{validLeads.length} valid leads ready to import</span>
                  </div>
                  {noContactLeads.length > 0 && (
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4 text-amber-500" />
                      <span>{noContactLeads.length} without contact info</span>
                    </div>
                  )}
                  {existingToAdd.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-500" />
                      <span>{existingToAdd.length} existing leads will be added to cadence</span>
                    </div>
                  )}
                  {duplicates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Copy className="h-4 w-4 text-blue-500" />
                      <span>{duplicates.length} duplicates found</span>
                    </div>
                  )}
                  {invalidLeads.length > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span>{invalidLeads.length} excluded (missing required fields)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning 1: Missing contact info */}
              {noContactLeads.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {noContactLeads.length} leads without contact info
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        These leads have no email, LinkedIn URL, or phone number. They won't be contactable through cadences.
                      </p>
                    </div>
                  </div>
                  <ScrollArea className="max-h-28">
                    <div className="space-y-1">
                      {noContactLeads.slice(0, 10).map((lead, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          {lead.first_name} {lead.last_name} — {lead.company || 'No company'}
                        </p>
                      ))}
                      {noContactLeads.length > 10 && (
                        <p className="text-xs text-muted-foreground italic">
                          ...and {noContactLeads.length - 10} more
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="include-no-contact"
                      checked={includeNoContact}
                      onCheckedChange={(checked) => setIncludeNoContact(checked === true)}
                    />
                    <label htmlFor="include-no-contact" className="text-sm cursor-pointer">
                      Include leads without contact info anyway
                    </label>
                  </div>
                </div>
              )}

              {/* Warning 2: Duplicates */}
              {duplicates.length > 0 && (
                <div className="border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {duplicates.length} duplicate leads found
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedCadenceId && selectedCadenceId !== 'none'
                          ? 'These leads are already in this cadence. Choose to replace their data or don\'t add them.'
                          : 'These emails already exist in your leads. Choose to replace (update) or skip each one.'}
                      </p>
                    </div>
                  </div>
                  {/* Global actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDuplicates((prev) => prev.map((d) => ({ ...d, action: 'replace' })))
                      }
                    >
                      Replace All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDuplicates((prev) => prev.map((d) => ({ ...d, action: 'skip' })))
                      }
                    >
                      Skip All
                    </Button>
                  </div>
                  <ScrollArea className="max-h-40">
                    <div className="space-y-2">
                      {duplicates.map((dup, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm bg-white dark:bg-background rounded p-2 border"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">
                              {dup.newRow.first_name} {dup.newRow.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{dup.email}</p>
                          </div>
                          <div className="flex gap-1 ml-2 flex-shrink-0">
                            <Button
                              variant={dup.action === 'replace' ? 'default' : 'outline'}
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() =>
                                setDuplicates((prev) =>
                                  prev.map((d, idx) => (idx === i ? { ...d, action: 'replace' } : d))
                                )
                              }
                            >
                              {selectedCadenceId && selectedCadenceId !== 'none' ? 'Replace data' : 'Replace'}
                            </Button>
                            <Button
                              variant={dup.action === 'skip' ? 'default' : 'outline'}
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() =>
                                setDuplicates((prev) =>
                                  prev.map((d, idx) => (idx === i ? { ...d, action: 'skip' } : d))
                                )
                              }
                            >
                              {selectedCadenceId && selectedCadenceId !== 'none' ? "Don't add" : 'Skip'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Warning 3: Invalid / excluded leads */}
              {invalidLeads.length > 0 && (
                <div className="border border-destructive/20 bg-destructive/5 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {invalidLeads.length} leads excluded (missing required fields)
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        These leads are missing First Name, Last Name, Title, or Company and will not be imported.
                      </p>
                    </div>
                  </div>
                  <ScrollArea className="max-h-28">
                    <div className="space-y-1">
                      {invalidLeads.slice(0, 10).map((item, i) => (
                        <p key={i} className="text-xs text-muted-foreground truncate">
                          {[item.row.first_name, item.row.last_name].filter(Boolean).join(' ') || `Row ${i + 1}`}
                          {item.row.company ? ` (${item.row.company})` : ''} — {item.reason}
                        </p>
                      ))}
                      {invalidLeads.length > 10 && (
                        <p className="text-xs text-muted-foreground italic">
                          ...and {invalidLeads.length - 10} more
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Final count */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                <p className="text-sm font-medium">
                  {totalToImport} leads will be imported
                  {duplicates.filter((d) => d.action === 'replace').length > 0 &&
                    ` (${duplicates.filter((d) => d.action === 'replace').length} will be updated)`}
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: Importing ──────────────────────────────── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent mb-4" />
              <p className="text-sm font-medium">Importing leads...</p>
              <p className="text-xs text-muted-foreground mt-1">This may take a moment</p>
            </div>
          )}

          {/* ── STEP: Result ─────────────────────────────────── */}
          {step === 'result' && importResult && (
            <div
              className={`p-4 rounded-lg ${
                importResult.success ? 'bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-200' : 'bg-destructive/10 text-destructive'
              }`}
            >
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{importResult.message}</p>
                  {importResult.imported > 0 && (
                    <p className="text-sm mt-1">{importResult.imported} new leads imported</p>
                  )}
                  {importResult.updated > 0 && (
                    <p className="text-sm mt-1">{importResult.updated} existing leads updated</p>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium mb-1">
                        Errors ({importResult.errors.length}):
                      </p>
                      <ScrollArea className="max-h-32">
                        <ul className="text-sm space-y-1">
                          {importResult.errors.slice(0, 10).map((err, index) => (
                            <li key={index}>
                              Row {err.row}: {err.error}
                            </li>
                          ))}
                          {importResult.errors.length > 10 && (
                            <li>...and {importResult.errors.length - 10} more errors</li>
                          )}
                        </ul>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <DialogFooter>
          {step === 'result' ? (
            <Button onClick={() => handleClose(false)}>Close</Button>
          ) : step === 'review' ? (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleImport} disabled={totalToImport === 0}>
                Import {totalToImport} Leads
              </Button>
            </>
          ) : step === 'mapping' ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleProceedToReview}
                disabled={!requiredMappingsComplete || isCheckingDuplicates}
              >
                {isCheckingDuplicates ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                    Checking...
                  </>
                ) : (
                  <>
                    Review & Import <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </>
          ) : step === 'upload' ? (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
