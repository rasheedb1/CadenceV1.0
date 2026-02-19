import { useState, useMemo } from 'react'
import { useAccountMapping } from '@/contexts/AccountMappingContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ShieldCheck,
  Upload,
  Plus,
  Search,
  Trash2,
  Loader2,
  Building2,
  ExternalLink,
} from 'lucide-react'
import type { RegistryType, CompanyRegistryEntry } from '@/types/registry'
import { REGISTRY_TYPE_CONFIG } from '@/types/registry'
import { ImportExclusionDialog } from '@/components/registry/ImportExclusionDialog'
import { AddExclusionDialog } from '@/components/registry/AddExclusionDialog'
import { PermissionGate } from '@/components/PermissionGate'
import { useSalesforceCheck, type SalesforceMatch } from '@/hooks/useSalesforceCheck'
import { SalesforceBadge } from '@/components/salesforce/SalesforceBadge'

type FilterType = 'all' | RegistryType

export function CompanyRegistry() {
  const { companyRegistry, registryLoading, deleteRegistryEntry } = useAccountMapping()

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Salesforce pipeline check
  const registryCompanyNames = useMemo(() => companyRegistry.map(e => e.company_name_display), [companyRegistry])
  const { isInPipeline: sfIsInPipeline } = useSalesforceCheck(undefined, registryCompanyNames, companyRegistry.length > 0)

  const filtered = useMemo(() => {
    let list = companyRegistry
    if (filterType !== 'all') {
      list = list.filter(e => e.registry_type === filterType)
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(e =>
        e.company_name_display.toLowerCase().includes(q) ||
        (e.industry && e.industry.toLowerCase().includes(q)) ||
        (e.website && e.website.toLowerCase().includes(q))
      )
    }
    return list
  }, [companyRegistry, filterType, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: companyRegistry.length }
    for (const e of companyRegistry) {
      c[e.registry_type] = (c[e.registry_type] || 0) + 1
    }
    return c
  }, [companyRegistry])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(e => e.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setIsDeleting(true)
    try {
      for (const id of selectedIds) {
        await deleteRegistryEntry(id)
      }
      setSelectedIds(new Set())
    } catch (err) {
      console.error('Bulk delete error:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExportCsv = () => {
    const rows = filtered.map(e => ({
      company_name: e.company_name_display,
      type: e.registry_type,
      website: e.website || '',
      industry: e.industry || '',
      location: e.location || '',
      exclusion_reason: e.exclusion_reason || '',
      source: e.source,
      prospected_at: e.prospected_at || '',
      created_at: e.created_at,
    }))
    const headers = Object.keys(rows[0] || {})
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String((r as Record<string, string>)[h]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'company_registry.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Company Registry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona tu lista de empresas: clientes, competidores, DNC y prospectados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Importar CSV
          </Button>
          <PermissionGate permission="registry_create">
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={v => setFilterType(v as FilterType)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({counts.all || 0})</SelectItem>
            <SelectItem value="customer">{REGISTRY_TYPE_CONFIG.customer.label} ({counts.customer || 0})</SelectItem>
            <SelectItem value="competitor">{REGISTRY_TYPE_CONFIG.competitor.label} ({counts.competitor || 0})</SelectItem>
            <SelectItem value="dnc">{REGISTRY_TYPE_CONFIG.dnc.label} ({counts.dnc || 0})</SelectItem>
            <SelectItem value="prospected">{REGISTRY_TYPE_CONFIG.prospected.label} ({counts.prospected || 0})</SelectItem>
            <SelectItem value="discovered">{REGISTRY_TYPE_CONFIG.discovered.label} ({counts.discovered || 0})</SelectItem>
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Eliminar {selectedIds.size}
          </Button>
        )}
      </div>

      {/* Table */}
      {registryLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {companyRegistry.length === 0
              ? 'No hay empresas en el registry'
              : 'No se encontraron resultados'}
          </p>
          {companyRegistry.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Importa un CSV o agrega empresas manualmente.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_120px_140px_120px_100px_80px] gap-2 px-4 py-2.5 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
            <div>
              <Checkbox
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onCheckedChange={toggleSelectAll}
              />
            </div>
            <div>Empresa</div>
            <div>Tipo</div>
            <div>Industria</div>
            <div>Fuente</div>
            <div>Fecha</div>
            <div></div>
          </div>

          {/* Table rows */}
          <div className="divide-y max-h-[calc(100vh-320px)] overflow-y-auto">
            {filtered.map(entry => (
              <RegistryRow
                key={entry.id}
                entry={entry}
                selected={selectedIds.has(entry.id)}
                onToggle={() => toggleSelect(entry.id)}
                onDelete={async () => {
                  await deleteRegistryEntry(entry.id)
                  setSelectedIds(prev => {
                    const next = new Set(prev)
                    next.delete(entry.id)
                    return next
                  })
                }}
                formatDate={formatDate}
                sfMatch={sfIsInPipeline(entry.company_name_display)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ImportExclusionDialog open={showImport} onOpenChange={setShowImport} />
      <AddExclusionDialog open={showAdd} onOpenChange={setShowAdd} />
    </div>
  )
}

function RegistryRow({
  entry,
  selected,
  onToggle,
  onDelete,
  formatDate,
  sfMatch,
}: {
  entry: CompanyRegistryEntry
  selected: boolean
  onToggle: () => void
  onDelete: () => Promise<void>
  formatDate: (d: string) => string
  sfMatch?: SalesforceMatch | null
}) {
  const [deleting, setDeleting] = useState(false)
  const config = REGISTRY_TYPE_CONFIG[entry.registry_type]

  const sourceLabels: Record<string, string> = {
    csv_import: 'CSV',
    manual: 'Manual',
    auto_prospected: 'Auto',
    discovery: 'Discovery',
  }

  return (
    <div className="grid grid-cols-[40px_1fr_120px_140px_120px_100px_80px] gap-2 px-4 py-2.5 items-center text-sm hover:bg-muted/30 transition-colors">
      <div>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{entry.company_name_display}</span>
          <SalesforceBadge match={sfMatch || null} compact />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {entry.website && (
            <a
              href={entry.website.startsWith('http') ? entry.website : `https://${entry.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
              onClick={e => e.stopPropagation()}
            >
              {entry.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {entry.exclusion_reason && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={entry.exclusion_reason}>
              {entry.exclusion_reason}
            </span>
          )}
        </div>
      </div>
      <div>
        <Badge variant="outline" className={`text-[10px] ${config.color}`}>
          {config.label}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {entry.industry || '-'}
      </div>
      <div className="text-xs text-muted-foreground">
        {sourceLabels[entry.source] || entry.source}
      </div>
      <div className="text-xs text-muted-foreground">
        {formatDate(entry.created_at)}
      </div>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={async (e) => {
            e.stopPropagation()
            setDeleting(true)
            try {
              await onDelete()
            } finally {
              setDeleting(false)
            }
          }}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
