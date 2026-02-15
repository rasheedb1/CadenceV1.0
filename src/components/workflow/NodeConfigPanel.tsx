import { useCallback } from 'react'
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
        </div>
      </div>
    </div>
  )
}
