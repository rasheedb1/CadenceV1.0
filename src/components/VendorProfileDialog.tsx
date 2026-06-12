import { useState, useEffect, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

// Profile used to personalize the closing slide of any SDR BC the user creates.
// Persisted in user_sales_profiles (per-user, RLS-protected). The form is
// auto-opened the first time the user tries to create a BC without a profile,
// and can be edited from the Presentations page header.

export interface VendorProfile {
  user_id: string
  name: string
  title: string | null
  email: string
  phone: string | null
  demo_calendar_url: string | null
  avatar_url: string | null
}

export function useVendorProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['vendor-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<VendorProfile | null> => {
      if (!user?.id) return null
      const { data, error } = await supabase
        .from('user_sales_profiles')
        .select('user_id, name, title, email, phone, demo_calendar_url, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as VendorProfile | null
    },
  })
}

interface VendorProfileDialogProps {
  open: boolean
  onClose: () => void
  // True when this is the user's first save (no profile exists yet). Used to
  // tweak copy so the prompt doesn't feel like an edit dialog out of context.
  isFirstTime?: boolean
}

export function VendorProfileDialog({ open, onClose, isFirstTime }: VendorProfileDialogProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: existing } = useVendorProfile()

  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hydrate form when dialog opens (or when an existing profile loads).
  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? user?.user_metadata?.full_name ?? '')
    setTitle(existing?.title ?? '')
    setPhone(existing?.phone ?? '')
    setDemoUrl(existing?.demo_calendar_url ?? '')
    setError(null)
  }, [open, existing, user])

  const upsertProfile = useMutation({
    mutationFn: async () => {
      if (!user?.id || !user?.email) throw new Error('Not authenticated')
      const payload = {
        user_id: user.id,
        name: name.trim(),
        title: title.trim() || null,
        email: user.email,
        phone: phone.trim() || null,
        demo_calendar_url: demoUrl.trim() || null,
      }
      const { error } = await supabase.from('user_sales_profiles').upsert(payload, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-profile', user?.id] })
      toast.success('Sales profile saved', {
        description: 'It will appear on the closing slide of your next SDR BC.',
      })
      onClose()
    },
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name is required'); return }
    if (demoUrl.trim() && !/^https?:\/\//i.test(demoUrl.trim())) {
      setError('Calendar URL must start with http:// or https://')
      return
    }
    setSubmitting(true)
    try {
      await upsertProfile.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" aria-hidden="true" />
            {isFirstTime ? 'Set up your sales profile' : 'Edit your sales profile'}
          </DialogTitle>
          <DialogDescription>
            {isFirstTime
              ? 'This goes on the closing slide of every SDR BC you generate. You can edit it anytime from the Presentations page.'
              : 'Updates apply to future SDR BCs. Existing decks keep the snapshot they were generated with.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="vp-name">Full name *</Label>
            <Input id="vp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rasheed Bayter" required disabled={submitting} autoFocus />
          </div>

          <div>
            <Label htmlFor="vp-title">Role / title</Label>
            <Input id="vp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Director, LATAM Sales" disabled={submitting} />
            <p className="text-xs text-muted-foreground mt-1">Shown under your name on the closing slide.</p>
          </div>

          <div>
            <Label htmlFor="vp-email">Email</Label>
            <Input id="vp-email" type="email" value={user?.email ?? ''} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground mt-1">Pulled from your login account.</p>
          </div>

          <div>
            <Label htmlFor="vp-phone">Phone</Label>
            <Input id="vp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 305 555 0101" disabled={submitting} />
            <p className="text-xs text-muted-foreground mt-1">Optional. Format as you'd want it shown.</p>
          </div>

          <div>
            <Label htmlFor="vp-demo">"Schedule workshop" link</Label>
            <Input id="vp-demo" type="url" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://calendly.com/your-handle/technical-workshop" disabled={submitting} />
            <p className="text-xs text-muted-foreground mt-1">Calendly / SavvyCal / etc. The big CTA on the closing slide links here. Leave blank to hide the button.</p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                isFirstTime ? 'Save and continue' : 'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
