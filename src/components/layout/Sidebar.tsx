import { NavLink, useNavigate } from 'react-router-dom'
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
  Activity,
  Building2,
  Briefcase,
  Star,
  ArrowLeft,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useSuperAdmin } from '@/hooks/useSuperAdmin'
import { useFeatureFlags } from '@/hooks/useFeatureFlag'
import { useMode } from '@/contexts/ModeContext'
import { supabase } from '@/integrations/supabase/client'
import { OrgSwitcher } from './OrgSwitcher'
import { Button } from '@/components/ui/button'
import type { FeatureFlagKey } from '@/types/feature-flags'

// ── SDR / Prospecting navigation ─────────────────────────────────────────────
const sdr_navigation: { name: string; href: string; icon: typeof LayoutDashboard; featureFlag?: FeatureFlagKey }[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cadences', href: '/cadences', icon: Workflow, featureFlag: 'section_cadences' },
  { name: 'Outreach Activity', href: '/outreach', icon: Activity, featureFlag: 'section_cadences' },
  { name: 'Workflows', href: '/workflows', icon: GitBranch, featureFlag: 'section_workflows' },
  { name: 'Account Mapping', href: '/account-mapping', icon: Target, featureFlag: 'section_account_mapping' },
  { name: 'Company Registry', href: '/company-registry', icon: ShieldCheck, featureFlag: 'section_company_registry' },
  { name: 'Company Research', href: '/company-research', icon: Building2, featureFlag: 'section_company_research' },
  { name: 'Leads', href: '/leads', icon: Users, featureFlag: 'section_leads' },
  { name: 'Business Cases', href: '/business-cases', icon: Briefcase, featureFlag: 'section_business_cases' },
  { name: 'Templates', href: '/templates', icon: FileText, featureFlag: 'section_templates' },
  { name: 'AI Prompts', href: '/ai-prompts', icon: Brain, featureFlag: 'section_ai_prompts' },
  { name: 'LinkedIn Inbox', href: '/inbox', icon: MessageSquare, featureFlag: 'section_linkedin_inbox' },
  { name: 'Notifications', href: '/notifications', icon: Bell, featureFlag: 'section_notifications' },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Admin', href: '/admin', icon: Shield },
  { name: 'Super Admin', href: '/super-admin/organizations', icon: Crown },
]

// ── AE navigation ─────────────────────────────────────────────────────────────
const ae_navigation: { name: string; href: string; icon: typeof LayoutDashboard }[] = [
  { name: 'Account Executive', href: '/account-executive', icon: Star },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { role } = usePermissions()
  const isSuperAdmin = useSuperAdmin()
  const featureFlags = useFeatureFlags()
  const { mode, setMode } = useMode()
  const navigate = useNavigate()

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread-count', orgId],
    queryFn: async () => {
      if (!user?.id) return 0
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .eq('is_read', false)
        .eq('type', 'reply_detected')
      if (error) return 0
      return count || 0
    },
    enabled: !!user?.id && !!orgId,
    refetchInterval: 30000,
  })

  const handleBackToSDR = () => {
    setMode('sdr')
    navigate('/')
  }

  const isAE = mode === 'ae'

  return (
    <div className="flex h-full w-[280px] flex-col sidebar-gradient">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] logo-gradient text-white text-sm font-bold shrink-0">
          C
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-base font-semibold tracking-tight font-heading">Chief</span>
          {isAE ? (
            <p className="text-xs font-medium text-amber-500">Account Executive</p>
          ) : (
            <p className="text-xs text-muted-foreground">Sales Automation</p>
          )}
        </div>
        {isAE && (
          <div className="flex h-5 items-center justify-center rounded-full bg-amber-500/15 px-2">
            <span className="text-[10px] font-semibold text-amber-600">AE</span>
          </div>
        )}
      </div>

      {/* Org Switcher */}
      <div className="px-4 pb-1">
        <OrgSwitcher />
      </div>

      {/* AE mode: back to prospecting button */}
      {isAE && (
        <div className="px-4 pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleBackToSDR}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Prospecting
          </Button>
          <div className="mt-2 border-t border-border/50" />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-4 py-1">
        {isAE ? (
          // ── AE Navigation ──────────────────────────────────────────
          <>
            {ae_navigation.map((item) => {
              if (item.name === 'Admin' && role !== 'admin') return null
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/account-executive'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                      isActive
                        ? 'nav-active-gradient text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )
                  }
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{item.name}</span>
                </NavLink>
              )
            })}
            {role === 'admin' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                    isActive
                      ? 'nav-active-gradient text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )
                }
              >
                <Shield className="h-[18px] w-[18px]" />
                <span className="flex-1">Admin</span>
              </NavLink>
            )}
          </>
        ) : (
          // ── SDR Navigation ─────────────────────────────────────────
          sdr_navigation.map((item) => {
            if (item.name === 'Admin' && role !== 'admin') return null
            if (item.name === 'Super Admin' && !isSuperAdmin) return null
            if (item.featureFlag && !featureFlags[item.featureFlag]) return null
            return (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                    isActive
                      ? 'nav-active-gradient text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span className="flex-1">{item.name}</span>
                {item.name === 'Notifications' && unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            )
          })
        )}
      </nav>

    </div>
  )
}
