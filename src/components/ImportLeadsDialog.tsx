import { useState, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react'

// Expected columns for lead import
const EXPECTED_COLUMNS = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'company', label: 'Company', required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'linkedin_url', label: 'LinkedIn URL', required: true },
  { key: 'phone', label: 'Phone', required: false },
] as const

type ColumnKey = (typeof EXPECTED_COLUMNS)[number]['key']

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
  errors: ImportError[]
  message: string
}

interface ImportLeadsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preSelectedCadenceId?: string
}

export function ImportLeadsDialog({ open, onOpenChange, preSelectedCadenceId }: ImportLeadsDialogProps) {
  const { user } = useAuth()
  const { cadences } = useCadence()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [selectedCadenceId, setSelectedCadenceId] = useState<string>(preSelectedCadenceId || '')

  // Auto-detect column mapping based on header names
  const autoDetectMapping = useCallback((headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {}
    const normalizedHeaders = headers.map((h) => normalizeHeader(h))

    EXPECTED_COLUMNS.forEach((col) => {
      const possibleNames = getColumnAliases(col.key)
      const matchIndex = normalizedHeaders.findIndex((h) =>
        possibleNames.some((name) => h === name || h.includes(name))
      )
      mapping[col.key] = matchIndex >= 0 ? headers[matchIndex] : null
    })

    return mapping
  }, [])

  // Get possible aliases for a column
  function getColumnAliases(key: ColumnKey): string[] {
    const aliases: Record<ColumnKey, string[]> = {
      first_name: ['first_name', 'firstname', 'first', 'given_name', 'givenname'],
      last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name', 'familyname'],
      email: ['email', 'email_address', 'emailaddress', 'e_mail'],
      company: ['company', 'organization', 'org', 'employer', 'company_name'],
      title: ['title', 'job_title', 'jobtitle', 'position', 'role'],
      linkedin_url: ['linkedin_url', 'linkedin', 'linkedinurl', 'linkedin_profile', 'linkedin_link'],
      phone: ['phone', 'phone_number', 'phonenumber', 'telephone', 'mobile', 'cell'],
    }
    return aliases[key] || [key]
  }

  // Normalize header for comparison
  function normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
  }

  // Parse file content
  const parseFile = useCallback(
    async (selectedFile: File) => {
      setIsParsing(true)
      setParseError(null)
      setParsedData([])
      setOriginalHeaders([])
      setColumnMapping({})
      setImportResult(null)

      try {
        const extension = selectedFile.name.split('.').pop()?.toLowerCase()

        if (extension === 'csv') {
          // Parse CSV with Papa Parse
          Papa.parse<ParsedRow>(selectedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              if (results.errors.length > 0) {
                setParseError(`CSV parsing error: ${results.errors[0].message}`)
                setIsParsing(false)
                return
              }

              const headers = results.meta.fields || []
              setOriginalHeaders(headers)
              setParsedData(results.data)
              setColumnMapping(autoDetectMapping(headers))
              setIsParsing(false)
            },
            error: (error) => {
              setParseError(`Failed to parse CSV: ${error.message}`)
              setIsParsing(false)
            },
          })
        } else if (extension === 'xlsx' || extension === 'xls') {
          // Parse Excel with XLSX
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

          // First row is headers
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

  // Handle file selection
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

  // Handle drag and drop
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

  // Update column mapping
  const updateMapping = useCallback((expectedColumn: string, sourceColumn: string | null) => {
    setColumnMapping((prev) => ({
      ...prev,
      [expectedColumn]: sourceColumn === 'none' ? null : sourceColumn,
    }))
  }, [])

  // Transform parsed data to import format
  const transformDataForImport = useCallback(() => {
    return parsedData.map((row) => {
      const transformed: Record<string, string | undefined> = {}
      EXPECTED_COLUMNS.forEach((col) => {
        const sourceColumn = columnMapping[col.key]
        if (sourceColumn) {
          transformed[col.key] = row[sourceColumn] || undefined
        }
      })
      return transformed
    })
  }, [parsedData, columnMapping])

  // Import leads
  const handleImport = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    setImportResult(null)

    try {
      const rows = transformDataForImport()

      // Get session for auth header
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session')
      }

      // Call Edge Function with cadence ID
      const response = await supabase.functions.invoke('import-leads', {
        body: { rows, cadenceId: selectedCadenceId && selectedCadenceId !== 'none' ? selectedCadenceId : null },
      })

      if (response.error) {
        throw new Error(response.error.message)
      }

      const result = response.data as ImportResult
      setImportResult(result)

      // Refresh leads list on success
      if (result.success && result.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        errors: [],
        message: error instanceof Error ? error.message : 'Import failed',
      })
    } finally {
      setIsLoading(false)
    }
  }, [user, transformDataForImport, queryClient, selectedCadenceId])

  // Reset dialog state
  const handleClose = useCallback(
    (openState: boolean) => {
      if (!openState) {
        setFile(null)
        setParsedData([])
        setOriginalHeaders([])
        setColumnMapping({})
        setImportResult(null)
        setParseError(null)
        setSelectedCadenceId(preSelectedCadenceId || '')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
      onOpenChange(openState)
    },
    [onOpenChange, preSelectedCadenceId]
  )

  // Check if required mappings are complete
  const requiredMappingsComplete = EXPECTED_COLUMNS.filter((col) => col.required).every(
    (col) => columnMapping[col.key] !== null && columnMapping[col.key] !== undefined
  )

  // Get preview rows (first 5)
  const previewRows = parsedData.slice(0, 5)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to import multiple leads at once
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* File Upload Section */}
          {!file && !importResult && (
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
              <p className="text-xs text-muted-foreground mt-1">Supports CSV and Excel files</p>
            </div>
          )}

          {/* Parsing indicator */}
          {isParsing && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-3" />
              <span>Parsing file...</span>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Failed to parse file</p>
                <p className="text-sm mt-1">{parseError}</p>
              </div>
            </div>
          )}

          {/* File info and column mapping */}
          {file && parsedData.length > 0 && !importResult && (
            <>
              {/* File info */}
              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{parsedData.length} rows found</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFile(null)
                    setParsedData([])
                    setOriginalHeaders([])
                    setColumnMapping({})
                    if (fileInputRef.current) {
                      fileInputRef.current.value = ''
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Column Mapping */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Column Mapping</Label>
                <p className="text-xs text-muted-foreground">
                  Map your file columns to lead fields. Required fields are marked with *.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {EXPECTED_COLUMNS.map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Label className="text-sm min-w-[100px]">
                        {col.label}
                        {col.required && <span className="text-destructive">*</span>}
                      </Label>
                      <Select
                        value={columnMapping[col.key] || 'none'}
                        onValueChange={(value) => updateMapping(col.key, value)}
                      >
                        <SelectTrigger className="flex-1">
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

              {/* Cadence Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Add to Cadence (Optional)</Label>
                <Select
                  value={selectedCadenceId}
                  onValueChange={setSelectedCadenceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cadence (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- No cadence --</SelectItem>
                    {cadences
                      .filter((c) => c.status === 'active')
                      .map((cadence) => (
                        <SelectItem key={cadence.id} value={cadence.id}>
                          {cadence.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Imported leads will be added to this cadence and marked as active.
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Preview (first 5 rows)</Label>
                <ScrollArea className="border rounded-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {EXPECTED_COLUMNS.filter((col) => columnMapping[col.key]).map((col) => (
                            <th key={col.key} className="px-3 py-2 text-left font-medium">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, index) => (
                          <tr key={index} className="border-b last:border-0">
                            {EXPECTED_COLUMNS.filter((col) => columnMapping[col.key]).map((col) => (
                              <td key={col.key} className="px-3 py-2 truncate max-w-[200px]">
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

          {/* Import Result */}
          {importResult && (
            <div
              className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 text-green-800' : 'bg-destructive/10 text-destructive'}`}
            >
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{importResult.message}</p>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium mb-1">Errors ({importResult.errors.length}):</p>
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

        <DialogFooter>
          {importResult ? (
            <Button onClick={() => handleClose(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={isLoading || !file || parsedData.length === 0 || !requiredMappingsComplete}
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                    Importing...
                  </>
                ) : (
                  `Import ${parsedData.length} Leads`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
