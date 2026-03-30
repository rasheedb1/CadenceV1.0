/**
 * OverlayDesignSection — drag-and-drop variable placement editor for PPTX slides.
 * Users create variables then place + style chips on slide thumbnails.
 */
import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import {
  AlignLeft, AlignCenter, AlignRight,
  Plus, Trash2, Save, Loader2, X, GripVertical, Type, Pipette,
  ChevronsLeftRight, ChevronsUpDown,
  ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
} from 'lucide-react'
import {
  parsePptxSlides,
  type ParsedSlide,
  type TextRun,
} from '@/lib/pptx-slide-parser'
import type { ManualOverlay, ManualVariable } from '@/types/business-cases'

const FONT_FAMILIES = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Verdana', 'Trebuchet MS', 'Courier New']

/** Convert PPTX text run properties to ManualOverlay style properties */
function textRunToOverlayStyle(run: TextRun, paraAlign?: string): Partial<ManualOverlay> {
  const style: Partial<ManualOverlay> = {}
  if (run.fontSize) style.fontSize = Math.round(run.fontSize / 100) // hundredths-of-point → points
  if (run.bold !== undefined) style.fontWeight = run.bold ? 'bold' : 'normal'
  if (run.italic !== undefined) style.fontStyle = run.italic ? 'italic' : 'normal'
  if (run.color) style.color = `#${run.color}`
  if (run.fontFamily) style.fontFamily = run.fontFamily
  if (paraAlign) {
    const alignMap: Record<string, ManualOverlay['textAlign']> = { l: 'left', ctr: 'center', r: 'right', just: 'left' }
    if (alignMap[paraAlign]) style.textAlign = alignMap[paraAlign]
  }
  return style
}

const DEFAULT_STYLE: Omit<ManualOverlay, 'id' | 'key' | 'slide_index'> = {
  x_pct: 0.05, y_pct: 0.05, width_pct: 0.28,
  fontSize: 20, color: '#1a56db',
  fontFamily: 'Inter', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
}

function scaleFontPx(pt: number, containerW: number): number {
  return Math.round(pt * (containerW / 960))
}

// ── Format Toolbar ─────────────────────────────────────────────────────────────

