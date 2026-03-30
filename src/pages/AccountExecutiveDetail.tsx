import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft, Phone, Mail, Calendar, Building2, RefreshCw, Plus, Trash2,
  CheckCircle, Clock, ChevronDown, ChevronUp, Loader2, Edit2
} from 'lucide-react'
import { useAEAccount, useAEAccountMutations } from '@/hooks/useAEAccounts'
import { useAEActivities, useAEActivityMutations } from '@/hooks/useAEActivities'
import { useAEAccountReminders, useAEReminderMutations } from '@/hooks/useAEReminders'
import { useAccountExecutive } from '@/contexts/AccountExecutiveContext'
import type { AEActivity } from '@/types/account-executive'
import { AE_STAGE_LABELS, AE_STAGE_COLORS, healthScoreBg, healthScoreColor } from '@/types/account-executive'

// ── Helpers ─────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function sourceIcon(source: string) {
  if (source === 'gong') return <Phone className="h-3.5 w-3.5 text-orange-500" />
  if (source === 'gmail') return <Mail className="h-3.5 w-3.5 text-blue-500" />
  if (source === 'google_calendar') return <Calendar className="h-3.5 w-3.5 text-green-500" />
  return <Building2 className="h-3.5 w-3.5 text-gray-400" />
}

function sourceBadge(source: string) {
  const map: Record<string, string> = {
    gong: 'bg-orange-100 text-orange-800',
    gmail: 'bg-blue-100 text-blue-800',
    google_calendar: 'bg-green-100 text-green-800',
    manual: 'bg-gray-100 text-gray-600',
  }
  const labels: Record<string, string> = {
    gong: 'Gong', gmail: 'Gmail', google_calendar: 'Calendar', manual: 'Manual',
  }
  return (
    <Badge variant="secondary" className={`text-[10px] ${map[source] || ''}`}>
      {labels[source] || source}
    </Badge>
  )
}

