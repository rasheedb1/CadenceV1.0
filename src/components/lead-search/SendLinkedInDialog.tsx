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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Prospect {
  firstName: string
  lastName: string
  title: string
  company: string
  linkedinUrl: string
  linkedinProviderId: string
}

type MessageType = 'message' | 'connection' | 'inmail'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospect: Prospect | null
}

export function SendLinkedInDialog({ open, onOpenChange, prospect }: Props) {
  const { session, user } = useAuth()
  const { orgId } = useOrg()
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<MessageType>('message')

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token || !user?.id || !orgId || !prospect) {
        throw new EdgeFunctionError('Not authenticated')
      }
      if (!message.trim()) throw new Error('El mensaje no puede estar vacio')

      // First, create a lead record so the edge function can resolve it
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
            status: 'active',
            user_id: user.id,
            org_id: orgId,
          },
          { onConflict: 'user_id,linkedin_url', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      if (leadError) {
        // If upsert fails (e.g., no unique constraint), try insert
        const { data: insertedLead, error: insertError } = await supabase
          .from('leads')
          .insert({
            first_name: prospect.firstName,
            last_name: prospect.lastName,
            title: prospect.title,
            company: prospect.company,
            linkedin_url: prospect.linkedinUrl,
            linkedin_provider_id: prospect.linkedinProviderId,
            status: 'active',
            user_id: user.id,
            org_id: orgId,
          })
          .select('id')
          .single()

        if (insertError) throw insertError
        return sendToLead(insertedLead.id)
      }

      return sendToLead(lead.id)
    },
    onSuccess: () => {
      toast.success('Mensaje enviado por LinkedIn')
      setMessage('')
      setMessageType('message')
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al enviar mensaje')
    },
  })

  async function sendToLead(leadId: string) {
    if (!session?.access_token) throw new EdgeFunctionError('Not authenticated')

    if (messageType === 'connection') {
      return callEdgeFunction<{ success: boolean }>(
        'linkedin-send-connection',
        { leadId, message: message.trim() },
        session.access_token
      )
    }

    // DM or InMail — the edge function handles fallback automatically
    return callEdgeFunction<{ success: boolean }>(
      'linkedin-send-message',
      {
        leadId,
        message: message.trim(),
        ...(messageType === 'inmail' ? { channel: 'sales_navigator' } : {}),
      },
      session.access_token
    )
  }

  if (!prospect) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            Enviar mensaje a {prospect.firstName} {prospect.lastName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {prospect.title} @ {prospect.company}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Tipo de mensaje</Label>
            <Select value={messageType} onValueChange={(v) => setMessageType(v as MessageType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="message">Mensaje directo (DM)</SelectItem>
                <SelectItem value="connection">Solicitud de conexion</SelectItem>
                <SelectItem value="inmail">InMail (Sales Navigator)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Mensaje</Label>
            <Textarea
              placeholder="Escribe tu mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="mt-1"
              maxLength={messageType === 'connection' ? 300 : 8000}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {message.length} / {messageType === 'connection' ? 300 : 8000} caracteres
              {messageType === 'connection' && ' (limite de conexion)'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !message.trim()}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
