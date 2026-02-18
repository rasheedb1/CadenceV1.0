import { useState, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useAccountMapping } from '@/contexts/AccountMappingContext'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldX,
  Loader2,
} from 'lucide-react'
import type { RegistryType } from '@/types/registry'
import { REGISTRY_TYPE_CONFIG } from '@/types/registry'

// ── Column definitions ──
const EXPECTED_COLUMNS = [
  { key: 'company_name', label: 'Nombre de Empresa', required: true },
  { key: 'website', label: 'Website', required: false },
  { key: 'industry', label: 'Industria', required: false },
] as const

type ColumnKey = (typeof EXPECTED_COLUMNS)[number]['key']
type Step = 'upload' | 'mapping' | 'review' | 'importing' | 'result'

interface ParsedRow {
  [key: string]: string
}

interface ColumnMapping {
  [expectedColumn: string]: string | null
}

interface ImportExclusionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultRegistryType?: RegistryType
}

export function ImportExclusionDialog({ open, onOpenChange, defaultRegistryType = 'customer' }: ImportExclusionDialogProps) {
  const { addRegistryEntries } = useAccountMapping()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Core state
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Config
  const [registryType, setRegistryType] = useState<RegistryType>(defaultRegistryType)
  const [exclusionReason, setExclusionReason] = useState('')

  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)

  // ── Column alias detection ──
  function getColumnAliases(key: ColumnKey): string[] {
    const aliases: Record<ColumnKey, string[]> = {
      company_name: ['company_name', 'company', 'organization', 'org', 'empresa', 'nombre_empresa', 'company_name_for_emails', 'account_name', 'account'],
      website: ['website', 'url', 'domain', 'sitio_web', 'company_website', 'web'],
      industry: ['industry', 'industria', 'sector', 'vertical'],
    }
    return aliases[key] || [key]
  }

  function normalizeHeader(header: string): string {
    return header.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }

  const autoDetectMapping = useCallback((headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {}
    const normalizedHeaders = headers.map(h => normalizeHeader(h))

    EXPECTED_COLUMNS.forEach(col => {
      const possibleNames = getColumnAliases(col.key)
      let matchIndex = normalizedHeaders.findIndex(h =>
        possibleNames.some(name => h === name)
      )
      if (matchIndex < 0) {
        matchIndex = normalizedHeaders.findIndex(h =>
          possibleNames.some(name => name.length >= 5 && h.includes(name))
        )
      }
      mapping[col.key] = matchIndex >= 0 ? headers[matchIndex] : null
    })

    return mapping
  }, [])

  // ── Read file as text with encoding detection ──
  async function readFileAsText(f: File): Promise<string> {
    const buffer = await f.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buffer)
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(buffer)
    }
    if (bytes.length >= 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
      return new TextDecoder('utf-16le').decode(buffer)
    }
    return new TextDecoder('utf-8').decode(buffer)
  }

  // Fix whole-row quoting (Apollo/Salesforce CSV pattern)
  function fixWholeRowQuoting(text: string): string {
    const lines = text.split('\n')
    if (lines.length < 2) return text
    const headerLine = lines[0]
    const fixedLines = [headerLine]
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i].trim()
      if (!line) continue
      if (line.startsWith('"') && line.endsWith('"') && !headerLine.startsWith('"')) {
        line = line.slice(1, -1)
        line = line.replace(/""([^"]*)""/g, (_match, content) => {
          if (!content) return ''
          return `"${content}"`
        })
      }
      fixedLines.push(line)
    }
    return fixedLines.join('\n')
  }

  function isParseValid(result: Papa.ParseResult<ParsedRow>): boolean {
    const headers = result.meta.fields || []
    const firstRow = result.data[0]
    if (headers.length <= 1 || !firstRow) return false
    const nonEmptyValues = headers.filter(h => {
      const val = firstRow[h]
      return val && String(val).trim() !== ''
    })
    return nonEmptyValues.length >= 1
  }

  function parseCsvText(text: string): Papa.ParseResult<ParsedRow> {
    const parseOpts = {
      header: true,
      skipEmptyLines: 'greedy' as const,
      transformHeader: (h: string) => h.trim(),
    }
    const result = Papa.parse<ParsedRow>(text, parseOpts)
    if (isParseValid(result)) return result

    const fixedText = fixWholeRowQuoting(text)
    if (fixedText !== text) {
      const fixedResult = Papa.parse<ParsedRow>(fixedText, parseOpts)
      if (isParseValid(fixedResult)) return fixedResult
    }

    const semiResult = Papa.parse<ParsedRow>(text, { ...parseOpts, delimiter: ';' })
    if (isParseValid(semiResult)) return semiResult

    const tabResult = Papa.parse<ParsedRow>(text, { ...parseOpts, delimiter: '\t' })
    if (isParseValid(tabResult)) return tabResult

    return result
  }

  // ── File parsing ──
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
          let text = await readFileAsText(selectedFile)
          text = text.replace(/^\uFEFF/, '')
          text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

          const results = parseCsvText(text)
          const fatalErrors = results.errors.filter(e => e.type !== 'FieldMismatch')
          if (fatalErrors.length > 0 && results.data.length === 0) {
            setParseError(`Error de parsing CSV: ${fatalErrors[0].message}`)
            setIsParsing(false)
            return
          }

          const headers = results.meta.fields || []
          if (headers.length < 1) {
            setParseError('No se detectaron columnas. El archivo puede no ser un CSV valido.')
            setIsParsing(false)
            return
          }

          const cleanData = results.data.filter(row =>
            Object.values(row).some(v => v && String(v).trim() !== '')
          )
          if (cleanData.length === 0) {
            setParseError('No se encontraron filas de datos en el archivo')
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
            setParseError('El archivo debe tener una fila de encabezado y al menos una fila de datos')
            setIsParsing(false)
            return
          }

          const headers = (jsonData[0] as unknown as string[]).map(String)
          const dataRows = jsonData.slice(1).map(row => {
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
          setParseError('Formato no soportado. Usa archivos .csv o .xlsx')
          setIsParsing(false)
        }
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Error al parsear el archivo')
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
    setColumnMapping(prev => ({
      ...prev,
      [expectedColumn]: sourceColumn === 'none' ? null : sourceColumn,
    }))
  }, [])

  // ── Transform parsed data using column mapping ──
  const getPreviewCompanies = useCallback((): Array<{ company_name: string; website?: string; industry?: string }> => {
    if (!columnMapping.company_name) return []
    const seen = new Set<string>()
    const companies: Array<{ company_name: string; website?: string; industry?: string }> = []

    for (const row of parsedData) {
      const name = row[columnMapping.company_name!]?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      companies.push({
        company_name: name,
        website: columnMapping.website ? row[columnMapping.website]?.trim() || undefined : undefined,
        industry: columnMapping.industry ? row[columnMapping.industry]?.trim() || undefined : undefined,
      })
    }
    return companies
  }, [parsedData, columnMapping])

  // ── Import ──
  const handleImport = useCallback(async () => {
    setIsImporting(true)
    setImportError(null)

    try {
      const companies = getPreviewCompanies()
      if (companies.length === 0) {
        setImportError('No hay empresas para importar')
        setIsImporting(false)
        return
      }

      const entries = companies.map(c => ({
        company_name_display: c.company_name,
        registry_type: registryType,
        source: 'csv_import' as const,
        website: c.website || null,
        industry: c.industry || null,
        exclusion_reason: exclusionReason.trim() || null,
      }))

      const count = await addRegistryEntries(entries)
      setImportedCount(count)
      setStep('result')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Error al importar')
    } finally {
      setIsImporting(false)
    }
  }, [getPreviewCompanies, registryType, exclusionReason, addRegistryEntries])

  // ── Reset & close ──
  const resetDialog = useCallback(() => {
    setStep('upload')
    setFile(null)
    setParsedData([])
    setOriginalHeaders([])
    setColumnMapping({})
    setIsParsing(false)
    setParseError(null)
    setRegistryType(defaultRegistryType)
    setExclusionReason('')
    setIsImporting(false)
    setImportedCount(0)
    setImportError(null)
  }, [defaultRegistryType])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(resetDialog, 300)
  }, [onOpenChange, resetDialog])

  const isMappingValid = !!columnMapping.company_name
  const previewCompanies = step === 'review' || step === 'importing' ? getPreviewCompanies() : []

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-orange-500" />
            Importar Lista de Exclusion
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Sube un CSV o Excel con nombres de empresas para excluir del discovery.'}
            {step === 'mapping' && `${parsedData.length} filas encontradas. Mapea la columna de nombre de empresa.`}
            {step === 'review' && `${previewCompanies.length} empresas unicas listas para importar.`}
            {step === 'importing' && 'Importando empresas...'}
            {step === 'result' && `${importedCount} empresas importadas exitosamente.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {isParsing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Procesando archivo...</p>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-green-500" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Click para cambiar archivo
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Arrastra un archivo o haz click para seleccionar
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CSV, XLS, XLSX
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
            />
            {parseError && (
              <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Mapping ── */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {EXPECTED_COLUMNS.map(col => (
                <div key={col.key} className="flex items-center gap-3">
                  <Label className="text-sm w-36 shrink-0">
                    {col.label}
                    {col.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={columnMapping[col.key] || 'none'}
                    onValueChange={v => updateMapping(col.key, v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleccionar columna..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- No mapear --</SelectItem>
                      {originalHeaders.map(header => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview first 3 rows */}
            {columnMapping.company_name && (
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">Vista previa:</p>
                <div className="space-y-1">
                  {parsedData.slice(0, 3).map((row, i) => (
                    <p key={i} className="text-sm truncate">
                      {row[columnMapping.company_name!] || '(vacio)'}
                      {columnMapping.website && row[columnMapping.website] && (
                        <span className="text-muted-foreground ml-2">
                          - {row[columnMapping.website]}
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {!isMappingValid && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Debes mapear la columna de nombre de empresa</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Review ── */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Registry type selector */}
            <div className="space-y-1.5">
              <Label className="text-sm">Tipo de registro</Label>
              <Select value={registryType} onValueChange={v => setRegistryType(v as RegistryType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">{REGISTRY_TYPE_CONFIG.customer.label}</SelectItem>
                  <SelectItem value="competitor">{REGISTRY_TYPE_CONFIG.competitor.label}</SelectItem>
                  <SelectItem value="dnc">{REGISTRY_TYPE_CONFIG.dnc.label}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Optional exclusion reason */}
            <div className="space-y-1.5">
              <Label className="text-sm">Razon de exclusion (opcional)</Label>
              <Textarea
                value={exclusionReason}
                onChange={e => setExclusionReason(e.target.value)}
                placeholder="Ej: Clientes actuales Q1 2025"
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Company list preview */}
            <div className="space-y-1.5">
              <Label className="text-sm">{previewCompanies.length} empresas a importar</Label>
              <ScrollArea className="h-[200px] rounded-md border">
                <div className="p-2 space-y-1">
                  {previewCompanies.map((c, i) => (
                    <div key={i} className="text-sm py-1 px-2 rounded hover:bg-muted/50 flex items-center justify-between">
                      <span className="truncate">{c.company_name}</span>
                      {c.industry && (
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{c.industry}</span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {importError && (
              <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Importing ── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando {previewCompanies.length} empresas...</p>
          </div>
        )}

        {/* ── Step: Result ── */}
        {step === 'result' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {importedCount} empresas importadas como {REGISTRY_TYPE_CONFIG[registryType].label}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Estas empresas seran excluidas automaticamente del discovery.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => { setStep('upload'); setFile(null) }}>
                Atras
              </Button>
              <Button onClick={() => setStep('review')} disabled={!isMappingValid}>
                Continuar
              </Button>
            </>
          )}

          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Atras
              </Button>
              <Button onClick={handleImport} disabled={isImporting || previewCompanies.length === 0}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <ShieldX className="h-4 w-4 mr-2" />
                    Importar {previewCompanies.length} empresas
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'result' && (
            <Button onClick={handleClose}>
              <X className="h-4 w-4 mr-2" />
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
