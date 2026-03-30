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
  type SlideParagraph,
} from '@/lib/pptx-slide-parser'
import { supabase } from '@/integrations/supabase/client'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'
import type { BcSlide, DetectedVariable, ManualVariable, ManualOverlay } from '@/types/business-cases'
import { OverlayDesignSection } from '@/components/business-cases/OverlayDesignSection'

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
  overlayMode = false,
}: {
  run: import('@/lib/pptx-slide-parser').TextRun
  scale: number
  variables: DetectedVariable[]
  highlighted: string | null
  onVarClick: (key: string) => void
  /** When true (thumbnail mode): suppress plain text, only render variable chips */
  overlayMode?: boolean
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
        if (!m) {
          if (overlayMode) return null
          return <span key={i} style={baseStyle}>{part}</span>
        }
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

// ── Paragraph renderer (shared by text shapes and table cells) ───────────────

function RenderParagraphs({
  paragraphs,
  scale,
  variables,
  highlighted,
  onVarClick,
  align,
  overlayMode = false,
}: {
  paragraphs: SlideParagraph[]
  scale: number
  variables: DetectedVariable[]
  highlighted: string | null
  onVarClick: (key: string) => void
  align?: React.CSSProperties['textAlign']
  overlayMode?: boolean
}) {
  return (
    <>
      {paragraphs.map((para, pi) => (
        <div key={pi} style={{ textAlign: align ?? alignToCSS(para.align) }}>
          {para.runs.map((run, ri) => (
            <RenderRun
              key={ri}
              run={run}
              scale={scale}
              variables={variables}
              highlighted={highlighted}
              onVarClick={onVarClick}
              overlayMode={overlayMode}
            />
          ))}
        </div>
      ))}
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
  posOverrides?: Map<string, { xEmu: number; yEmu: number }>
  draggable?: boolean
  onShapeDragEnd?: (shapeId: string, xEmu: number, yEmu: number) => void
  className?: string
  /** Pre-rendered thumbnail URL — if provided, used as background; shapes only for variable chips */
  thumbnailUrl?: string
  manualOverlays?: ManualOverlay[]
}

/** Returns true if any paragraph/cell in this shape has a {{variable}} */
function shapeHasVariables(shape: ParsedShape): boolean {
  VAR_RE.lastIndex = 0
  if (shape.paragraphs.some((p) => p.runs.some((r) => VAR_RE.test(r.text)))) return true
  if (shape.tableRows) {
    for (const row of shape.tableRows) {
      for (const cell of row.cells) {
        if (cell.paragraphs.some((p) => p.runs.some((r) => VAR_RE.test(r.text)))) return true
      }
    }
  }
  return false
}

/** Extract all variable keys found on a given slide */
function getSlideVariableKeys(slide: ParsedSlide): Set<string> {
  const keys = new Set<string>()
  const extract = (paragraphs: SlideParagraph[]) => {
    for (const para of paragraphs) {
      for (const run of para.runs) {
        for (const m of run.text.matchAll(/\{\{([^}]+)\}\}/g)) {
          keys.add(m[1].trim())
        }
      }
    }
  }
  for (const shape of slide.shapes) {
    extract(shape.paragraphs)
    if (shape.tableRows) {
      for (const row of shape.tableRows) {
        for (const cell of row.cells) extract(cell.paragraphs)
      }
    }
  }
  return keys
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
  thumbnailUrl,
  manualOverlays,
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, shape: ParsedShape) => {
      if (!draggable || !shapeHasVariables(shape)) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggable, posOverrides, localOverrides],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startClientX
      const dy = e.clientY - dragRef.current.startClientY
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
        if (final && onShapeDragEnd) onShapeDragEnd(dragRef.current.shapeId, final.xEmu, final.yEmu)
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
      className={`border border-border shadow-sm rounded overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: displayWidth,
        height: displayH,
        position: 'relative',
        backgroundColor: slide.backgroundHex ? `#${slide.backgroundHex}` : '#FFFFFF',
      }}
    >
      {/* Pre-rendered thumbnail as background layer — perfect visual fidelity */}
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      {/* When thumbnail is available, only render shapes that have variables (as interactive overlays) */}
      {slide.shapes.filter((s) => !thumbnailUrl || shapeHasVariables(s)).map((shape) => {
        const { xEmu, yEmu } = getPos(shape)
        const hasVars = shapeHasVariables(shape)
        const isDragging = dragRef.current?.shapeId === shape.id

        const left = (xEmu / slide.slideWEmu) * displayWidth
        const top = (yEmu / slide.slideHEmu) * displayH
        const width = (shape.wEmu / slide.slideWEmu) * displayWidth
        const height = (shape.hEmu / slide.slideHEmu) * displayH

        const sharedStyle: React.CSSProperties = {
          position: 'absolute',
          left,
          top,
          width,
          cursor: draggable && hasVars ? (isDragging ? 'grabbing' : 'grab') : 'default',
          outline: isDragging ? `${Math.max(1, 1.5 * scale)}px dashed #3B82F6` : 'none',
          overflow: 'hidden',
          zIndex: thumbnailUrl ? 1 : undefined,
        }

        // ── Image ──────────────────────────────────────────────────────────
        if (shape.kind === 'image' && shape.imageDataUrl) {
          return (
            <img
              key={shape.id}
              src={shape.imageDataUrl}
              alt=""
              draggable={false}
              style={{
                ...sharedStyle,
                height,
                objectFit: 'fill',
              }}
              onMouseDown={(e) => handleMouseDown(e, shape)}
            />
          )
        }

        // ── Table ──────────────────────────────────────────────────────────
        if (shape.kind === 'table' && shape.tableRows) {
          const totalRowH = shape.tableRows.reduce((s, r) => s + r.heightEmu, 0) || shape.hEmu
          const colWidths: number[] = shape.colWidthsEmu?.length
            ? shape.colWidthsEmu.map((w) => (w / shape.wEmu) * width)
            : Array(shape.tableRows[0]?.cells.length ?? 1).fill(width / (shape.tableRows[0]?.cells.length ?? 1))

          return (
            <div
              key={shape.id}
              style={{ ...sharedStyle, height }}
              onMouseDown={(e) => handleMouseDown(e, shape)}
            >
              <table
                style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  height: '100%',
                  tableLayout: 'fixed',
                  fontSize: 0,
                }}
              >
                <colgroup>
                  {colWidths.map((w, ci) => <col key={ci} style={{ width: w }} />)}
                </colgroup>
                <tbody>
                  {shape.tableRows.map((row, ri) => {
                    const rowH = (row.heightEmu / totalRowH) * height
                    return (
                      <tr key={ri} style={{ height: rowH }}>
                        {row.cells.map((cell, ci) => {
                          if (cell.vMerge || cell.hMerge) return null
                          return (
                            <td
                              key={ci}
                              colSpan={cell.gridSpan ?? 1}
                              rowSpan={cell.rowSpan ?? 1}
                              style={{
                                backgroundColor: cell.fillHex ? `#${cell.fillHex}` : 'transparent',
                                border: `${Math.max(0.5, scale)}px solid #D1D5DB`,
                                padding: `${Math.max(1, 2 * scale)}px`,
                                verticalAlign: 'middle',
                                overflow: 'hidden',
                              }}
                            >
                              <RenderParagraphs
                                paragraphs={cell.paragraphs}
                                scale={scale}
                                variables={variables}
                                highlighted={highlighted}
                                onVarClick={onVarClick}
                                overlayMode={!!thumbnailUrl && shapeHasVariables(shape)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }

        // ── Rect (no text, just fill/stroke) ───────────────────────────────
        if (shape.kind === 'rect') {
          const bw = shape.strokeWidthEmu ? Math.max(0.5, (shape.strokeWidthEmu / 12700) * scale) : 0
          return (
            <div
              key={shape.id}
              style={{
                ...sharedStyle,
                height,
                backgroundColor: shape.fillHex ? `#${shape.fillHex}` : 'transparent',
                border: bw > 0 && shape.strokeHex
                  ? `${bw}px solid #${shape.strokeHex}`
                  : 'none',
              }}
              onMouseDown={(e) => handleMouseDown(e, shape)}
            />
          )
        }

        // ── Text (default) ─────────────────────────────────────────────────
        const bw = shape.strokeWidthEmu ? Math.max(0.5, (shape.strokeWidthEmu / 12700) * scale) : 0
        // In overlay mode (thumbnail as bg): transparent background so PNG shows through,
        // but chips are still rendered — effectively hiding the duplicate raw text
        const isVariableOverlay = !!thumbnailUrl && hasVars
        return (
          <div
            key={shape.id}
            style={{
              ...sharedStyle,
              minHeight: height,
              // In overlay mode, use opaque fill to mask the raw {{VAR}} text in the PNG background
              backgroundColor: isVariableOverlay
                ? (shape.fillHex ? `#${shape.fillHex}` : 'rgba(255,255,255,0.93)')
                : (shape.fillHex ? `#${shape.fillHex}` : 'transparent'),
              border: isVariableOverlay ? 'none' : (bw > 0 && shape.strokeHex ? `${bw}px solid #${shape.strokeHex}` : 'none'),
              padding: `${0.5 * scale}px`,
            }}
            onMouseDown={(e) => handleMouseDown(e, shape)}
          >
            <RenderParagraphs
              paragraphs={shape.paragraphs}
              scale={scale}
              variables={variables}
              highlighted={highlighted}
              onVarClick={onVarClick}
              overlayMode={isVariableOverlay}
            />
          </div>
        )
      })}
      {slide.shapes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
          Slide {slide.index}
        </div>
      )}
      {/* Manual overlay chips — identical styling to Design Overlays OverlayChip */}
      {manualOverlays && manualOverlays.map((o) => {
        const fpx = Math.round(o.fontSize * (displayWidth / 960))
        return (
          <div
            key={o.id}
            onClick={(e) => { e.stopPropagation(); onVarClick(o.key) }}
            style={{
              position: 'absolute',
              left: `${o.x_pct * 100}%`,
              top: `${o.y_pct * 100}%`,
              width: `${o.width_pct * 100}%`,
              cursor: 'pointer',
              userSelect: 'none' as const,
              zIndex: 15,
            }}
          >
            <div style={{
              fontFamily: o.fontFamily,
              fontSize: `${fpx}px`,
              fontWeight: o.fontWeight as 'normal' | 'bold',
              fontStyle: o.fontStyle as 'normal' | 'italic',
              textAlign: o.textAlign as 'left' | 'center' | 'right',
              color: o.color,
              padding: `${Math.max(2, fpx * 0.1)}px ${Math.max(4, fpx * 0.2)}px`,
              borderRadius: 4,
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              whiteSpace: 'nowrap' as const,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
            }}>
              {`{{${o.key.toUpperCase()}}}`}
            </div>
          </div>
        )
      })}
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
  thumbnailUrls = [],
  isGeneratingThumbs = false,
  manualOverlays = [],
}: {
  slides: ParsedSlide[]
  initialIndex: number
  variables: DetectedVariable[]
  storagePath: string | null
  onClose: () => void
  onVarClick: (key: string) => void
  highlighted: string | null
  thumbnailUrls?: string[]
  isGeneratingThumbs?: boolean
  manualOverlays?: ManualOverlay[]
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
      <DialogContent className="max-w-[98vw] w-[1200px] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden [&>button:last-child]:hidden">
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
            {isGeneratingThumbs && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mr-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating HD preview…
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-2" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Slide thumbnails strip */}
          <div className="w-[200px] shrink-0 bg-muted/20 border-r overflow-y-auto flex flex-col gap-2 p-2">
            {slides.map((s) => {
              const thumbUrl = thumbnailUrls[s.index - 1]
              return (
                <button
                  key={s.index}
                  type="button"
                  className={`rounded border-2 overflow-hidden transition-colors text-left ${s.index === currentIdx ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
                  onClick={() => setCurrentIdx(s.index)}
                >
                  <div style={{ width: '100%', aspectRatio: '16 / 9', backgroundColor: '#e8eaed', overflow: 'hidden', position: 'relative' }}>
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={`Slide ${s.index}`}
                        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                        draggable={false} />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SlideCanvas
                          slide={s}
                          displayWidth={184}
                          variables={variables}
                          highlighted={null}
                          onVarClick={() => {}}
                        />
                      </div>
                    )}
                  </div>
                  <div className="text-center text-[10px] text-muted-foreground py-0.5 bg-white">{s.index}</div>
                </button>
              )
            })}
          </div>

          {/* Main slide area */}
          <div className="flex-1 min-w-0 overflow-auto bg-gray-100 flex items-start justify-center p-4">
            {pendingMoves.length > 0 && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow flex items-center gap-1.5">
                <Move className="h-3 w-3" />
                {pendingMoves.length} formas movidas — haz clic en "Guardar Layout" para aplicar
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
              thumbnailUrl={thumbnailUrls[slide.index - 1]}
              manualOverlays={manualOverlays.filter(o => o.slide_index === slide.index)}
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
  thumbnailPaths,
  variables,
  highlightedVar,
  onVarClick,
  onSlideVarsChange,
  templateId,
  onRefresh,
  manualOverlays,
}: {
  storagePath: string | null
  thumbnailPaths: string[] | null
  variables: DetectedVariable[]
  highlightedVar: string | null
  onVarClick: (key: string) => void
  onSlideVarsChange?: (keys: Set<string>, slideIdx: number) => void
  templateId: string
  onRefresh: () => void
  manualOverlays?: ManualOverlay[]
}) {
  const [slides, setSlides] = useState<ParsedSlide[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([])
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false)
  const [hasThumbnailError, setHasThumbnailError] = useState(false)
  const slideVarsRef = useRef(onSlideVarsChange)
  slideVarsRef.current = onSlideVarsChange

  // Notify parent when selected slide changes (filters variables to this slide)
  useEffect(() => {
    if (selectedIdx === null || !slides) return
    const slide = slides.find(s => s.index === selectedIdx)
    if (slide) slideVarsRef.current?.(getSlideVariableKeys(slide), selectedIdx)
  }, [selectedIdx, slides])

  const handleGenerateThumbnails = useCallback(async () => {
    setIsGeneratingThumbs(true)
    try {
      const { error } = await supabase.functions.invoke('generate-slide-thumbnails', {
        body: { template_id: templateId },
      })
      if (error) throw error
      toast.success('HD previews generated!')
      onRefresh()
    } catch {
      toast.error('Failed to generate previews. Check that CONVERT_API_SECRET is configured.')
      setHasThumbnailError(true)
    } finally {
      setIsGeneratingThumbs(false)
    }
  }, [templateId, onRefresh])

  const handleOpenModal = useCallback(async () => {
    setModalOpen(true)
    // Auto-trigger thumbnail generation if not yet done
    if (thumbnailUrls.length === 0 && storagePath && !isGeneratingThumbs) {
      await handleGenerateThumbnails()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnailUrls.length, storagePath, isGeneratingThumbs, handleGenerateThumbnails])

  // Load signed URLs for thumbnails
  useEffect(() => {
    if (!thumbnailPaths || thumbnailPaths.length === 0) return
    supabase.storage
      .from('bc-templates')
      .createSignedUrls(thumbnailPaths, 3600)
      .then(({ data }) => {
        if (data) setThumbnailUrls(data.map((d) => d.signedUrl ?? '').filter(Boolean))
      })
  }, [thumbnailPaths])

  // Auto-load slides (for variable position data) when thumbnails exist
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

  // Auto-load slide data for preview and variable detection
  useEffect(() => {
    if (storagePath && !slides && !loading) {
      loadSlides()
    }
  }, [storagePath, slides, loading, loadSlides])

  // Auto-generate thumbnails as soon as slides are parsed and none exist yet
  useEffect(() => {
    if (
      slides && slides.length > 0 &&
      (!thumbnailPaths || thumbnailPaths.length === 0) &&
      storagePath &&
      !isGeneratingThumbs
    ) {
      void handleGenerateThumbnails()
    }
  // Run only when slides first become available or thumbnailPaths changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, thumbnailPaths])

  const selectedSlide = slides?.find((s) => s.index === selectedIdx) ?? null

  if (!storagePath) {
    return (
      <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg text-muted-foreground text-sm gap-2">
        <FileUp className="h-8 w-8 opacity-30" />
        <p>No PPTX uploaded yet</p>
      </div>
    )
  }

  // Block the UI while thumbnails are being generated for the first time
  const noThumbnailsYet = !thumbnailPaths || thumbnailPaths.length === 0
  if ((noThumbnailsYet || isGeneratingThumbs) && !hasThumbnailError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-5 rounded-xl border-2 border-dashed bg-muted/10 px-4 py-8">
        <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
        <div className="text-center">
          <p className="text-sm font-semibold">Generating HD Previews…</p>
          <p className="text-xs text-muted-foreground mt-1">
            {slides ? `Processing ${slides.length} slides` : 'Parsing presentation…'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">This only runs once per upload</p>
        </div>
      </div>
    )
  }

  // Slides may still be loading in background (thumbnails already exist — fast path)
  if (!slides) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p>Cargando vista previa…</p>
      </div>
    )
  }

  // Loading slides while thumbnails are ready — show thumbnails immediately
  const slideCount = thumbnailUrls.length > 0 ? thumbnailUrls.length : (slides?.length ?? 0)

  return (
    <div className="space-y-3">
      {/* Selected slide preview */}
      {(selectedSlide || thumbnailUrls.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {selectedSlide
                ? `Slide ${selectedSlide.index} — click a variable to configure`
                : `Slide ${(selectedIdx ?? 1)}`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => { void handleOpenModal() }}
            >
              <ZoomIn className="h-3 w-3" /> {isGeneratingThumbs ? 'Generating…' : 'Full View'}
            </Button>
          </div>
          {selectedSlide ? (
            <SlideCanvas
              slide={selectedSlide}
              displayWidth={300}
              variables={variables}
              highlighted={highlightedVar}
              onVarClick={onVarClick}
              thumbnailUrl={thumbnailUrls[(selectedSlide.index - 1)] ?? undefined}
              manualOverlays={(manualOverlays ?? []).filter(o => o.slide_index === selectedSlide.index)}
            />
          ) : (
            // Thumbnails loaded but slide parse still in progress — show thumbnail only
            <img
              src={thumbnailUrls[(selectedIdx ?? 1) - 1]}
              alt=""
              className="w-full rounded border border-border shadow-sm"
            />
          )}
        </div>
      )}

      {/* Slide strip */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">{slideCount} slides total</p>
        <div className="flex flex-col gap-2">
          {Array.from({ length: slideCount }, (_, i) => i + 1).map((slideNum) => {
            const slide = slides?.find((s) => s.index === slideNum)
            const thumbUrl = thumbnailUrls[slideNum - 1]
            const isSelected = (selectedIdx ?? 1) === slideNum
            return (
              <button
                key={slideNum}
                type="button"
                className={`rounded border-2 overflow-hidden text-left transition-colors w-full ${isSelected ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}
                onClick={() => setSelectedIdx(slideNum)}
                onDoubleClick={() => { setSelectedIdx(slideNum); void handleOpenModal() }}
              >
                {slide ? (
                  <SlideCanvas
                    slide={slide}
                    displayWidth={290}
                    variables={variables}
                    highlighted={highlightedVar}
                    onVarClick={onVarClick}
                    thumbnailUrl={thumbUrl}
                  />
                ) : thumbUrl ? (
                  <div style={{ aspectRatio: '16/9', width: '100%' }}>
                    <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }} draggable={false} />
                  </div>
                ) : null}
                <div className="text-center text-[10px] text-muted-foreground py-0.5 bg-white border-t">
                  {slideNum}
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Double-click to open full view</p>
      </div>

      {/* Retry button if thumbnail generation failed */}
      {hasThumbnailError && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive border-destructive/40 hover:bg-destructive/5"
          onClick={() => { setHasThumbnailError(false); void handleGenerateThumbnails() }}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />Retry HD Preview Generation
        </Button>
      )}

      {/* Full-screen modal */}
      {modalOpen && slides && (
        <FullSlideModal
          slides={slides}
          initialIndex={selectedIdx ?? 1}
          variables={variables}
          storagePath={storagePath}
          highlighted={highlightedVar}
          onVarClick={onVarClick}
          onClose={() => setModalOpen(false)}
          thumbnailUrls={thumbnailUrls}
          isGeneratingThumbs={isGeneratingThumbs}
          manualOverlays={manualOverlays}
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
                  <SelectValue placeholder="Seleccionar campo…" />
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
  activeSlideVarKeys,
  activeSlideIdx,
  onClearSlideFilter,
}: {
  templateId: string
  initialVars: DetectedVariable[]
  highlightedVar: string | null
  onSaved: (vars: DetectedVariable[]) => void
  activeSlideVarKeys?: Set<string> | null
  activeSlideIdx?: number | null
  onClearSlideFilter?: () => void
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
    if (activeSlideVarKeys) result = result.filter((v) => activeSlideVarKeys.has(v.key))
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
  }, [localVars, search, typeFilter, activeSlideVarKeys])

  const autoCount = localVars.filter((v) => v.type === 'auto').length
  const aiCount = localVars.filter((v) => v.type === 'ai').length

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* Slide filter indicator */}
      {activeSlideVarKeys && activeSlideIdx && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 shrink-0">
          <span className="text-xs font-medium text-primary">
            Slide {activeSlideIdx} — {activeSlideVarKeys.size} variable{activeSlideVarKeys.size !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={onClearSlideFilter}
            className="text-xs text-primary hover:text-primary/80 font-medium underline"
          >
            Show All
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar variables…"
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
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false)
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
      setNewFile(null); setPreviewVars(null); setOpen(false)
      toast.success(`Template updated — ${previewVars.length} variables detected. Generating slide previews…`)
      // Kick off thumbnail generation in the background (non-blocking)
      setIsGeneratingThumbs(true)
      supabase.functions.invoke('generate-slide-thumbnails', {
        body: { template_id: templateId },
      }).then(({ error }) => {
        setIsGeneratingThumbs(false)
        if (error) {
          console.error('Thumbnail generation failed:', error)
        } else {
          onUpdated() // Refresh template data to get new thumbnail_paths
        }
      })
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
            <Button className="w-full" onClick={handleReupload} disabled={isUploading || isParsing || isGeneratingThumbs}>
              {isUploading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
                : isGeneratingThumbs
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating previews…</>
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
  const { templates, deleteTemplate, updateTemplate } = useBusinessCases()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeMode, setActiveMode] = useState<'variables' | 'design'>('variables')
  const [highlightedVar, setHighlightedVar] = useState<string | null>(null)
  const [activeSlideVarKeys, setActiveSlideVarKeys] = useState<Set<string> | null>(null)
  const [activeSlideIdx, setActiveSlideIdx] = useState<number | null>(null)

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
  // Merge PPTX-detected vars + overlay-created vars so Configure Variables shows all
  const pptxVars = template.detected_variables || []
  const overlayManualVars = (template.variable_overlays?.variables ?? []) as ManualVariable[]
  const detectedVars: DetectedVariable[] = [
    ...pptxVars,
    ...overlayManualVars
      .filter(ov => !pptxVars.some(d => d.key === ov.key))
      .map(ov => ({
        key: ov.key,
        raw: `{{${ov.key.toUpperCase()}}}`,
        type: 'auto' as const,
        display_name: ov.label,
      })),
  ]
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

      {/* ── Uploaded PPTX: mode tab bar ── */}
      {isPptx && (
        <div className="flex items-center gap-2 shrink-0 border-b pb-3">
          <button
            type="button"
            onClick={() => setActiveMode('variables')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeMode === 'variables' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            <Zap className="h-3.5 w-3.5" /> Configure Variables
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('design')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeMode === 'design' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            <Layers className="h-3.5 w-3.5" /> Design Overlays
          </button>
          {activeMode === 'design' && (
            <span className="text-xs text-muted-foreground ml-2">Place variable chips directly on slides — no {'{{}}'} in PPTX needed</span>
          )}
        </div>
      )}

      {/* ── Overlay Design Mode ── */}
      {isPptx && activeMode === 'design' && (
        <div className="flex-1 min-h-0 overflow-hidden rounded-lg border">
          <OverlayDesignSection
            key={refreshKey}
            thumbnailPaths={template.thumbnail_paths ?? null}
            pptxStoragePath={template.pptx_storage_path}
            initialVariables={(template.variable_overlays?.variables ?? []) as ManualVariable[]}
            initialOverlays={(template.variable_overlays?.overlays ?? []) as ManualOverlay[]}
            onSave={async (variables, overlays) => {
              await updateTemplate(template.id, {
                variable_overlays: { variables, overlays },
                // Also sync to detected_variables so generation pipeline can use them
                detected_variables: variables.map(v => ({
                  key: v.key,
                  raw: `{{${v.key.toUpperCase()}}}`,
                  type: 'auto' as const,
                  display_name: v.label,
                })),
              })
              toast.success('Overlay design saved')
            }}
          />
        </div>
      )}

      {/* ── Uploaded PPTX: two-column layout ── */}
      {isPptx && activeMode === 'variables' && (
        <div className="flex gap-5 min-h-0 flex-1 overflow-hidden">
          {/* Left: Slide preview */}
          <div className="w-[330px] shrink-0 flex flex-col gap-2 overflow-y-auto pb-4">
            <p className="text-sm font-semibold flex items-center gap-2 shrink-0">
              <Eye className="h-4 w-4" />
              Slide Preview
            </p>
            <SlidePanel
              key={refreshKey}
              storagePath={template.pptx_storage_path}
              thumbnailPaths={template.thumbnail_paths ?? null}
              variables={detectedVars}
              highlightedVar={highlightedVar}
              manualOverlays={(template.variable_overlays?.overlays ?? []) as ManualOverlay[]}
              onVarClick={(key) => setHighlightedVar(highlightedVar === key ? null : key)}
              onSlideVarsChange={(keys, idx) => {
                // Also include overlay vars placed on this specific slide
                const overlayKeysOnSlide = (template.variable_overlays?.overlays ?? [])
                  .filter(o => o.slide_index === idx)
                  .map(o => o.key)
                setActiveSlideVarKeys(new Set([...keys, ...overlayKeysOnSlide]))
                setActiveSlideIdx(idx)
              }}
              templateId={template.id}
              onRefresh={() => setRefreshKey((k) => k + 1)}
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
                activeSlideVarKeys={activeSlideVarKeys}
                activeSlideIdx={activeSlideIdx}
                onClearSlideFilter={() => { setActiveSlideVarKeys(null); setActiveSlideIdx(null) }}
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
