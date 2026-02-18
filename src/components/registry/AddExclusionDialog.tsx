import { useState, useCallback } from 'react'
import { useAccountMapping } from '@/contexts/AccountMappingContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { ShieldX, Loader2 } from 'lucide-react'
import type { RegistryType } from '@/types/registry'
import { REGISTRY_TYPE_CONFIG } from '@/types/registry'

interface AddExclusionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultRegistryType?: RegistryType
}

export function AddExclusionDialog({ open, onOpenChange, defaultRegistryType = 'customer' }: AddExclusionDialogProps) {
  const { addRegistryEntry } = useAccountMapping()

  const [companyName, setCompanyName] = useState('')
  const [registryType, setRegistryType] = useState<RegistryType>(defaultRegistryType)
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [exclusionReason, setExclusionReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setCompanyName('')
    setRegistryType(defaultRegistryType)
    setWebsite('')
    setIndustry('')
    setLocation('')
    setExclusionReason('')
    setIsSaving(false)
    setError(null)
  }, [defaultRegistryType])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(resetForm, 300)
  }, [onOpenChange, resetForm])

  const handleSave = useCallback(async () => {
    if (!companyName.trim()) {
      setError('El nombre de la empresa es requerido')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await addRegistryEntry({
        company_name_display: companyName.trim(),
        registry_type: registryType,
        source: 'manual',
        website: website.trim() || null,
        industry: industry.trim() || null,
        location: location.trim() || null,
        exclusion_reason: exclusionReason.trim() || null,
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }, [companyName, registryType, website, industry, location, exclusionReason, addRegistryEntry, handleClose])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-orange-500" />
            Agregar Empresa a Exclusion
          </DialogTitle>
          <DialogDescription>
            Agrega una empresa manualmente a la lista de exclusion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Company name (required) */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Nombre de empresa <span className="text-destructive">*</span>
            </Label>
            <Input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Ej: Salesforce"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* Registry type */}
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

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Website</Label>
              <Input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="ejemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Industria</Label>
              <Input
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                placeholder="Tecnologia"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ubicacion</Label>
            <Input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Mexico, LATAM"
            />
          </div>

          {/* Exclusion reason */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Razon de exclusion</Label>
            <Textarea
              value={exclusionReason}
              onChange={e => setExclusionReason(e.target.value)}
              placeholder="Ej: Cliente existente desde 2023"
              rows={2}
              className="resize-none"
            />
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !companyName.trim()}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Agregar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
