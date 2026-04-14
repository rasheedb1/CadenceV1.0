import { useCallback, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X } from 'lucide-react'
import type { Node } from '@xyflow/react'
import { WORKFLOW_NODE_CONFIG, type WorkflowNodeType } from '@/types/workflow'
import { supabase } from '@/integrations/supabase/client'

interface NodeConfigPanelProps {
  node: Node | null
  onUpdate: (nodeId: string, data: Record<string, any>) => void
  onClose: () => void
}

export function NodeConfigPanel({ node, onUpdate, onClose }: NodeConfigPanelProps) {
  if (!node) return null

  const nodeType = node.type as WorkflowNodeType
  const config = WORKFLOW_NODE_CONFIG[nodeType]
  if (!config) return null

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      onUpdate(node.id, { ...node.data, [field]: value })
    },
    [node.id, node.data, onUpdate]
  )

  return (
    <div className="w-[300px] border-l bg-background overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Configure Node</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Label - common to all nodes */}
          <div className="space-y-2">
            <Label htmlFor="node-label">Label</Label>
            <Input
              id="node-label"
              value={node.data.label as string || ''}
              onChange={(e) => handleChange('label', e.target.value)}
              placeholder="Node label"
            />
          </div>

          {/* Type-specific fields */}
          {nodeType === 'action_linkedin_message' && (
            <div className="space-y-2">
              <Label htmlFor="message-template">Message Template</Label>
              <Textarea
                id="message-template"
                value={node.data.messageTemplate as string || ''}
                onChange={(e) => handleChange('messageTemplate', e.target.value)}
                placeholder="Hi {{first_name}}, I'd love to connect..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{first_name}}'}, {'{{last_name}}'}, {'{{company}}'}, {'{{title}}'} for personalization
              </p>
            </div>
          )}

          {nodeType === 'action_linkedin_connect' && (
            <div className="space-y-2">
              <Label htmlFor="connect-note">Connection Note (optional)</Label>
              <Textarea
                id="connect-note"
                value={node.data.noteText as string || ''}
                onChange={(e) => handleChange('noteText', e.target.value)}
                placeholder="Hi {{first_name}}, I'd like to connect..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Max 300 characters on LinkedIn</p>
            </div>
          )}

          {nodeType === 'action_linkedin_like' && (
            <div className="space-y-2">
              <Label>Reaction Type</Label>
              <Select
                value={node.data.reactionType as string || 'LIKE'}
                onValueChange={(value) => handleChange('reactionType', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LIKE">Like</SelectItem>
                  <SelectItem value="CELEBRATE">Celebrate</SelectItem>
                  <SelectItem value="LOVE">Love</SelectItem>
                  <SelectItem value="INSIGHTFUL">Insightful</SelectItem>
                  <SelectItem value="CURIOUS">Curious</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {nodeType === 'action_linkedin_comment' && (
            <div className="space-y-2">
              <Label htmlFor="comment-text">Comment Text</Label>
              <Textarea
                id="comment-text"
                value={node.data.commentText as string || ''}
                onChange={(e) => handleChange('commentText', e.target.value)}
                placeholder="Great post! ..."
                rows={3}
              />
            </div>
          )}

          {nodeType === 'action_send_email' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  value={node.data.subject as string || ''}
                  onChange={(e) => handleChange('subject', e.target.value)}
                  placeholder="Follow up on our conversation"
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{{first_name}}'}, {'{{company}}'}, {'{{title}}'} for personalization
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-body">Body Template</Label>
                <Textarea
                  id="email-body"
                  value={node.data.bodyTemplate as string || ''}
                  onChange={(e) => handleChange('bodyTemplate', e.target.value)}
                  placeholder="Hi {{first_name}},&#10;&#10;I wanted to follow up..."
                  rows={5}
                />
              </div>
            </>
          )}

          {nodeType === 'action_task' && (
            <div className="space-y-2">
              <Label htmlFor="task-desc">Task Description</Label>
              <Textarea
                id="task-desc"
                value={node.data.taskDescription as string || ''}
                onChange={(e) => handleChange('taskDescription', e.target.value)}
                placeholder="Follow up with this lead about..."
                rows={3}
              />
            </div>
          )}

          {nodeType === 'condition_connection_accepted' && (
            <div className="space-y-2">
              <Label htmlFor="timeout-days">Timeout (days)</Label>
              <Input
                id="timeout-days"
                type="number"
                min={1}
                max={30}
                value={node.data.timeoutDays as number || 7}
                onChange={(e) => handleChange('timeoutDays', parseInt(e.target.value) || 7)}
              />
              <p className="text-xs text-muted-foreground">
                If not accepted within this many days, takes the "No" path
              </p>
            </div>
          )}

          {nodeType === 'condition_message_received' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="keyword-filter">Keyword Filter (optional)</Label>
                <Input
                  id="keyword-filter"
                  value={node.data.keywordFilter as string || ''}
                  onChange={(e) => handleChange('keywordFilter', e.target.value)}
                  placeholder="e.g., interested, yes, sure"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to match any reply
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-timeout">Timeout (days)</Label>
                <Input
                  id="msg-timeout"
                  type="number"
                  min={1}
                  max={30}
                  value={node.data.timeoutDays as number || 7}
                  onChange={(e) => handleChange('timeoutDays', parseInt(e.target.value) || 7)}
                />
              </div>
            </>
          )}

          {nodeType === 'condition_lead_attribute' && (
            <>
              <div className="space-y-2">
                <Label>Field</Label>
                <Select
                  value={node.data.field as string || 'title'}
                  onValueChange={(value) => handleChange('field', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="first_name">First Name</SelectItem>
                    <SelectItem value="last_name">Last Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select
                  value={node.data.operator as string || 'contains'}
                  onValueChange={(value) => handleChange('operator', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="starts_with">Starts With</SelectItem>
                    <SelectItem value="ends_with">Ends With</SelectItem>
                    <SelectItem value="is_empty">Is Empty</SelectItem>
                    <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="attr-value">Value</Label>
                <Input
                  id="attr-value"
                  value={node.data.value as string || ''}
                  onChange={(e) => handleChange('value', e.target.value)}
                  placeholder="e.g., CEO"
                />
              </div>
            </>
          )}

          {(nodeType === 'condition_time_elapsed' || nodeType === 'delay_wait') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={node.data.duration as number || 1}
                  onChange={(e) => handleChange('duration', parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={node.data.unit as string || 'days'}
                  onValueChange={(value) => handleChange('unit', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ========================================== */}
          {/* AGENT WORKFLOW NODE CONFIGS                */}
          {/* ========================================== */}

          {(nodeType === 'action_agent_skill' || nodeType === 'action_agent_task' || nodeType === 'action_agent_review') && (
            <AgentSelector
              agentId={node.data.agentId as string || ''}
              agentName={node.data.agentName as string || ''}
              onChange={(id, name) => {
                handleChange('agentId', id)
                handleChange('agentName', name)
              }}
              label={nodeType === 'action_agent_review' ? 'Reviewer Agent' : 'Agent'}
            />
          )}

          {nodeType === 'action_agent_skill' && (
            <>
              <SkillSelector
                agentId={node.data.agentId as string || ''}
                skillName={node.data.skillName as string || ''}
                onChange={(name, displayName) => {
                  handleChange('skillName', name)
                  handleChange('skillDisplayName', displayName)
                }}
              />
              <div className="space-y-2">
                <Label>On Empty Result</Label>
                <Select value={node.data.onEmpty as string || 'skip'} onValueChange={v => handleChange('onEmpty', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip & continue</SelectItem>
                    <SelectItem value="ask_human">Ask human</SelectItem>
                    <SelectItem value="retry">Retry</SelectItem>
                    <SelectItem value="stop">Stop workflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>On Error</Label>
                <Select value={node.data.onError as string || 'retry'} onValueChange={v => handleChange('onError', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retry">Retry (max 3)</SelectItem>
                    <SelectItem value="notify">Notify & continue</SelectItem>
                    <SelectItem value="stop">Stop workflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {nodeType === 'action_agent_task' && (
            <div className="space-y-2">
              <Label>Instruction</Label>
              <Textarea
                value={node.data.instruction as string || ''}
                onChange={e => handleChange('instruction', e.target.value)}
                placeholder="Investiga la empresa y genera un resumen..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{step_name.field}}'} to reference previous step results
              </p>
            </div>
          )}

          {nodeType === 'action_agent_review' && (
            <div className="space-y-2">
              <Label>Review Criteria</Label>
              <Textarea
                value={node.data.criteria as string || ''}
                onChange={e => handleChange('criteria', e.target.value)}
                placeholder="Verifica que los datos financieros sean correctos..."
                rows={3}
              />
            </div>
          )}

          {nodeType === 'action_notify_human' && (
            <>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={node.data.channel as string || 'whatsapp'} onValueChange={v => handleChange('channel', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={node.data.message as string || ''}
                  onChange={e => handleChange('message', e.target.value)}
                  placeholder="✅ Workflow completado. Resultados: {{last_task_result.summary}}"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{{step_name.field}}'} for dynamic values
                </p>
              </div>
            </>
          )}

          {nodeType === 'condition_task_result' && (
            <>
              <div className="space-y-2">
                <Label>Field</Label>
                <Input
                  value={node.data.field as string || 'status'}
                  onChange={e => handleChange('field', e.target.value)}
                  placeholder="status, count, summary, result.companies"
                />
                <p className="text-xs text-muted-foreground">
                  "status" checks task status. Other fields check last_task_result.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select value={node.data.operator as string || '=='} onValueChange={v => handleChange('operator', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="==">Equals (==)</SelectItem>
                    <SelectItem value="!=">Not equals (!=)</SelectItem>
                    <SelectItem value=">">Greater than (&gt;)</SelectItem>
                    <SelectItem value="<">Less than (&lt;)</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="is_empty">Is empty</SelectItem>
                    <SelectItem value="is_not_empty">Is not empty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  value={node.data.value as string || ''}
                  onChange={e => handleChange('value', e.target.value)}
                  placeholder="done, 0, etc."
                />
              </div>
            </>
          )}

          {nodeType === 'condition_human_approval' && (
            <>
              <div className="space-y-2">
                <Label>Question</Label>
                <Textarea
                  value={node.data.question as string || ''}
                  onChange={e => handleChange('question', e.target.value)}
                  placeholder="No encontré leads. ¿Busco con otros criterios?"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input
                  value={(node.data.options as string[] || []).join(', ')}
                  onChange={e => handleChange('options', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                  placeholder="Sí continuar, No parar, Ajustar criterios"
                />
              </div>
              <div className="space-y-2">
                <Label>Timeout (hours)</Label>
                <Input
                  type="number" min={1} max={72}
                  value={node.data.timeoutHours as number || 4}
                  onChange={e => handleChange('timeoutHours', parseInt(e.target.value) || 4)}
                />
              </div>
            </>
          )}

          {nodeType === 'trigger_scheduled' && (
            <>
              <div className="space-y-2">
                <Label>Schedule</Label>
                <Select
                  value={node.data.cron as string || '0 9 * * 1-5'}
                  onValueChange={v => {
                    handleChange('cron', v)
                    const labels: Record<string, string> = {
                      '0 9 * * 1-5': 'Lunes a Viernes 9am',
                      '0 9 * * 1': 'Cada Lunes 9am',
                      '0 9 * * *': 'Todos los días 9am',
                      '0 */6 * * *': 'Cada 6 horas',
                      '0 */2 * * *': 'Cada 2 horas',
                    }
                    handleChange('description', labels[v] || v)
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0 9 * * 1-5">Lun-Vie 9am</SelectItem>
                    <SelectItem value="0 9 * * 1">Cada Lunes 9am</SelectItem>
                    <SelectItem value="0 9 * * *">Todos los días 9am</SelectItem>
                    <SelectItem value="0 */6 * * *">Cada 6 horas</SelectItem>
                    <SelectItem value="0 */2 * * *">Cada 2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={node.data.timezone as string || 'America/Mexico_City'} onValueChange={v => handleChange('timezone', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Mexico_City">México (CST)</SelectItem>
                    <SelectItem value="America/Bogota">Colombia (COT)</SelectItem>
                    <SelectItem value="America/Lima">Perú (PET)</SelectItem>
                    <SelectItem value="America/Santiago">Chile (CLT)</SelectItem>
                    <SelectItem value="America/Argentina/Buenos_Aires">Argentina (ART)</SelectItem>
                    <SelectItem value="America/Sao_Paulo">Brasil (BRT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {nodeType === 'action_for_each' && (
            <>
              <div className="space-y-2">
                <Label>Array Source</Label>
                <Input
                  value={node.data.arraySource as string || ''}
                  onChange={e => handleChange('arraySource', e.target.value)}
                  placeholder="{{discover.companies}}"
                />
                <p className="text-xs text-muted-foreground">
                  Reference an array from a previous step result
                </p>
              </div>
              <div className="space-y-2">
                <Label>Item Variable Name</Label>
                <Input
                  value={node.data.itemVar as string || 'item'}
                  onChange={e => handleChange('itemVar', e.target.value)}
                  placeholder="company"
                />
                <p className="text-xs text-muted-foreground">
                  Access in next steps as {'{{company.name}}'}, {'{{company.id}}'}
                </p>
              </div>
            </>
          )}

          {nodeType === 'action_retry' && (
            <>
              <div className="space-y-2">
                <Label>Max Retries</Label>
                <Input
                  type="number" min={1} max={10}
                  value={node.data.maxRetries as number || 3}
                  onChange={e => handleChange('maxRetries', parseInt(e.target.value) || 3)}
                />
              </div>
              <div className="space-y-2">
                <Label>Backoff (seconds)</Label>
                <Input
                  type="number" min={10} max={3600}
                  value={node.data.backoffSeconds as number || 60}
                  onChange={e => handleChange('backoffSeconds', parseInt(e.target.value) || 60)}
                />
                <p className="text-xs text-muted-foreground">
                  Doubles each retry (60s → 120s → 240s)
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ========================================
// SUB-COMPONENTS: Agent & Skill Selectors
// ========================================

function AgentSelector({ agentId, onChange, label }: {
  agentId: string; agentName?: string;
  onChange: (id: string, name: string) => void; label: string
}) {
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    supabase.from('agents').select('id, name').eq('status', 'active').then(({ data }) => {
      if (data) setAgents(data)
    })
  }, [])

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={agentId}
        onValueChange={id => {
          const agent = agents.find(a => a.id === id)
          onChange(id, agent?.name || '')
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select agent..." />
        </SelectTrigger>
        <SelectContent>
          {agents.map(a => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function SkillSelector({ agentId, skillName, onChange }: {
  agentId: string; skillName: string;
  onChange: (name: string, displayName: string) => void
}) {
  const [skills, setSkills] = useState<Array<{ name: string; display_name: string }>>([])

  useEffect(() => {
    if (!agentId) { setSkills([]); return }
    // Load skills assigned to this agent
    supabase.from('agent_skills').select('skill_name').eq('agent_id', agentId).eq('enabled', true).then(async ({ data }) => {
      if (!data || data.length === 0) { setSkills([]); return }
      const names = data.map(s => s.skill_name)
      const { data: defs } = await supabase.from('skill_registry').select('name, display_name').in('name', names)
      if (defs) setSkills(defs)
    })
  }, [agentId])

  return (
    <div className="space-y-2">
      <Label>Skill</Label>
      <Select
        value={skillName}
        onValueChange={name => {
          const skill = skills.find(s => s.name === name)
          onChange(name, skill?.display_name || name)
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={agentId ? "Select skill..." : "Select agent first"} />
        </SelectTrigger>
        <SelectContent>
          {skills.map(s => (
            <SelectItem key={s.name} value={s.name}>{s.display_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
