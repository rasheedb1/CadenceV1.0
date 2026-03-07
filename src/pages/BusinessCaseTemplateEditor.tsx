import { useParams, useNavigate } from 'react-router-dom'
import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Trash2,
  Sparkles,
  Upload,
  FileUp,
  Bot,
  Zap,
  RefreshCw,
  CheckCircle,
  Loader2,
  Save,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  Eye,
  X,
  ZoomIn,
  ZoomOut,
  Move,
  ChevronLeft,
} from 'lucide-react'
import { useBusinessCases } from '@/contexts/BusinessCasesContext'
import { parsePptxVariables } from '@/lib/pptx-parser'
import {
  parsePptxSlides,
  saveShapePositionsToStorage,
  type ParsedSlide,
  type ParsedShape,
} from '@/lib/pptx-slide-parser'
import { supabase } from '@/integrations/supabase/client'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'
import type { BcSlide, DetectedVariable } from '@/types/business-cases'

// ── Lead field options ────────────────────────────────────────────────────────

const LEAD_FIELD_OPTIONS = [
  { value: 'company', label: 'Company Name' },
  { value: 'contact_name', label: 'Full Name' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email Address' },
  { value: 'title', label: 'Job Title' },
  { value: 'industry', label: 'Industry' },
  { value: 'website', label: 'Website URL' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'date', label: "Today's Date" },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
]

// ── Rendering helpers ─────────────────────────────────────────────────────────

const VAR_RE = /(\{\{[^}]+\}\})/g


function getNativeDims(slide: ParsedSlide) {
  return {
    nativeW: (slide.slideWEmu / 914400) * 96,
    nativeH: (slide.slideHEmu / 914400) * 96,
  }
}

function alignToCSS(align?: string): React.CSSProperties['textAlign'] {
  if (align === 'ctr') return 'center'
  if (align === 'r') return 'right'
  if (align === 'just') return 'justify'
  return 'left'
}

// ── Render a text run, splitting out {{variable}} chips ───────────────────────

function RenderRun({
  run,
  scale,
  variables,
  highlighted,
  onVarClick,
}: {
  run: import('@/lib/pptx-slide-parser').TextRun
  scale: number
  variables: DetectedVariable[]
  highlighted: string | null
  onVarClick: (key: string) => void
}) {
  const baseFontPx = run.fontSize
    ? (run.fontSize / 100) * (96 / 72) * scale
    : 11 * scale

  const baseStyle: React.CSSProperties = {
    fontSize: baseFontPx,
    fontWeight: run.bold ? '700' : '400',
    fontStyle: run.italic ? 'italic' : 'normal',
    color: run.color ? `#${run.color}` : undefined,
    lineHeight: 1.2,
    whiteSpace: 'pre-wrap',
  }

  const parts = run.text.split(VAR_RE)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{([^}]+)\}\}$/)
        if (!m) return <span key={i} style={baseStyle}>{part}</span>
        const key = m[1].trim()
        const v = variables.find((x) => x.key === key)
        const isAI = v?.type === 'ai'
        const isHL = highlighted === key
        return (
          <span
            key={i}
            style={{
              fontSize: Math.max(baseFontPx * 0.85, 8 * scale),
              fontWeight: '600',
              borderRadius: 3 * scale,
              padding: `${scale}px ${2 * scale}px`,
              cursor: 'pointer',
              display: 'inline-block',
              verticalAlign: 'middle',
              lineHeight: 1,
              backgroundColor: isHL ? '#FEF08A' : isAI ? '#BFDBFE' : '#BBF7D0',
              color: isHL ? '#713F12' : isAI ? '#1E40AF' : '#14532D',
              outline: isHL ? `${1.5 * scale}px solid #FACC15` : 'none',
            }}
            onClick={(e) => { e.stopPropagation(); onVarClick(key) }}
          >
            {part}
          </span>
        )
      })}
    </>
  )
}

// ── SlideCanvas: renders one slide at a given display width ───────────────────

interface SlideCanvasProps {
  slide: ParsedSlide
  displayWidth: number
  variables: DetectedVariable[]
  highlighted: string | null
  onVarClick: (key: string) => void
  /** Override positions for dragged shapes { shapeId → {xEmu, yEmu} } */
  posOverrides?: Map<string, { xEmu: number; yEmu: number }>
  /** Whether shapes with variables are draggable */
  draggable?: boolean
  onShapeDragEnd?: (shapeId: string, xEmu: number, yEmu: number) => void
  className?: string
}

