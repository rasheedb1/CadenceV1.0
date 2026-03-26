import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { callEdgeFunction, EdgeFunctionError } from '@/lib/edge-functions'
import { supabase } from '@/integrations/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Prospect {
  firstName: string
  lastName: string
  title: string
  company: string
  linkedinUrl: string
  linkedinProviderId: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospect: Prospect | null
}

export function SendEmailDialog({ open, onOpenChange, prospect }: Props) {
  const { session, user } = useAuth()
  const { orgId } = useOrg()
  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token || !user?.id || !orgId || !prospect) {
        throw new EdgeFunctionError('Not authenticated')
      }
      if (!toEmail.trim()) throw new Error('El email es requerido')
      if (!subject.trim()) throw new Error('El asunto es requerido')
      if (!body.trim()) throw new Error('El cuerpo del email es requerido')

      // Create lead record first
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .upsert(
          {
            first_name: prospect.firstName,
            last_name: prospect.lastName,
            title: prospect.title,
            company: prospect.company,
            linkedin_url: prospect.linkedinUrl,
            linkedin_provider_id: prospect.linkedinProviderId,
            email: toEmail.trim(),
            status: 'active',
            user_id: user.id,
            org_id: orgId,
          },
          { onConflict: 'user_id,linkedin_url', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      let leadId: string
      if (leadError) {
        const { data: insertedLead, error: insertError } = await supabase
          .from('leads')
          .insert({
            first_name: prospect.firstName,
            last_name: prospect.lastName,
            title: prospect.title,
            company: prospect.company,
            linkedin_url: prospect.linkedinUrl,
            linkedin_provider_id: prospect.linkedinProviderId,
            email: toEmail.trim(),
            status: 'active',
            user_id: user.id,
            org_id: orgId,
          })
          .select('id')
          .single()

        if (insertError) throw insertError
        leadId = insertedLead.id
      } else {
        leadId = lead.id
      }

      return callEdgeFunction<{ success: boolean; emailId: string }>(
        'send-email',
        {
          leadId,
          to: toEmail.trim(),
          subject: subject.trim(),
          body: body.trim(),
        },
        session.access_token
      )
    },
    onSuccess: () => {
      toast.success('Email enviado')
      setToEmail('')
      setSubject('')
      setBody('')
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al enviar email')
    },
  })

  if (!prospect) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            Enviar email a {prospect.firstName} {prospect.lastName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {prospect.title} @ {prospect.company}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Email destinatario</Label>
            <Input
              type="email"
              placeholder="email@empresa.com"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Asunto</Label>
            <Input
              placeholder="Asunto del email"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Mensaje</Label>
            <Textarea
              placeholder="Escribe el cuerpo del email..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !toEmail.trim() || !subject.trim() || !body.trim()}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
