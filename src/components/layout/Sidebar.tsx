import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Workflow,
  GitBranch,
  Users,
  MessageSquare,
  Settings,
  FileText,
  Shield,
  ShieldCheck,
  Brain,
  Bell,
  Target,
  Crown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useSuperAdmin } from '@/hooks/useSuperAdmin'
import { useFeatureFlags } from '@/hooks/useFeatureFlag'
import { supabase } from '@/integrations/supabase/client'
import { OrgSwitcher } from './OrgSwitcher'
import type { FeatureFlagKey } from '@/types/feature-flags'

const navigation: { name: string; href: string; icon: typeof LayoutDashboard; featureFlag?: FeatureFlagKey }[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cadences', href: '/cadences', icon: Workflow, featureFlag: 'section_cadences' },
  { name: 'Workflows', href: '/workflows', icon: GitBranch, featureFlag: 'section_workflows' },
  { name: 'Account Mapping', href: '/account-mapping', icon: Target, featureFlag: 'section_account_mapping' },
  { name: 'Company Registry', href: '/company-registry', icon: ShieldCheck, featureFlag: 'section_company_registry' },
  { name: 'Leads', href: '/leads', icon: Users, featureFlag: 'section_leads' },
  { name: 'Templates', href: '/templates', icon: FileText, featureFlag: 'section_templates' },
  { name: 'AI Prompts', href: '/ai-prompts', icon: Brain, featureFlag: 'section_ai_prompts' },
  { name: 'LinkedIn Inbox', href: '/inbox', icon: MessageSquare, featureFlag: 'section_linkedin_inbox' },
  { name: 'Notifications', href: '/notifications', icon: Bell, featureFlag: 'section_notifications' },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Admin', href: '/admin', icon: Shield },
  { name: 'Super Admin', href: '/super-admin/organizations', icon: Crown },
]

export function Sidebar() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { role } = usePermissions()
  const isSuperAdmin = useSuperAdmin()
  const featureFlags = useFeatureFlags()

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread-count', orgId],
    queryFn: async () => {
      if (!user?.id) return 0
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .eq('is_read', false)
      if (error) return 0
      return count || 0
    },
    enabled: !!user?.id && !!orgId,
    refetchInterval: 30000,
  })

  return (
    <div className="flex h-full w-[280px] flex-col sidebar-gradient">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] logo-gradient text-white text-base font-bold shrink-0">
          L
        </div>
        <div>
          <span className="text-base font-semibold tracking-tight font-heading">Laiky Cadence</span>
          <p className="text-xs text-muted-foreground">Sales Automation</p>
        </div>
      </div>

      {/* Org Switcher */}
      <div className="px-4 pb-2">
        <OrgSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-4 py-2">
        {navigation.map((item) => {
          if (item.name === 'Admin' && role !== 'admin') return null
          if (item.name === 'Super Admin' && !isSuperAdmin) return null
          if (item.featureFlag && !featureFlags[item.featureFlag]) return null
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all h-11',
                  isActive
                    ? 'nav-active-gradient text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="flex-1">{item.name}</span>
              {item.name === 'Notifications' && unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

    </div>
  )
}
