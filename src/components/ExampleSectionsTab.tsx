import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { ExampleSection, ExampleMessage } from '@/lib/edge-functions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  MessageSquareText,
} from 'lucide-react'
import { toast } from 'sonner'

export function ExampleSectionsTab() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null)
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [sectionForm, setSectionForm] = useState({ name: '', description: '' })
  const [savingSection, setSavingSection] = useState(false)
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null)

  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [messageForm, setMessageForm] = useState({ body: '' })
  const [messageSectionId, setMessageSectionId] = useState<string | null>(null)
  const [savingMessage, setSavingMessage] = useState(false)
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null)

  // ─── Queries ───

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ['example-sections', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('example_sections')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ExampleSection[]
    },
    enabled: !!user,
  })

  const { data: allMessages = [] } = useQuery({
    queryKey: ['example-messages', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('example_messages')
        .select('*')
        .eq('owner_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as ExampleMessage[]
    },
    enabled: !!user,
  })

  const getMessagesForSection = (sectionId: string) =>
    allMessages.filter(m => m.section_id === sectionId)

  // ─── Section mutations ───

  const createSectionMutation = useMutation({
    mutationFn: async (form: { name: string; description: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('example_sections')
        .insert({
          owner_id: user.id,
          name: form.name,
          description: form.description || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['example-sections'] })
      setIsSectionDialogOpen(false)
      setSectionForm({ name: '', description: '' })
      toast.success('Seccion creada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al crear seccion'),
  })

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: { name: string; description: string } }) => {
      const { error } = await supabase
        .from('example_sections')
        .update({ name: form.name, description: form.description || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['example-sections'] })
      setIsSectionDialogOpen(false)
      setEditingSectionId(null)
      toast.success('Seccion actualizada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  })

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('example_sections').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['example-sections'] })
      queryClient.invalidateQueries({ queryKey: ['example-messages'] })
      setDeleteSectionId(null)
      toast.success('Seccion eliminada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar'),
  })

  // ─── Message mutations ───

  const createMessageMutation = useMutation({
    mutationFn: async ({ sectionId, body }: { sectionId: string; body: string }) => {
      if (!user) throw new Error('Not authenticated')
      const sectionMessages = getMessagesForSection(sectionId)
      const nextOrder = sectionMessages.length > 0
        ? Math.max(...sectionMessages.map(m => m.sort_order)) + 1
        : 0
      const { data, error } = await supabase
        .from('example_messages')
        .insert({
          section_id: sectionId,
          owner_id: user.id,
          body,
          sort_order: nextOrder,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['example-messages'] })
      setIsMessageDialogOpen(false)
      setMessageForm({ body: '' })
      toast.success('Mensaje agregado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al agregar mensaje'),
  })

  const updateMessageMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase
        .from('example_messages')
        .update({ body })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['example-messages'] })
      setIsMessageDialogOpen(false)
      setEditingMessageId(null)
      toast.success('Mensaje actualizado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al actualizar'),
  })

  const deleteMessageMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('example_messages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['example-messages'] })
      setDeleteMessageId(null)
      toast.success('Mensaje eliminado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar'),
  })

  // ─── Handlers ───

  const openCreateSection = () => {
    setSectionForm({ name: '', description: '' })
    setEditingSectionId(null)
    setIsSectionDialogOpen(true)
  }

  const openEditSection = (section: ExampleSection) => {
    setSectionForm({ name: section.name, description: section.description || '' })
    setEditingSectionId(section.id)
    setIsSectionDialogOpen(true)
  }

  const handleSaveSection = async () => {
    if (!sectionForm.name.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    setSavingSection(true)
    try {
      if (editingSectionId) {
        await updateSectionMutation.mutateAsync({ id: editingSectionId, form: sectionForm })
      } else {
        await createSectionMutation.mutateAsync(sectionForm)
      }
    } finally {
      setSavingSection(false)
    }
  }

  const openCreateMessage = (sectionId: string) => {
    setMessageForm({ body: '' })
    setEditingMessageId(null)
    setMessageSectionId(sectionId)
    setIsMessageDialogOpen(true)
  }

  const openEditMessage = (msg: ExampleMessage) => {
    setMessageForm({ body: msg.body })
    setEditingMessageId(msg.id)
    setMessageSectionId(msg.section_id)
    setIsMessageDialogOpen(true)
  }

  const handleSaveMessage = async () => {
    if (!messageForm.body.trim()) {
      toast.error('El mensaje es requerido')
      return
    }
    setSavingMessage(true)
    try {
      if (editingMessageId) {
        await updateMessageMutation.mutateAsync({ id: editingMessageId, body: messageForm.body })
      } else if (messageSectionId) {
        await createMessageMutation.mutateAsync({ sectionId: messageSectionId, body: messageForm.body })
      }
    } finally {
      setSavingMessage(false)
    }
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSectionId(prev => prev === sectionId ? null : sectionId)
  }

  // ─── Render ───

  if (sectionsLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Create button */}
      <div className="flex justify-end">
        <Button onClick={openCreateSection}>
          <Plus className="mr-2 h-4 w-4" />
          Crear Seccion
        </Button>
      </div>

      {/* Empty state */}
      {sections.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No tienes secciones de mensajes base</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Crea secciones con mensajes exitosos para usarlos como guia al generar nuevos mensajes con AI.
              Cada seccion agrupa varios mensajes que comparten un estilo o proposito.
            </p>
            <Button onClick={openCreateSection}>
              <Plus className="mr-2 h-4 w-4" />
              Crear primera seccion
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Section cards */}
      {sections.map(section => {
        const messages = getMessagesForSection(section.id)
        const isExpanded = expandedSectionId === section.id

        return (
          <Card key={section.id}>
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleSection(section.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{section.name}</h3>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {messages.length} {messages.length === 1 ? 'mensaje' : 'mensajes'}
                    </Badge>
                  </div>
                  {section.description && (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {section.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditSection(section)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteSectionId(section.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3">
                <div className="border-t pt-3">
                  {/* Messages list */}
                  {messages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay mensajes en esta seccion. Agrega mensajes exitosos para usarlos como referencia.
                    </p>
                  )}

                  {messages.map((msg, i) => (
                    <div
                      key={msg.id}
                      className="group flex gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors mb-2 last:mb-0"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="h-6 w-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold">
                          {i + 1}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                      </div>
                      <div className="flex items-start gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditMessage(msg)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteMessageId(msg.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Add message button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => openCreateMessage(section.id)}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Agregar mensaje
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Section Dialog (Create / Edit) */}
      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-purple-500" />
              {editingSectionId ? 'Editar Seccion' : 'Crear Seccion'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: Mensajes exitosos para SaaS founders"
                value={sectionForm.name}
                onChange={e => setSectionForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Descripcion (opcional)</Label>
              <Textarea
                placeholder="Ej: Mensajes que tuvieron buena tasa de respuesta para founders de startups SaaS..."
                value={sectionForm.description}
                onChange={e => setSectionForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSectionDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveSection} disabled={savingSection}>
              {savingSection && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingSectionId ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Dialog (Create / Edit) */}
      <Dialog open={isMessageDialogOpen} onOpenChange={setIsMessageDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-purple-500" />
              {editingMessageId ? 'Editar Mensaje' : 'Agregar Mensaje'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mensaje de ejemplo</Label>
              <Textarea
                placeholder="Pega aqui un mensaje exitoso que quieras usar como referencia..."
                value={messageForm.body}
                onChange={e => setMessageForm({ body: e.target.value })}
                rows={8}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este mensaje sera usado como referencia de tono y estructura al generar nuevos mensajes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsMessageDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveMessage} disabled={savingMessage}>
              {savingMessage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingMessageId ? 'Guardar' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Section Confirmation */}
      <AlertDialog open={!!deleteSectionId} onOpenChange={() => setDeleteSectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar seccion?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara la seccion y todos sus mensajes. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteSectionId && deleteSectionMutation.mutate(deleteSectionId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Message Confirmation */}
      <AlertDialog open={!!deleteMessageId} onOpenChange={() => setDeleteMessageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar mensaje?</AlertDialogTitle>
            <AlertDialogDescription>
              El mensaje sera eliminado de esta seccion. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMessageId && deleteMessageMutation.mutate(deleteMessageId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
