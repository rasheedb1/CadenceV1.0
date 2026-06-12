import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Eye, Mail, MapPin, Clock, Smartphone } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'

interface PresentationStatsProps {
  open: boolean
  onClose: () => void
  presentationId: string | null
  clientName: string
}

interface ViewRow {
  id: string
  viewer_email: string
  viewer_ip: string | null
  viewer_user_agent: string | null
  viewer_country: string | null
  viewer_region: string | null
  viewer_city: string | null
  viewed_at: string
  notification_status: string
}

interface SlideRow {
  view_id: string
  slide_index: number
  dwell_ms: number
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return d.toLocaleDateString('en-US', { dateStyle: 'medium' })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return remSec ? `${min}m ${remSec}s` : `${min}m`
}

function deviceLabel(ua: string | null): string {
  if (!ua) return '—'
  if (/iPhone|iPad/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  return 'Web'
}

export function PresentationStats({ open, onClose, presentationId, clientName }: PresentationStatsProps) {
  const [selectedViewer, setSelectedViewer] = useState<string>('all')

  const { data: views = [], isLoading: loadingViews } = useQuery({
    queryKey: ['presentation_views', presentationId],
    queryFn: async (): Promise<ViewRow[]> => {
      if (!presentationId) return []
      const { data, error } = await supabase
        .from('presentation_views')
        .select('id, viewer_email, viewer_ip, viewer_user_agent, viewer_country, viewer_region, viewer_city, viewed_at, notification_status')
        .eq('presentation_id', presentationId)
        .order('viewed_at', { ascending: false })
      if (error) throw error
      return (data || []) as ViewRow[]
    },
    enabled: open && !!presentationId,
  })

  const { data: slides = [], isLoading: loadingSlides } = useQuery({
    queryKey: ['presentation_slides', presentationId, views.length],
    queryFn: async (): Promise<SlideRow[]> => {
      if (!presentationId || !views.length) return []
      const viewIds = views.map(v => v.id)
      const { data, error } = await supabase
        .from('presentation_slide_views')
        .select('view_id, slide_index, dwell_ms')
        .in('view_id', viewIds)
      if (error) throw error
      return (data || []) as SlideRow[]
    },
    enabled: open && !!presentationId && views.length > 0,
  })

  // Aggregate per email (unique viewers)
  const byEmail = new Map<string, { email: string; first: string; last: string; count: number; lastIp: string | null; lastCity: string | null; lastCountry: string | null; ua: string | null }>()
  for (const v of views) {
    const existing = byEmail.get(v.viewer_email)
    if (existing) {
      existing.count += 1
      if (v.viewed_at < existing.first) existing.first = v.viewed_at
      if (v.viewed_at > existing.last) {
        existing.last = v.viewed_at
        existing.lastIp = v.viewer_ip
        existing.lastCity = v.viewer_city
        existing.lastCountry = v.viewer_country
        existing.ua = v.viewer_user_agent
      }
    } else {
      byEmail.set(v.viewer_email, {
        email: v.viewer_email,
        first: v.viewed_at,
        last: v.viewed_at,
        count: 1,
        lastIp: v.viewer_ip,
        lastCity: v.viewer_city,
        lastCountry: v.viewer_country,
        ua: v.viewer_user_agent,
      })
    }
  }
  const uniqueViewers = Array.from(byEmail.values()).sort((a, b) => b.last.localeCompare(a.last))

  // Map view_id → viewer_email for filtering
  const emailByViewId = new Map<string, string>()
  for (const v of views) emailByViewId.set(v.id, v.viewer_email)

  // Aggregate dwell per slide_index, optionally filtered by viewer email
  const filteredSlides = selectedViewer === 'all'
    ? slides
    : slides.filter(s => emailByViewId.get(s.view_id) === selectedViewer)

  const slideAgg = new Map<number, { totalMs: number; sessions: Set<string> }>()
  for (const s of filteredSlides) {
    const entry = slideAgg.get(s.slide_index) || { totalMs: 0, sessions: new Set() }
    entry.totalMs += s.dwell_ms
    entry.sessions.add(s.view_id)
    slideAgg.set(s.slide_index, entry)
  }
  const slideChartData = Array.from(slideAgg.entries())
    .map(([idx, agg]) => ({
      slide: `Slide ${idx + 1}`,
      slideIndex: idx,
      avgSec: Math.round(agg.totalMs / agg.sessions.size / 1000),
      sessions: agg.sessions.size,
    }))
    .sort((a, b) => a.slideIndex - b.slideIndex)

  // Sessions: each view + its slide events
  const slidesByView = new Map<string, SlideRow[]>()
  for (const s of slides) {
    const arr = slidesByView.get(s.view_id) || []
    arr.push(s)
    slidesByView.set(s.view_id, arr)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
            Engagement · {clientName}
          </DialogTitle>
          <DialogDescription>
            {views.length} {views.length === 1 ? 'open' : 'opens'} ·{' '}
            {uniqueViewers.length} {uniqueViewers.length === 1 ? 'unique visitor' : 'unique visitors'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="visitas" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="visitas">Visits</TabsTrigger>
            <TabsTrigger value="engagement">Engagement per slide</TabsTrigger>
            <TabsTrigger value="sesiones">Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="visitas" className="flex-1 overflow-auto mt-4">
            {loadingViews ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
            ) : uniqueViewers.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No one has opened this BC yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2 font-medium">Email</th>
                      <th className="text-left py-2 px-2 font-medium">Opens</th>
                      <th className="text-left py-2 px-2 font-medium">Last visit</th>
                      <th className="text-left py-2 px-2 font-medium">Location</th>
                      <th className="text-left py-2 px-2 font-medium">Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueViewers.map((v) => {
                      const where = [v.lastCity, v.lastCountry].filter(Boolean).join(', ') || '—'
                      return (
                        <tr key={v.email} className="border-b last:border-0 hover:bg-accent/30">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              <span className="font-medium">{v.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={v.count > 1 ? 'default' : 'secondary'}>{v.count}×</Badge>
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">{formatRelative(v.last)}</td>
                          <td className="py-3 px-2 text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {where}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Smartphone className="h-3 w-3" aria-hidden="true" />
                              {deviceLabel(v.ua)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="engagement" className="flex-1 overflow-auto mt-4">
            {loadingSlides || loadingViews ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {selectedViewer === 'all'
                      ? 'Average time (seconds) a visitor spends on each slide.'
                      : `Average time (seconds) ${selectedViewer} spent on each slide.`}
                  </p>
                  {uniqueViewers.length > 0 && (
                    <Select value={selectedViewer} onValueChange={setSelectedViewer}>
                      <SelectTrigger className="h-8 w-[260px] text-xs">
                        <SelectValue placeholder="Filter by visitor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All visitors ({uniqueViewers.length})</SelectItem>
                        {uniqueViewers.map((v) => (
                          <SelectItem key={v.email} value={v.email}>
                            {v.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {slideChartData.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No per-slide time data {selectedViewer === 'all' ? 'yet' : 'for this visitor'}.
                  </div>
                ) : (
                <div style={{ width: '100%', height: 360 }}>
                  <ResponsiveContainer>
                    <BarChart data={slideChartData} margin={{ top: 10, right: 20, bottom: 40, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        dataKey="slide"
                        tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }}
                        stroke="rgba(255,255,255,0.2)"
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }}
                        stroke="rgba(255,255,255,0.2)"
                        label={{ value: 'seconds', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'rgba(255,255,255,0.6)' } }}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(140,153,255,0.08)' }}
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                        formatter={(value) => [`${value}s`, 'Average']}
                      />
                      <Bar dataKey="avgSec" fill="#8C99FF" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="sesiones" className="flex-1 overflow-auto mt-4">
            {loadingViews ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
            ) : views.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No sessions yet.
              </div>
            ) : (
              <div className="space-y-3">
                {views.map((v) => {
                  const sessionSlides = slidesByView.get(v.id) || []
                  const totalDwell = sessionSlides.reduce((sum, s) => sum + s.dwell_ms, 0)
                  const where = [v.viewer_city, v.viewer_country].filter(Boolean).join(', ') || '—'
                  return (
                    <div key={v.id} className="border rounded-lg p-3 hover:bg-accent/20">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <span className="font-medium truncate">{v.viewer_email}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{formatRelative(v.viewed_at)}</span>
                          <span>·</span>
                          <span>{where}</span>
                          {totalDwell > 0 && (<><span>·</span><span>{formatDuration(totalDwell)} total</span></>)}
                        </div>
                      </div>
                      {sessionSlides.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sessionSlides
                            .sort((a, b) => a.slide_index - b.slide_index)
                            .map((s) => (
                              <span
                                key={`${s.view_id}-${s.slide_index}`}
                                className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                                title={`Slide ${s.slide_index + 1}: ${formatDuration(s.dwell_ms)}`}
                              >
                                {s.slide_index + 1}: {formatDuration(s.dwell_ms)}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
