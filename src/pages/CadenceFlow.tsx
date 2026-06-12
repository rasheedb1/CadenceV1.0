import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCadence } from '@/contexts/CadenceContext'
import { CadenceFlowTimeline } from '@/components/cadences/CadenceFlowTimeline'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ExternalLink, Workflow } from 'lucide-react'

export function CadenceFlow() {
  const { id: idFromUrl } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { cadences } = useCadence()

  // Default selection: cadence with most recent updated_at, otherwise first
  const defaultId = useMemo(() => {
    if (cadences.length === 0) return null
    const sorted = [...cadences].sort((a, b) => {
      const aT = new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      const bT = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
      return bT - aT
    })
    return sorted[0].id
  }, [cadences])

  const activeId = idFromUrl ?? defaultId

  useEffect(() => {
    if (!idFromUrl && defaultId) {
      navigate(`/cadence-flow/${defaultId}`, { replace: true })
    }
  }, [idFromUrl, defaultId, navigate])

  if (cadences.length === 0) {
    return (
      <div className="p-8">
        <Card className="border-dashed p-12 text-center">
          <Workflow className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Aún no tienes cadencias</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea una cadencia para empezar a ver su flujo de ejecución aquí.
          </p>
          <Button className="mt-4" onClick={() => navigate('/cadences')}>
            Ir a Cadences
          </Button>
        </Card>
      </div>
    )
  }

  if (!activeId) return null

  const active = cadences.find((c) => c.id === activeId) ?? cadences[0]

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cadence Flow</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vista read-only paso a paso de tu cadencia y cómo está corriendo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {cadences.length > 1 && (
            <Select
              value={activeId}
              onValueChange={(v) => navigate(`/cadence-flow/${v}`)}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cadences.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/cadences/${active.id}`)}
          >
            <ExternalLink className="mr-1 size-4" />
            Open in builder
          </Button>
        </div>
      </div>

      <CadenceFlowTimeline cadenceId={active.id} />
    </div>
  )
}