function FormatToolbar({ overlay, onChange, onDelete, onAlign }: {
  overlay: ManualOverlay
  onChange: (u: Partial<ManualOverlay>) => void
  onDelete: () => void
  onAlign: (dir: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-background border-b">
      {/* Font family */}
      <select value={overlay.fontFamily} onChange={e => onChange({ fontFamily: e.target.value })}
        className="h-7 text-xs border rounded px-1.5 bg-background max-w-[130px]">
        {/* Include current font even if not in default list (e.g. picked from PPTX) */}
        {!FONT_FAMILIES.includes(overlay.fontFamily) && (
          <option value={overlay.fontFamily}>{overlay.fontFamily}</option>
        )}
        {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      {/* Font size */}
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => onChange({ fontSize: Math.max(6, overlay.fontSize - 1) })}
          className="h-7 w-6 border rounded flex items-center justify-center hover:bg-muted text-base">−</button>
        <input type="number" value={overlay.fontSize} min={6} max={200}
          onChange={e => onChange({ fontSize: Math.max(6, Math.min(200, Number(e.target.value))) })}
          className="w-12 h-7 text-xs border rounded text-center bg-background" />
        <button type="button" onClick={() => onChange({ fontSize: Math.min(200, overlay.fontSize + 1) })}
          className="h-7 w-6 border rounded flex items-center justify-center hover:bg-muted text-base">+</button>
      </div>

      {/* Bold / Italic */}
      <button type="button" title="Bold"
        onClick={() => onChange({ fontWeight: overlay.fontWeight === 'bold' ? 'normal' : 'bold' })}
        className={`h-7 w-7 border rounded font-bold text-xs ${overlay.fontWeight === 'bold' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>B</button>
      <button type="button" title="Italic"
        onClick={() => onChange({ fontStyle: overlay.fontStyle === 'italic' ? 'normal' : 'italic' })}
        className={`h-7 w-7 border rounded italic text-xs ${overlay.fontStyle === 'italic' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>I</button>

      {/* Text color */}
      <div className="flex items-center gap-1 border rounded h-7 px-1.5">
        <span className="text-xs text-muted-foreground">A</span>
        <input type="color" value={overlay.color} title="Text color"
          onChange={e => onChange({ color: e.target.value })}
          className="h-4 w-6 cursor-pointer border-0 p-0 rounded" />
      </div>

      {/* Text align */}
      <div className="flex border rounded overflow-hidden">
        {(['left', 'center', 'right'] as const).map(a => (
          <button key={a} type="button" title={`Align ${a}`}
            onClick={() => onChange({ textAlign: a })}
            className={`h-7 w-7 flex items-center justify-center ${overlay.textAlign === a ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            {a === 'left' ? <AlignLeft className="h-3.5 w-3.5" /> : a === 'center' ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
          </button>
        ))}
      </div>

      {/* Width */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">W:</span>
        <input type="range" min={5} max={100} value={Math.round(overlay.width_pct * 100)}
          onChange={e => onChange({ width_pct: Number(e.target.value) / 100 })}
          className="w-20 h-4" />
        <span className="text-xs text-muted-foreground w-8">{Math.round(overlay.width_pct * 100)}%</span>
      </div>

      <div className="h-5 w-px bg-border mx-0.5" />

      {/* Align to slide */}
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] text-muted-foreground">Align:</span>
        {[
          { icon: ArrowLeftToLine, key: 'left', title: 'Align left' },
          { icon: ChevronsLeftRight, key: 'h-center', title: 'Center H' },
          { icon: ArrowRightToLine, key: 'right', title: 'Align right' },
          { icon: ArrowUpToLine, key: 'top', title: 'Align top' },
          { icon: ChevronsUpDown, key: 'v-center', title: 'Center V' },
          { icon: ArrowDownToLine, key: 'bottom', title: 'Align bottom' },
        ].map(({ icon: Icon, key, title }) => (
          <button key={key} type="button" title={title} onClick={() => onAlign(key)}
            className="h-7 w-7 border rounded flex items-center justify-center hover:bg-muted">
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border mx-0.5" />
      <button type="button" title="Eliminar" onClick={onDelete}
        className="h-7 w-7 border border-destructive/40 text-destructive rounded flex items-center justify-center hover:bg-destructive/10">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Overlay Chip ──────────────────────────────────────────────────────────────

function OverlayChip({ overlay, isSelected, containerWidth, onMouseDown }: {
  overlay: ManualOverlay; isSelected: boolean; containerWidth: number
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const px = scaleFontPx(overlay.fontSize, containerWidth)
  return (
    <div onMouseDown={onMouseDown} style={{
      position: 'absolute', left: `${overlay.x_pct * 100}%`, top: `${overlay.y_pct * 100}%`,
      width: `${overlay.width_pct * 100}%`, cursor: isSelected ? 'grab' : 'pointer',
      userSelect: 'none', zIndex: isSelected ? 20 : 10,
    }}>
      <div style={{
        fontFamily: overlay.fontFamily, fontSize: px,
        fontWeight: overlay.fontWeight, fontStyle: overlay.fontStyle,
        textAlign: overlay.textAlign, color: overlay.color,
        padding: `${Math.max(2, px * 0.1)}px ${Math.max(4, px * 0.2)}px`,
        borderRadius: 4,
        background: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
        border: isSelected ? '2px solid #3B82F6' : '1.5px dashed rgba(100,100,100,0.6)',
        boxShadow: isSelected ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2,
      }}>
        {`{{${overlay.key.toUpperCase()}}}`}
      </div>
    </div>
  )
}

// ── Slide Edit Canvas ─────────────────────────────────────────────────────────

function SlideEditCanvas({ thumbnailUrl, overlays, selectedId, onSelect, onMove, onDeselect, pickStyleMode, parsedSlide, onPickStyle }: {
  thumbnailUrl: string | undefined; overlays: ManualOverlay[]
  selectedId: string | null; onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void; onDeselect: () => void
  pickStyleMode?: boolean; parsedSlide?: ParsedSlide | null
  onPickStyle?: (style: Partial<ManualOverlay>) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(960)
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const el = slideRef.current; if (!el) return
    const ro = new ResizeObserver(es => { for (const e of es) setContainerWidth(e.contentRect.width) })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent, o: ManualOverlay) => {
    e.preventDefault(); e.stopPropagation()
    onSelect(o.id)
    if (!slideRef.current) return
    dragRef.current = { id: o.id, sx: e.clientX, sy: e.clientY, ox: o.x_pct, oy: o.y_pct }
  }, [onSelect])

  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (!dragRef.current || !slideRef.current) return
      const r = slideRef.current.getBoundingClientRect()
      const nx = Math.max(0, Math.min(0.95, dragRef.current.ox + (e.clientX - dragRef.current.sx) / r.width))
      const ny = Math.max(0, Math.min(0.95, dragRef.current.oy + (e.clientY - dragRef.current.sy) / r.height))
      onMove(dragRef.current.id, nx, ny)
    }
    const mu = () => { dragRef.current = null }
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu)
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) }
  }, [onMove])

  return (
    <div ref={wrapperRef} className="flex-1 bg-neutral-300 flex items-center justify-center overflow-auto p-4 min-h-0"
      onClick={e => { if (e.target === wrapperRef.current) onDeselect() }}>
      {thumbnailUrl ? (
        <div ref={slideRef} className="relative shadow-2xl select-none"
          style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 230px)', maxWidth: '100%', width: '100%' }}
          onClick={e => { if (e.target === slideRef.current) onDeselect() }}>
          <img src={thumbnailUrl} alt="" draggable={false}
            className="absolute inset-0 w-full h-full" style={{ objectFit: 'fill' }} />
          {overlays.map(o => (
            <OverlayChip key={o.id} overlay={o} isSelected={o.id === selectedId}
              containerWidth={containerWidth} onMouseDown={e => handleMouseDown(e, o)} />
          ))}
          {/* Pick Style mode: clickable text regions from parsed PPTX shapes */}
          {pickStyleMode && parsedSlide && (() => {
            const slideW = slideRef.current?.getBoundingClientRect()?.width || containerWidth
            return parsedSlide.shapes
              .filter(s => s.kind === 'text' && s.paragraphs.length > 0)
              .map(shape => {
                const left = (shape.xEmu / parsedSlide.slideWEmu) * 100
                const top = (shape.yEmu / parsedSlide.slideHEmu) * 100
                const width = (shape.wEmu / parsedSlide.slideWEmu) * 100
                const height = (shape.hEmu / parsedSlide.slideHEmu) * 100
                // Get font info from first non-empty run
                const firstPara = shape.paragraphs.find(p => p.runs.some(r => r.text.trim()))
                const firstRun = firstPara?.runs.find(r => r.text.trim())
                if (!firstRun) return null
                const previewFontPx = firstRun.fontSize
                  ? Math.round((firstRun.fontSize / 100) * (slideW / 960))
                  : 12
                return (
                  <div
                    key={shape.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onPickStyle && firstRun) {
                        onPickStyle(textRunToOverlayStyle(firstRun, firstPara?.align))
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: `${left}%`, top: `${top}%`,
                      width: `${width}%`, height: `${height}%`,
                      cursor: 'crosshair', zIndex: 30,
                      border: '2px solid transparent',
                      borderRadius: 4,
                      transition: 'border-color 0.15s, background-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = '#8B5CF6'
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(139,92,246,0.08)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
                    }}
                    title={`${firstRun.fontFamily || 'Default'} · ${firstRun.fontSize ? Math.round(firstRun.fontSize / 100) + 'pt' : '?pt'}${firstRun.bold ? ' · Bold' : ''}${firstRun.italic ? ' · Italic' : ''}${firstRun.color ? ' · #' + firstRun.color : ''}`}
                  >
                    <div style={{
                      fontSize: Math.max(8, previewFontPx * 0.7),
                      color: '#8B5CF6',
                      fontWeight: 600,
                      pointerEvents: 'none',
                      padding: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      opacity: 0.9,
                    }}>
                      {firstRun.text.trim().slice(0, 30)}
                    </div>
                  </div>
                )
              })
          })()}
          {overlays.length === 0 && !pickStyleMode && (
            <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
              <span className="text-xs text-white bg-black/40 rounded px-3 py-1">
                Click + next to a variable to place it here
              </span>
            </div>
          )}
          {pickStyleMode && (
            <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
              <span className="text-xs text-white bg-purple-600/80 rounded px-3 py-1.5 font-medium">
                Click on any text to copy its style
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">Generate HD previews first to enable design mode</div>
      )}
    </div>
  )
}

// ── Variable Palette Panel ────────────────────────────────────────────────────

function VariablePalettePanel({ variables, currentOverlays, onPlace, onRemove, isDirty, isSaving, onSave }: {
  variables: ManualVariable[]; currentOverlays: ManualOverlay[]
  onPlace: (v: ManualVariable) => void; onRemove: (id: string) => void
  isDirty: boolean; isSaving: boolean; onSave: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const add = () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
    if (!key) return
    const label = newLabel.trim() || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const newVar: ManualVariable = { id: crypto.randomUUID(), key, label }
    onPlace(newVar) // will also add to variables list in parent
    setNewKey(''); setNewLabel(''); setShowAdd(false)
  }

  return (
    <div className="w-[215px] shrink-0 border-l flex flex-col overflow-hidden bg-background">
      <div className="px-3 py-2.5 border-b flex items-center justify-between shrink-0">
        <p className="text-xs font-semibold flex items-center gap-1.5"><Type className="h-3.5 w-3.5" /> Variables</p>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Agregar variable" onClick={() => setShowAdd(v => !v)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showAdd && (
        <div className="px-3 py-2 border-b bg-muted/30 space-y-1.5 shrink-0">
          <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Clave: company_name"
            className="h-7 text-xs" autoFocus onKeyDown={e => e.key === 'Enter' && add()} />
          <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (optional)"
            className="h-7 text-xs" onKeyDown={e => e.key === 'Enter' && add()} />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs flex-1" onClick={add}>Create & Place</Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setShowAdd(false); setNewKey(''); setNewLabel('') }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
        {variables.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <Type className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No variables yet.<br />Click + to create one.</p>
          </div>
        )}
        {variables.map(v => {
          const count = currentOverlays.filter(o => o.key === v.key).length
          return (
            <div key={v.id} className="group flex items-center gap-1.5 rounded-lg border px-2 py-2 hover:border-primary/50 transition-colors">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono font-semibold text-primary truncate">{`{{${v.key}}}`}</p>
                <p className="text-[10px] text-muted-foreground truncate">{v.label}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {count > 0 && <span className="text-[9px] bg-primary/10 text-primary rounded-full px-1.5 font-medium">{count}</span>}
                <button type="button" title="Place on current slide" onClick={() => onPlace(v)}
                  className="h-5 w-5 rounded text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/10 flex items-center justify-center">
                  <Plus className="h-3 w-3" />
                </button>
                <button type="button" title="Eliminar variable" onClick={() => onRemove(v.id)}
                  className="h-5 w-5 rounded text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-3 py-2 border-t text-[10px] text-muted-foreground space-y-0.5 leading-relaxed shrink-0">
        <p>• Click + to place on current slide</p>
        <p>• Drag chips to reposition</p>
        <p>• Click chip for format tools</p>
        <p className="flex items-center gap-1">• <span className="w-2 h-2 rounded-full bg-primary inline-block" /> = has overlays</p>
      </div>

      <div className="px-3 py-2.5 border-t shrink-0">
        <Button size="sm" className="w-full h-8" onClick={onSave} disabled={!isDirty || isSaving}>
          {isSaving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
            : <><Save className="mr-1.5 h-3.5 w-3.5" />{isDirty ? 'Save Overlays *' : 'Saved'}</>}
        </Button>
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function OverlayDesignSection({
  thumbnailPaths, initialVariables, initialOverlays, onSave, pptxStoragePath,
}: {
  thumbnailPaths: string[] | null
  initialVariables: ManualVariable[]
  initialOverlays: ManualOverlay[]
  onSave: (variables: ManualVariable[], overlays: ManualOverlay[]) => Promise<void>
  /** Storage path to the uploaded PPTX — needed for Pick Style feature */
  pptxStoragePath?: string | null
}) {
  const [variables, setVariables] = useState<ManualVariable[]>(initialVariables)
  const [overlays, setOverlays] = useState<ManualOverlay[]>(initialOverlays)
  const [selectedSlideIdx, setSelectedSlideIdx] = useState(1)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pickStyleMode, setPickStyleMode] = useState(false)
  const [parsedSlides, setParsedSlides] = useState<ParsedSlide[] | null>(null)
  const [isLoadingSlides, setIsLoadingSlides] = useState(false)

  useEffect(() => {
    if (!thumbnailPaths || thumbnailPaths.length === 0) return
    supabase.storage.from('bc-templates').createSignedUrls(thumbnailPaths, 3600)
      .then(({ data }) => { if (data) setThumbnailUrls(data.map(d => d.signedUrl ?? '').filter(Boolean)) })
  }, [thumbnailPaths])

  const slideCount = thumbnailUrls.length || 1
  const currentThumbnailUrl = thumbnailUrls[selectedSlideIdx - 1]
  const currentOverlays = overlays.filter(o => o.slide_index === selectedSlideIdx)
  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId) ?? null

  const markDirty = useCallback(() => setIsDirty(true), [])

  const updateOverlay = useCallback((id: string, update: Partial<ManualOverlay>) => {
    setOverlays(prev => prev.map(o => o.id === id ? { ...o, ...update } : o))
    markDirty()
  }, [markDirty])

  const deleteOverlay = useCallback((id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id))
    setSelectedOverlayId(prev => prev === id ? null : prev)
    markDirty()
  }, [markDirty])

  const placeVariable = useCallback((v: ManualVariable) => {
    // Add to palette if new
    setVariables(prev => prev.some(x => x.key === v.key) ? prev : [...prev, v])
    const overlay: ManualOverlay = { id: crypto.randomUUID(), key: v.key, slide_index: selectedSlideIdx, ...DEFAULT_STYLE }
    setOverlays(prev => [...prev, overlay])
    setSelectedOverlayId(overlay.id)
    markDirty()
  }, [selectedSlideIdx, markDirty])

  const removeVariable = useCallback((id: string) => {
    const v = variables.find(v => v.id === id); if (!v) return
    setVariables(prev => prev.filter(x => x.id !== id))
    setOverlays(prev => prev.filter(o => o.key !== v.key))
    markDirty()
  }, [variables, markDirty])

  const alignToSlide = useCallback((dir: string) => {
    if (!selectedOverlayId) return
    const o = overlays.find(o => o.id === selectedOverlayId); if (!o) return
    const u: Record<string, Partial<ManualOverlay>> = {
      left: { x_pct: 0.01 }, 'h-center': { x_pct: Math.max(0, 0.5 - o.width_pct / 2) },
      right: { x_pct: Math.max(0, 0.99 - o.width_pct) },
      top: { y_pct: 0.01 }, 'v-center': { y_pct: 0.44 }, bottom: { y_pct: 0.9 },
    }
    if (u[dir]) updateOverlay(selectedOverlayId, u[dir])
  }, [selectedOverlayId, overlays, updateOverlay])

  const handleSave = async () => {
    setIsSaving(true)
    try { await onSave(variables, overlays); setIsDirty(false) }
    catch { toast.error('Failed to save overlays') }
    finally { setIsSaving(false) }
  }

  // Lazy-load parsed slides when pick-style mode is activated
  const togglePickStyle = useCallback(async () => {
    if (pickStyleMode) { setPickStyleMode(false); return }
    if (!selectedOverlayId) { toast.info('Select an overlay chip first, then pick a style'); return }
    if (!parsedSlides && pptxStoragePath) {
      setIsLoadingSlides(true)
      try {
        const { data, error } = await supabase.storage.from('bc-templates').download(pptxStoragePath)
        if (error) throw error
        const slides = await parsePptxSlides(data)
        setParsedSlides(slides)
      } catch {
        toast.error('Failed to load slide data for style picking')
        setIsLoadingSlides(false)
        return
      } finally {
        setIsLoadingSlides(false)
      }
    }
    setPickStyleMode(true)
  }, [pickStyleMode, parsedSlides, pptxStoragePath, selectedOverlayId])

  const handlePickStyle = useCallback((style: Partial<ManualOverlay>) => {
    if (!selectedOverlayId) { toast.info('Select an overlay chip first'); return }
    // If picked font isn't in the list, it will still be applied (free text in fontFamily)
    updateOverlay(selectedOverlayId, style)
    setPickStyleMode(false)
    toast.success('Style applied from slide text')
  }, [selectedOverlayId, updateOverlay])

  const currentParsedSlide = parsedSlides?.find(s => s.index === selectedSlideIdx) ?? null

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Slide strip */}
      <div className="w-[110px] shrink-0 border-r flex flex-col bg-muted/20 overflow-y-auto gap-1 p-1.5">
        <p className="text-[10px] text-muted-foreground text-center py-0.5 shrink-0">{slideCount} slides</p>
        {Array.from({ length: slideCount }, (_, i) => i + 1).map(num => {
          const url = thumbnailUrls[num - 1]
          return (
            <button key={num} type="button"
              onClick={() => { setSelectedSlideIdx(num); setSelectedOverlayId(null) }}
              className={`relative rounded overflow-hidden border-2 transition-colors ${selectedSlideIdx === num ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}`}>
              {url ? (
                <div style={{ aspectRatio: '16/9', width: '100%' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }} draggable={false} />
                </div>
              )
                : <div className="aspect-video bg-muted flex items-center justify-center text-[10px] text-muted-foreground">{num}</div>}
              <div className="text-[9px] text-center text-muted-foreground py-0.5 bg-white border-t">{num}</div>
              {overlays.some(o => o.slide_index === num) && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedOverlay ? (
          <div className="flex items-center border-b">
            <FormatToolbar overlay={selectedOverlay} onChange={u => updateOverlay(selectedOverlay.id, u)}
              onDelete={() => deleteOverlay(selectedOverlay.id)} onAlign={alignToSlide} />
            {pptxStoragePath && (
              <button
                type="button"
                title="Pick style from slide text"
                onClick={togglePickStyle}
                disabled={isLoadingSlides}
                className={`h-7 px-2 mx-1 border rounded flex items-center gap-1 text-xs shrink-0 transition-colors ${
                  pickStyleMode
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'hover:bg-muted border-border'
                }`}
              >
                {isLoadingSlides ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pipette className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{pickStyleMode ? 'Cancel' : 'Pick Style'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="shrink-0 h-[46px] border-b bg-muted/20 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Select a chip to see formatting tools</p>
          </div>
        )}
        <SlideEditCanvas thumbnailUrl={currentThumbnailUrl} overlays={currentOverlays}
          selectedId={selectedOverlayId} onSelect={setSelectedOverlayId}
          onMove={(id, x, y) => updateOverlay(id, { x_pct: x, y_pct: y })}
          onDeselect={() => { setSelectedOverlayId(null); setPickStyleMode(false) }}
          pickStyleMode={pickStyleMode} parsedSlide={currentParsedSlide}
          onPickStyle={handlePickStyle} />
      </div>

      {/* Variable palette */}
      <VariablePalettePanel variables={variables} currentOverlays={currentOverlays}
        onPlace={placeVariable} onRemove={removeVariable}
        isDirty={isDirty} isSaving={isSaving} onSave={handleSave} />
    </div>
  )
}
