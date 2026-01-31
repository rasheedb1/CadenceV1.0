import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Mail,
  MessageSquare,
  UserPlus,
  ThumbsUp,
  MessageCircle,
  Phone,
  PhoneCall,
} from 'lucide-react'
import { STEP_TYPE_CONFIG, type StepType, type CadenceStep } from '@/types'

const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  send_email: Mail,
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  whatsapp_message: Phone,
  call_manual: PhoneCall,
}

export function CadenceBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { cadences, updateCadence, createStep, updateStep, deleteStep } = useCadence()

  const cadence = cadences.find((c) => c.id === id)
  const steps = cadence?.steps || []

  const [isAddStepOpen, setIsAddStepOpen] = useState(false)
  const [newStep, setNewStep] = useState<{
    step_type: StepType
    step_label: string
    day_offset: number
  }>({
    step_type: 'send_email',
    step_label: '',
    day_offset: 1,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNewStep((prev) => ({
      ...prev,
      step_label: STEP_TYPE_CONFIG[prev.step_type].label,
    }))
  }, [newStep.step_type])

  if (!cadence) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Cadence not found</p>
      </div>
    )
  }

  const stepsByDay = steps.reduce((acc, step) => {
    const day = step.day_offset
    if (!acc[day]) acc[day] = []
    acc[day].push(step)
    return acc
  }, {} as Record<number, CadenceStep[]>)

  const sortedDays = Object.keys(stepsByDay)
    .map(Number)
    .sort((a, b) => a - b)

  const handleAddStep = async () => {
    if (!id) return
    setSaving(true)

    const daySteps = stepsByDay[newStep.day_offset] || []
    const orderInDay = daySteps.length

    await createStep({
      cadence_id: id,
      owner_id: '', // Will be set by context
      step_type: newStep.step_type,
      step_label: newStep.step_label || STEP_TYPE_CONFIG[newStep.step_type].label,
      day_offset: newStep.day_offset,
      order_in_day: orderInDay,
      config_json: {},
    })

    setSaving(false)
    setIsAddStepOpen(false)
    setNewStep({ step_type: 'send_email', step_label: '', day_offset: 1 })
  }

  const handleDeleteStep = async (stepId: string) => {
    if (confirm('Delete this step?')) {
      await deleteStep(stepId)
    }
  }

  const handleMoveStep = async (step: CadenceStep, direction: 'up' | 'down') => {
    const daySteps = stepsByDay[step.day_offset].sort((a, b) => a.order_in_day - b.order_in_day)
    const currentIndex = daySteps.findIndex((s) => s.id === step.id)
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (targetIndex < 0 || targetIndex >= daySteps.length) return

    const targetStep = daySteps[targetIndex]

    await Promise.all([
      updateStep(step.id, { order_in_day: targetStep.order_in_day }),
      updateStep(targetStep.id, { order_in_day: step.order_in_day }),
    ])
  }

  const handleActivate = async () => {
    await updateCadence(id!, { status: 'active' })
  }

  const handleDeactivate = async () => {
    await updateCadence(id!, { status: 'draft' })
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button variant="ghost" onClick={() => navigate('/cadences')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cadences
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{cadence.name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={cadence.status === 'active' ? 'default' : 'secondary'}>
                {cadence.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {steps.length} steps
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {cadence.status === 'draft' ? (
              <Button onClick={handleActivate} disabled={steps.length === 0}>
                Activate Cadence
              </Button>
            ) : (
              <Button variant="outline" onClick={handleDeactivate}>
                Deactivate
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Steps</CardTitle>
              <Button onClick={() => setIsAddStepOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Step
              </Button>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">No steps yet. Add your first step!</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedDays.map((day) => (
                    <div key={day}>
                      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                        Day {day}
                      </h3>
                      <div className="space-y-2">
                        {stepsByDay[day]
                          .sort((a, b) => a.order_in_day - b.order_in_day)
                          .map((step, index) => {
                            const Icon = STEP_ICONS[step.step_type]
                            const config = STEP_TYPE_CONFIG[step.step_type]
                            return (
                              <div
                                key={step.id}
                                className="flex items-center gap-3 rounded-lg border p-3"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium">{step.step_label}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {config.channel}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={index === 0}
                                    onClick={() => handleMoveStep(step, 'up')}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={index === stepsByDay[day].length - 1}
                                    onClick={() => handleMoveStep(step, 'down')}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteStep(step.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Execution Order</CardTitle>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add steps to see the execution order</p>
              ) : (
                <ol className="space-y-2">
                  {sortedDays.flatMap((day) =>
                    stepsByDay[day]
                      .sort((a, b) => a.order_in_day - b.order_in_day)
                      .map((step, index) => (
                        <li key={step.id} className="flex items-center gap-2 text-sm">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                            {sortedDays
                              .slice(0, sortedDays.indexOf(day))
                              .reduce((acc, d) => acc + stepsByDay[d].length, 0) +
                              index +
                              1}
                          </span>
                          <span>
                            Day {day}: {step.step_label}
                          </span>
                        </li>
                      ))
                  )}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isAddStepOpen} onOpenChange={setIsAddStepOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
            <DialogDescription>Configure a new step for your cadence</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Step Type</Label>
              <Select
                value={newStep.step_type}
                onValueChange={(value: StepType) =>
                  setNewStep((prev) => ({ ...prev, step_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPE_CONFIG).map(([type, config]) => (
                    <SelectItem key={type} value={type}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={newStep.step_label}
                onChange={(e) => setNewStep((prev) => ({ ...prev, step_label: e.target.value }))}
                placeholder={STEP_TYPE_CONFIG[newStep.step_type].label}
              />
            </div>
            <div className="space-y-2">
              <Label>Day</Label>
              <Input
                type="number"
                min={1}
                value={newStep.day_offset}
                onChange={(e) =>
                  setNewStep((prev) => ({ ...prev, day_offset: parseInt(e.target.value) || 1 }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddStepOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStep} disabled={saving}>
              {saving ? 'Adding...' : 'Add Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