function SlideCanvas({
  slide,
  displayWidth,
  variables,
  highlighted,
  onVarClick,
  posOverrides,
  draggable,
  onShapeDragEnd,
  className = '',
}: SlideCanvasProps) {
  const { nativeW, nativeH } = getNativeDims(slide)
  const scale = displayWidth / nativeW
  const displayH = displayWidth * (nativeH / nativeW)

  const dragRef = useRef<{
    shapeId: string
    startClientX: number
    startClientY: number
    origXEmu: number
    origYEmu: number
  } | null>(null)

  const [localOverrides, setLocalOverrides] = useState<Map<string, { xEmu: number; yEmu: number }>>(
    new Map(),
  )

  const getPos = (shape: ParsedShape) => {
    const ext = localOverrides.get(shape.id) ?? posOverrides?.get(shape.id)
    return ext ?? { xEmu: shape.xEmu, yEmu: shape.yEmu }
  }

  const hasVars = (shape: ParsedShape) =>
    shape.paragraphs.some((p) => p.runs.some((r) => VAR_RE.test(r.text)))

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, shape: ParsedShape) => {
      if (!draggable || !hasVars(shape)) return
      e.preventDefault()
      const { xEmu, yEmu } = getPos(shape)
      dragRef.current = {
        shapeId: shape.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origXEmu: xEmu,
        origYEmu: yEmu,
      }
    },
    [draggable, posOverrides, localOverrides],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startClientX
      const dy = e.clientY - dragRef.current.startClientY
      // Convert screen pixels → EMU
      const dxEmu = (dx / displayWidth) * slide.slideWEmu
      const dyEmu = (dy / displayH) * slide.slideHEmu
      setLocalOverrides((prev) =>
        new Map(prev).set(dragRef.current!.shapeId, {
          xEmu: dragRef.current!.origXEmu + dxEmu,
          yEmu: dragRef.current!.origYEmu + dyEmu,
        }),
      )
    }
    const handleUp = () => {
      if (dragRef.current) {
        const final = localOverrides.get(dragRef.current.shapeId)
        if (final && onShapeDragEnd) {
          onShapeDragEnd(dragRef.current.shapeId, final.xEmu, final.yEmu)
        }
        dragRef.current = null
      }
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [displayWidth, displayH, slide, localOverrides, onShapeDragEnd])

  return (
    <div
      className={`bg-white border border-border shadow-sm rounded overflow-hidden flex-shrink-0 ${className}`}
      style={{ width: displayWidth, height: displayH, position: 'relative' }}
    >
      {slide.shapes.map((shape) => {
        const { xEmu, yEmu } = getPos(shape)
        const shapeHasVars = hasVars(shape)
        const isDragging = dragRef.current?.shapeId === shape.id
        return (
          <div
            key={shape.id}
            style={{
              position: 'absolute',
              left: (xEmu / slide.slideWEmu) * displayWidth,
              top: (yEmu / slide.slideHEmu) * displayH,
              width: (shape.wEmu / slide.slideWEmu) * displayWidth,
              minHeight: (shape.hEmu / slide.slideHEmu) * displayH,
              backgroundColor: shape.fillHex ? `#${shape.fillHex}` : 'transparent',
              cursor: draggable && shapeHasVars ? (isDragging ? 'grabbing' : 'grab') : 'default',
              outline: isDragging ? `${Math.max(1, 1.5 * scale)}px dashed #3B82F6` : 'none',
              overflow: 'hidden',
              padding: `${0.5 * scale}px`,
            }}
            onMouseDown={(e) => handleMouseDown(e, shape)}
          >
            {shape.paragraphs.map((para, pi) => (
              <div key={pi} style={{ textAlign: alignToCSS(para.align) }}>
                {para.runs.map((run, ri) => (
                  <RenderRun
                    key={ri}
                    run={run}
                    scale={scale}
                    variables={variables}
                    highlighted={highlighted}
                    onVarClick={onVarClick}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      })}
      {slide.shapes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
          Slide {slide.index}
        </div>
      )}
    </div>
  )
}

// ── Full-screen slide modal ───────────────────────────────────────────────────

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const MODAL_BASE_W = 880 // base render width at zoom=1

interface PendingMove {
  shapeId: string
  xEmu: number
  yEmu: number
}

function FullSlideModal({
  slides,
  initialIndex,
  variables,
  storagePath,
  onClose,
  onVarClick,
  highlighted,
}: {
  slides: ParsedSlide[]
  initialIndex: number
  variables: DetectedVariable[]
  storagePath: string | null
  onClose: () => void
  onVarClick: (key: string) => void
  highlighted: string | null
}) {
  const [currentIdx, setCurrentIdx] = useState(initialIndex)
  const [zoomIdx, setZoomIdx] = useState(2) // default 1×
  const [pendingMoves, setPendingMoves] = useState<PendingMove[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const slide = slides.find((s) => s.index === currentIdx)
  const zoom = ZOOM_LEVELS[zoomIdx]
  const displayW = MODAL_BASE_W * zoom

  const handleShapeDragEnd = useCallback(
    (shapeId: string, xEmu: number, yEmu: number) => {
      setPendingMoves((prev) => {
        const next = prev.filter((m) => m.shapeId !== shapeId)
        next.push({ shapeId, xEmu, yEmu })
        return next
      })
    },
    [],
  )

  const handleSaveLayout = async () => {
    if (!storagePath || pendingMoves.length === 0 || !slide) return
    setIsSaving(true)
    try {
      await saveShapePositionsToStorage(storagePath, slide.index, pendingMoves)
      setPendingMoves([])
      toast.success('Slide layout saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save layout')
    } finally {
      setIsSaving(false)
    }
  }

  const posOverridesMap = useMemo(() => {
    const m = new Map<string, { xEmu: number; yEmu: number }>()
    for (const pm of pendingMoves) m.set(pm.shapeId, { xEmu: pm.xEmu, yEmu: pm.yEmu })
    return m
  }, [pendingMoves])

  if (!slide) return null

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[98vw] w-[1200px] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden">
        {/* Modal toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentIdx <= (slides[0]?.index ?? 1)}
              onClick={() => setCurrentIdx((i) => {
                const idx = slides.findIndex((s) => s.index === i)
                return slides[Math.max(0, idx - 1)]?.index ?? i
              })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[80px] text-center">
              Slide {currentIdx} / {slides.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentIdx >= (slides[slides.length - 1]?.index ?? 1)}
              onClick={() => setCurrentIdx((i) => {
                const idx = slides.findIndex((s) => s.index === i)
                return slides[Math.min(slides.length - 1, idx + 1)]?.index ?? i
              })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingMoves.length > 0 && (
              <Button size="sm" className="h-7 text-xs mr-2" onClick={handleSaveLayout} disabled={isSaving}>
                {isSaving
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Saving…</>
                  : <><Save className="h-3 w-3 mr-1" />Save Layout</>
                }
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoomIdx === 0} onClick={() => setZoomIdx((z) => z - 1)}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoomIdx === ZOOM_LEVELS.length - 1} onClick={() => setZoomIdx((z) => z + 1)}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-2" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Slide thumbnails strip */}
          <div className="w-[120px] shrink-0 bg-muted/20 border-r overflow-y-auto flex flex-col gap-1.5 p-1.5">
            {slides.map((s) => (
              <button
                key={s.index}
                type="button"
                className={`rounded border-2 overflow-hidden transition-colors ${s.index === currentIdx ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
                onClick={() => setCurrentIdx(s.index)}
              >
                <SlideCanvas
                  slide={s}
                  displayWidth={108}
                  variables={variables}
                  highlighted={null}
                  onVarClick={() => {}}
                />
                <div className="text-center text-[10px] text-muted-foreground py-0.5 bg-white">{s.index}</div>
              </button>
            ))}
          </div>

          {/* Main slide area */}
          <div className="flex-1 min-w-0 overflow-auto bg-gray-100 flex items-start justify-center p-4">
            {pendingMoves.length > 0 && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow flex items-center gap-1.5">
                <Move className="h-3 w-3" />
                {pendingMoves.length} shape{pendingMoves.length > 1 ? 's' : ''} moved — click "Save Layout" to apply
              </div>
            )}
            <SlideCanvas
              slide={slide}
              displayWidth={displayW}
              variables={variables}
              highlighted={highlighted}
              onVarClick={onVarClick}
              posOverrides={posOverridesMap}
              draggable
              onShapeDragEnd={handleShapeDragEnd}
            />
          </div>
        </div>

        {pendingMoves.length === 0 && (
          <div className="px-4 py-1.5 border-t bg-muted/20 shrink-0 text-xs text-muted-foreground flex items-center gap-2">
            <Move className="h-3 w-3" />
            Drag green/blue variable boxes to reposition them on the slide
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Slide preview panel (left column) ────────────────────────────────────────

function SlidePanel({
  storagePath,
  variables,
  highlightedVar,
  onVarClick,
}: {
  storagePath: string | null
  variables: DetectedVariable[]
  highlightedVar: string | null
  onVarClick: (key: string) => void
}) {
  const [slides, setSlides] = useState<ParsedSlide[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const loadSlides = useCallback(async () => {
    if (!storagePath) return
    setLoading(true)
    try {
      const { data, error } = await supabase.storage.from('bc-templates').download(storagePath)
      if (error) throw error
      const parsed = await parsePptxSlides(data)
      setSlides(parsed)
      if (parsed.length > 0) setSelectedIdx(parsed[0].index)
    } catch {
      toast.error('Failed to load slide preview')
    } finally {
      setLoading(false)
    }
  }, [storagePath])

  const selectedSlide = slides?.find((s) => s.index === selectedIdx) ?? null

  if (!storagePath) {
    return (
      <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg text-muted-foreground text-sm gap-2">
        <FileUp className="h-8 w-8 opacity-30" />
        <p>No PPTX uploaded yet</p>
      </div>
    )
  }

  if (!slides) {
    return (
      <div className="space-y-2">
        <Button variant="outline" className="w-full" onClick={loadSlides} disabled={loading}>
          {loading
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading preview…</>
            : <><Eye className="mr-2 h-4 w-4" />Load Slide Preview</>
          }
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Downloads the PPTX and renders an interactive preview. Click variables to configure them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Selected slide preview */}
      {selectedSlide && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Slide {selectedSlide.index} — click a variable to configure
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => setModalOpen(true)}
            >
              <ZoomIn className="h-3 w-3" /> Full View
            </Button>
          </div>
          <SlideCanvas
            slide={selectedSlide}
            displayWidth={300}
            variables={variables}
            highlighted={highlightedVar}
            onVarClick={onVarClick}
          />
        </div>
      )}

      {/* Slide thumbnail grid */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">{slides.length} slides total</p>
        <div className="grid grid-cols-2 gap-1.5 max-h-[46vh] overflow-y-auto pr-0.5">
          {slides.map((s) => (
            <button
              key={s.index}
              type="button"
              className={`rounded border-2 overflow-hidden text-left transition-colors ${s.index === selectedIdx ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
              onClick={() => setSelectedIdx(s.index)}
              onDoubleClick={() => { setSelectedIdx(s.index); setModalOpen(true) }}
            >
              <SlideCanvas
                slide={s}
                displayWidth={130}
                variables={variables}
                highlighted={highlightedVar}
                onVarClick={onVarClick}
              />
              <div className="text-center text-[10px] text-muted-foreground py-0.5 bg-white border-t">
                {s.index}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Double-click to open full view</p>
      </div>

      {/* Full-screen modal */}
      {modalOpen && selectedSlide && (
        <FullSlideModal
          slides={slides}
          initialIndex={selectedSlide.index}
          variables={variables}
          storagePath={storagePath}
          highlighted={highlightedVar}
          onVarClick={onVarClick}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

// ── Variable row (inline editing) ─────────────────────────────────────────────

function VariableRow({
  variable,
  isHighlighted,
  scrollRef,
  onChange,
}: {
  variable: DetectedVariable
  isHighlighted: boolean
  scrollRef: (el: HTMLDivElement | null) => void
  onChange: (updated: DetectedVariable) => void
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (isHighlighted) setExpanded(true)
  }, [isHighlighted])

  return (
    <div
      ref={scrollRef}
      className={`rounded-lg border transition-colors ${isHighlighted ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {variable.type === 'auto'
          ? <Zap className="h-3.5 w-3.5 text-green-600 shrink-0" />
          : <Bot className="h-3.5 w-3.5 text-blue-600 shrink-0" />
        }
        <code className="text-xs font-mono flex-1 truncate text-left">{variable.raw}</code>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${variable.type === 'auto' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {variable.type === 'auto' ? 'Auto' : 'AI'}
        </span>
        {variable.type === 'auto' && variable.field_key && (
          <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline truncate max-w-[100px]">
            → {LEAD_FIELD_OPTIONS.find((o) => o.value === variable.field_key)?.label ?? variable.field_key}
          </span>
        )}
        {variable.type === 'ai' && variable.instruction && (
          <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[120px] hidden sm:inline">
            {variable.instruction.slice(0, 40)}{variable.instruction.length > 40 ? '…' : ''}
          </span>
        )}
        <span className="text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t">
          <div className="flex gap-2 pt-3">
            <Button
              size="sm"
              variant={variable.type === 'auto' ? 'default' : 'outline'}
              className="h-7 text-xs flex-1"
              onClick={() => onChange({ ...variable, type: 'auto' })}
            >
              <Zap className="h-3 w-3 mr-1" /> Auto-fill from lead
            </Button>
            <Button
              size="sm"
              variant={variable.type === 'ai' ? 'default' : 'outline'}
              className="h-7 text-xs flex-1"
              onClick={() => onChange({ ...variable, type: 'ai' })}
            >
              <Bot className="h-3 w-3 mr-1" /> AI Generated
            </Button>
          </div>

          {variable.type === 'auto' && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Lead field to use</label>
              <Select
                value={variable.field_key ?? ''}
                onValueChange={(v) => onChange({ ...variable, field_key: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select a field…" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_FIELD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {variable.type === 'ai' && (
            <div className="space-y-1">
              <label className="text-xs font-medium">AI instruction</label>
              <Textarea
                value={variable.instruction ?? ''}
                onChange={(e) => onChange({ ...variable, instruction: e.target.value })}
                placeholder="e.g. Write a 2-sentence value proposition for this company based on their industry"
                rows={3}
                className="text-xs resize-none"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Display label (optional)</label>
            <Input
              value={variable.display_name ?? ''}
              onChange={(e) => onChange({ ...variable, display_name: e.target.value || undefined })}
              placeholder={variable.key}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Variable editor panel ─────────────────────────────────────────────────────

function VariableEditor({
  templateId,
  initialVars,
  highlightedVar,
  onSaved,
}: {
  templateId: string
  initialVars: DetectedVariable[]
  highlightedVar: string | null
  onSaved: (vars: DetectedVariable[]) => void
}) {
  const { updateTemplate } = useBusinessCases()
  const [localVars, setLocalVars] = useState<DetectedVariable[]>(initialVars)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'auto' | 'ai'>('all')
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const isDirty = JSON.stringify(localVars) !== JSON.stringify(initialVars)

  useEffect(() => {
    if (highlightedVar) {
      const el = rowRefs.current.get(highlightedVar)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlightedVar])

  const handleChange = useCallback((updated: DetectedVariable) => {
    setLocalVars((prev) => prev.map((v) => (v.key === updated.key ? updated : v)))
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateTemplate(templateId, { detected_variables: localVars })
      onSaved(localVars)
      toast.success('Variable configuration saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const filtered = useMemo(() => {
    let result = localVars
    if (typeFilter !== 'all') result = result.filter((v) => v.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (v) =>
          v.key.toLowerCase().includes(q) ||
          v.raw.toLowerCase().includes(q) ||
          v.field_key?.toLowerCase().includes(q) ||
          v.instruction?.toLowerCase().includes(q) ||
          v.display_name?.toLowerCase().includes(q),
      )
    }
    return result
  }, [localVars, search, typeFilter])

  const autoCount = localVars.filter((v) => v.type === 'auto').length
  const aiCount = localVars.filter((v) => v.type === 'ai').length

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables…"
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex rounded-md border overflow-hidden text-xs shrink-0">
          {(['all', 'auto', 'ai'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTypeFilter(f)}
              className={`px-2.5 py-1 capitalize transition-colors ${typeFilter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {f === 'all' ? `All ${localVars.length}` : f === 'auto' ? `Auto ${autoCount}` : `AI ${aiCount}`}
            </button>
          ))}
        </div>

        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-8 shrink-0">
            {isSaving
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
              : <><Save className="mr-1.5 h-3.5 w-3.5" />Save Changes</>
            }
          </Button>
        )}
      </div>

      {/* Variable list */}
      <div className="overflow-y-auto space-y-1.5 flex-1 pr-0.5">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No variables match your search</p>
        ) : (
          filtered.map((v) => (
            <VariableRow
              key={v.key}
              variable={v}
              isHighlighted={highlightedVar === v.key}
              scrollRef={(el) => {
                if (el) rowRefs.current.set(v.key, el)
                else rowRefs.current.delete(v.key)
              }}
              onChange={handleChange}
            />
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground shrink-0">
        Showing {filtered.length} of {localVars.length}
        {isDirty && <span className="ml-2 text-orange-600 font-medium">• Unsaved changes</span>}
      </p>
    </div>
  )
}

// ── Re-upload section ─────────────────────────────────────────────────────────

function ReuploadSection({
  templateId,
  onUpdated,
}: {
  templateId: string
  onUpdated: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { orgId } = useOrg()
  const [open, setOpen] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [previewVars, setPreviewVars] = useState<DetectedVariable[] | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.name.endsWith('.pptx')) { toast.error('Please upload a .pptx file'); return }
    setNewFile(selected); setPreviewVars(null); setIsParsing(true)
    try {
      setPreviewVars(await parsePptxVariables(selected))
    } catch { toast.error('Failed to parse PPTX'); setNewFile(null) }
    finally { setIsParsing(false) }
  }

  const handleReupload = async () => {
    if (!newFile || !orgId || !previewVars) return
    setIsUploading(true)
    try {
      const storagePath = `${orgId}/${templateId}.pptx`
      const { error: uploadErr } = await supabase.storage.from('bc-templates').upload(storagePath, newFile, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      })
      if (uploadErr) throw uploadErr
      const { error: updateErr } = await supabase.from('business_case_templates')
        .update({ pptx_storage_path: storagePath, detected_variables: previewVars, updated_at: new Date().toISOString() })
        .eq('id', templateId)
      if (updateErr) throw updateErr
      toast.success(`Template updated — ${previewVars.length} variables detected`)
      setNewFile(null); setPreviewVars(null); setOpen(false)
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update template')
    } finally { setIsUploading(false) }
  }

  return (
    <div className="border-t pt-3 mt-1 shrink-0">
      <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors" onClick={() => setOpen((v) => !v)}>
        <RefreshCw className="h-4 w-4" />
        Replace PPTX file
        {open ? <ChevronDown className="h-4 w-4 ml-1" /> : <ChevronRight className="h-4 w-4 ml-1" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-5 cursor-pointer transition-colors ${newFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
          >
            <input ref={fileInputRef} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" onChange={handleFileSelect} />
            {isParsing ? (
              <><Loader2 className="h-6 w-6 animate-spin mb-1" /><p className="text-sm text-muted-foreground">Scanning…</p></>
            ) : newFile ? (
              <>
                <CheckCircle className="h-6 w-6 text-primary mb-1" />
                <p className="text-sm font-medium">{newFile.name}</p>
                <p className="text-xs text-muted-foreground">{(newFile.size / 1024 / 1024).toFixed(1)} MB{previewVars !== null && ` · ${previewVars.length} variables`}</p>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                <p className="text-sm">Click to upload new .pptx</p>
              </>
            )}
          </div>
          {newFile && (
            <Button className="w-full" onClick={handleReupload} disabled={isUploading || isParsing}>
              {isUploading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
                : <><Upload className="mr-2 h-4 w-4" />Replace Template File</>
              }
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── AI-structured slide card ──────────────────────────────────────────────────

function SlideCard({ slide }: { slide: BcSlide }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">{slide.slide_number}</span>
            <span className="font-medium">{slide.title}</span>
            <Badge variant="outline" className="text-xs shrink-0">{slide.type}</Badge>
            <Badge variant="secondary" className="text-xs shrink-0">{slide.layout}</Badge>
          </div>
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
        {expanded && slide.fields.length > 0 && (
          <div className="ml-8 mt-3 space-y-3 border-t pt-3">
            {slide.fields.sort((a, b) => a.sort_order - b.sort_order).map((field) => (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{field.name}</span>
                  {field.field_type === 'dynamic'
                    ? <Badge className="text-xs bg-blue-100 text-blue-700 border-0">AI-generated</Badge>
                    : field.field_type === 'fixed'
                      ? <Badge variant="secondary" className="text-xs">Fixed</Badge>
                      : <Badge variant="outline" className="text-xs">Auto</Badge>}
                </div>
                {field.ai_instruction && <p className="text-xs text-muted-foreground"><span className="font-medium">Instruction: </span>{field.ai_instruction}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BusinessCaseTemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { templates, deleteTemplate } = useBusinessCases()
  const [refreshKey, setRefreshKey] = useState(0)
  const [highlightedVar, setHighlightedVar] = useState<string | null>(null)

  const template = templates.find((t) => t.id === id)

  if (!template) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business-cases')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight font-heading">Template not found</h1>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return
    try {
      await deleteTemplate(template.id)
      toast.success('Template deleted')
      navigate('/business-cases')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  const isPptx = template.template_type === 'uploaded_pptx'
  const detectedVars = template.detected_variables || []
  const aiFieldCount = isPptx
    ? detectedVars.filter((v) => v.type === 'ai').length
    : template.slide_structure.reduce((s, sl) => s + sl.fields.filter((f) => f.field_type === 'dynamic').length, 0)

  return (
    <div className="h-full flex flex-col p-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business-cases')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight font-heading truncate">{template.name}</h1>
            {template.description && <p className="text-muted-foreground text-sm truncate">{template.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isPptx ? (
            <>
              <Badge variant="secondary">{detectedVars.length} variables</Badge>
              <Badge variant="secondary">{aiFieldCount} AI-generated</Badge>
              <Badge variant="outline" className="hidden sm:flex items-center gap-1">
                <Upload className="h-3 w-3" /> Uploaded PPTX
              </Badge>
            </>
          ) : (
            <>
              <Badge variant="secondary">{template.slide_structure.length} slides</Badge>
              <Badge variant="secondary">{aiFieldCount} AI-generated fields</Badge>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/business-cases/generate?templateId=${template.id}`)}
            disabled={isPptx && detectedVars.length === 0}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Case
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* ── Uploaded PPTX: two-column layout ── */}
      {isPptx && (
        <div className="flex gap-5 min-h-0 flex-1 overflow-hidden">
          {/* Left: Slide preview */}
          <div className="w-[330px] shrink-0 flex flex-col gap-2 overflow-y-auto">
            <p className="text-sm font-semibold flex items-center gap-2 shrink-0">
              <Eye className="h-4 w-4" />
              Slide Preview
            </p>
            <SlidePanel
              key={refreshKey}
              storagePath={template.pptx_storage_path}
              variables={detectedVars}
              highlightedVar={highlightedVar}
              onVarClick={(key) => setHighlightedVar(highlightedVar === key ? null : key)}
            />
          </div>

          {/* Right: Variable editor */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Variable Configuration
              </p>
              {highlightedVar && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setHighlightedVar(null)}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>

            {detectedVars.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 flex flex-col items-center text-center">
                  <FileUp className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                  <p className="font-medium mb-1">No variables detected</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Add <code className="text-xs bg-muted px-1 rounded">{'{{empresa}}'}</code> or{' '}
                    <code className="text-xs bg-muted px-1 rounded">{'{{AI: instruction}}'}</code> to your PPTX and re-upload.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <VariableEditor
                key={refreshKey}
                templateId={template.id}
                initialVars={detectedVars}
                highlightedVar={highlightedVar}
                onSaved={() => setRefreshKey((k) => k + 1)}
              />
            )}

            <ReuploadSection
              templateId={template.id}
              onUpdated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </div>
      )}

      {/* ── AI-structured view ── */}
      {!isPptx && (
        <div className="flex-1 overflow-y-auto space-y-4">
          {template.generation_prompt && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Generation Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{template.generation_prompt}</p>
              </CardContent>
            </Card>
          )}
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Slide Structure
            <span className="text-xs text-muted-foreground font-normal ml-1">(click to expand)</span>
          </h2>
          <div className="space-y-2">
            {template.slide_structure.slice().sort((a, b) => a.slide_number - b.slide_number).map((slide) => (
              <SlideCard key={slide.slide_number} slide={slide} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