// ── Activity Card ──────────────────────────────────────────────
function ActivityCard({ activity, onDelete }: { activity: AEActivity; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const hasItems = activity.action_items.length > 0
  const hasSummary = !!activity.summary

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {sourceIcon(activity.source)}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{activity.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {sourceBadge(activity.source)}
              <span className="text-xs text-muted-foreground">{formatDate(activity.occurred_at)}</span>
              {activity.duration_seconds && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(activity.duration_seconds / 60)}min
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(hasItems || hasSummary) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(activity.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 pt-1">
          {hasSummary && (
            <div className="bg-muted/40 rounded p-2">
              <p className="text-xs font-medium mb-1 text-muted-foreground">AI Summary</p>
              <p className="text-xs">{activity.summary}</p>
            </div>
          )}
          {hasItems && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Action Items</p>
              <ul className="space-y-1">
                {activity.action_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{item.text}{item.assignee ? ` — ${item.assignee}` : ''}{item.due_date ? ` (by ${item.due_date})` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activity.participants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Participants</p>
              <p className="text-xs">{activity.participants.map(p => p.name).join(', ')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Reminder Dialog ─────────────────────────────────────────
function AddReminderDialog({ accountId, open, onClose }: { accountId: string; open: boolean; onClose: () => void }) {
  const { createReminder } = useAEReminderMutations()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!title.trim() || !dueAt) return
    setSaving(true)
    try {
      await createReminder.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        due_at: new Date(dueAt).toISOString(),
        ae_account_id: accountId,
        source: 'manual',
      })
      onClose()
      setTitle(''); setDescription(''); setDueAt('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader><DialogTitle>Add Reminder</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Seguimiento de renovación de contrato" />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date *</Label>
            <Input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Detalles opcionales..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!title.trim() || !dueAt || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ───────────────────────────────────────────────────
export function AccountExecutiveDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: account, isLoading } = useAEAccount(id)
  const { deleteAccount, updateAccount } = useAEAccountMutations()
  const { data: activities = [], isLoading: loadingActivities } = useAEActivities(id)
  const { deleteActivity } = useAEActivityMutations()
  const { data: reminders = [] } = useAEAccountReminders(id)
  const { completeReminder, deleteReminder } = useAEReminderMutations()
  const { syncGong, isSyncingGong, analyzeEmails, isAnalyzingEmails } = useAccountExecutive()
  const [addReminderOpen, setAddReminderOpen] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading account...
      </div>
    )
  }

  if (!account) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Cuenta no encontrada.</p>
        <Button variant="link" onClick={() => navigate('/account-executive')}>← Volver</Button>
      </div>
    )
  }

  // All action items across activities
  const allActionItems = activities.flatMap(a =>
    a.action_items.map(item => ({ ...item, activityTitle: a.title, activityId: a.id }))
  )

  const handleDeleteAccount = async () => {
    if (!confirm(`Delete account "${account.name}"? This cannot be undone.`)) return
    await deleteAccount.mutateAsync(account.id)
    navigate('/account-executive')
  }

  const handleSaveNotes = async () => {
    await updateAccount.mutateAsync({ id: account.id, notes })
    setEditingNotes(false)
  }

  const handleDeleteActivity = (activityId: string) => {
    if (confirm('¿Eliminar esta actividad?')) {
      deleteActivity.mutate(activityId)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/account-executive')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-[24px] font-bold tracking-tight font-heading flex items-center gap-2">
              {account.name}
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              <Badge variant="secondary" className={AE_STAGE_COLORS[account.stage]}>
                {AE_STAGE_LABELS[account.stage]}
              </Badge>
              {account.domain && (
                <span className="text-sm text-muted-foreground">{account.domain}</span>
              )}
              {account.contract_value && (
                <span className="text-sm text-muted-foreground font-medium">
                  ${account.contract_value.toLocaleString()} {account.currency}
                </span>
              )}
              {account.renewal_date && (
                <span className="text-sm text-muted-foreground">
                  Renewal: {new Date(account.renewal_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Health Score */}
          <div className="flex items-center gap-1.5 mr-2">
            <div className={`w-3 h-3 rounded-full ${healthScoreBg(account.health_score)}`} />
            <span className={`text-sm font-bold ${healthScoreColor(account.health_score)}`}>
              {account.health_score}
            </span>
            <span className="text-xs text-muted-foreground">Health</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncGong(account.id)}
            disabled={isSyncingGong}
          >
            {isSyncingGong ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Sync Gong
          </Button>
          {account.domain && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyzeEmails(account.id, account.domain!)}
              disabled={isAnalyzingEmails}
            >
              {isAnalyzingEmails ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
              Analyze Emails
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteAccount}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">
            Timeline {activities.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{activities.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="action-items">
            Action Items {allActionItems.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{allActionItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reminders">
            Reminders {reminders.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{reminders.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="overview">General</TabsTrigger>
        </TabsList>

        {/* TIMELINE TAB */}
        <TabsContent value="timeline" className="mt-6">
          <div className="space-y-3">
            {loadingActivities && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading activities...
              </div>
            )}
            {activities.length === 0 && !loadingActivities && (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No activities yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Sincroniza Gong para importar llamadas de esta cuenta.</p>
              </div>
            )}
            {activities.map(a => (
              <ActivityCard
                key={a.id}
                activity={a}
                onDelete={handleDeleteActivity}
              />
            ))}
          </div>
        </TabsContent>

        {/* ACTION ITEMS TAB */}
        <TabsContent value="action-items" className="mt-6">
          {allActionItems.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No action items found.</p>
              <p className="text-xs text-muted-foreground mt-1">Sync Gong to extract action items from call transcripts.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allActionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="w-4 h-4 rounded border border-muted-foreground mt-0.5 shrink-0 flex items-center justify-center" />
                  <div className="min-w-0">
                    <p className="text-sm">{item.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">From: {item.activityTitle}</span>
                      {item.assignee && <span className="text-xs text-muted-foreground">• {item.assignee}</span>}
                      {item.due_date && <Badge variant="outline" className="text-[10px]">{item.due_date}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* REMINDERS TAB */}
        <TabsContent value="reminders" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setAddReminderOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Reminder
            </Button>
          </div>
          {reminders.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No reminders for this account.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reminders.map(r => (
                <div key={r.id} className={`flex items-start justify-between gap-3 p-3 border rounded-lg ${r.completed ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${r.completed ? 'line-through' : ''}`}>{r.title}</p>
                    {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Due: {new Date(r.due_at).toLocaleDateString()}
                      <Badge variant="secondary" className="ml-2 text-[10px]">{r.source}</Badge>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!r.completed && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => completeReminder.mutate(r.id)}>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteReminder.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <AddReminderDialog accountId={account.id} open={addReminderOpen} onClose={() => setAddReminderOpen(false)} />
        </TabsContent>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Account Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Industry</p>
                    <p className="font-medium">{account.industry || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Domain</p>
                    <p className="font-medium">{account.domain || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contract Value</p>
                    <p className="font-medium">
                      {account.contract_value ? `$${account.contract_value.toLocaleString()} ${account.currency}` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fecha de Renovación</p>
                    <p className="font-medium">
                      {account.renewal_date ? new Date(account.renewal_date).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stage</p>
                    <Badge variant="secondary" className={`text-xs ${AE_STAGE_COLORS[account.stage]}`}>
                      {AE_STAGE_LABELS[account.stage]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Health Score</p>
                    <p className={`font-bold ${healthScoreColor(account.health_score)}`}>{account.health_score}/100</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Notes</CardTitle>
                  {!editingNotes && (
                    <Button variant="ghost" size="sm" onClick={() => { setNotes(account.notes || ''); setEditingNotes(true) }}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Agrega notas sobre esta cuenta..." />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveNotes}>Guardar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {account.notes || 'No notes yet. Click Edit to add notes.'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
