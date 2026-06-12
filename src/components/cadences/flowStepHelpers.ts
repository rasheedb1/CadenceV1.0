import { createElement } from 'react'
import {
  ClipboardList,
  Eye,
  HelpCircle,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Reply,
  Sparkles,
  ThumbsUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  linkedin_profile_view: Eye,
  send_email: Mail,
  email_reply: Reply,
  whatsapp: Phone,
  whatsapp_message: Phone,
  cold_call: PhoneCall,
  call_manual: PhoneCall,
  task: ClipboardList,
  generate_ss_deck: Sparkles,
}

export function getStepIcon(stepType: string): LucideIcon {
  return ICON_MAP[stepType] ?? HelpCircle
}

export function StepIcon({ stepType, className }: { stepType: string; className?: string }) {
  return createElement(getStepIcon(stepType), { className })
}

const LABEL_MAP: Record<string, string> = {
  linkedin_message: 'LinkedIn Message',
  linkedin_connect: 'LinkedIn Connect',
  linkedin_like: 'LinkedIn Like',
  linkedin_comment: 'LinkedIn Comment',
  linkedin_profile_view: 'LinkedIn Profile View',
  send_email: 'Email',
  email_reply: 'Email Reply',
  whatsapp: 'WhatsApp',
  whatsapp_message: 'WhatsApp',
  cold_call: 'Cold Call',
  call_manual: 'Manual Call',
  task: 'Task',
  generate_ss_deck: 'Generate SS Deck',
}

export function getStepTypeLabel(stepType: string): string {
  return LABEL_MAP[stepType] ?? stepType
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'muted' | 'info'

export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'sent':
      return 'success'
    case 'failed':
      return 'danger'
    case 'skipped':
      return 'warning'
    case 'pending':
    case 'generated':
      return 'info'
    default:
      return 'muted'
  }
}

export function toneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    case 'danger':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
    case 'warning':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
    case 'info':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function formatRelative(iso: string): string {
  const d = new Date(iso).getTime()
  const diffMs = Date.now() - d
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
