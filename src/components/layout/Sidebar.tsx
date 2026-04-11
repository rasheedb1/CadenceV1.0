import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
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
  Calendar,
  TrendingUp,
  ChevronDown,
  UserCircle,
  ScanSearch,
  Search,
  Bot,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useSuperAdmin } from '@/hooks/useSuperAdmin'
import { useFeatureFlags } from '@/hooks/useFeatureFlag'
// useMode removed — unified nav replaces SDR/AE mode switching
import { supabase } from '@/integrations/supabase/client'
import { OrgSwitcher } from './OrgSwitcher'
// Button removed — no longer needed for back-to-SDR
import type { FeatureFlagKey } from '@/types/feature-flags'

type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  featureFlag?: FeatureFlagKey
  end?: boolean
}

type NavSection = {
  id: string
  label: string
  items: NavItem[]
}

// ── Unified navigation — organized by app ─────────────────────────────────────
const sdr_sections: NavSection[] = [
  {
    id: 'agents',
    label: 'AI Agents',
    items: [
      { name: 'Agents', href: '/agents', icon: Bot, featureFlag: 'section_agents', end: true },
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    id: 'outreach',
    label: 'Outreach',
    items: [
      { name: 'Find Companies & Leads', href: '/account-mapping', icon: Target, featureFlag: 'section_account_mapping' },
      { name: 'Research', href: '/company-research', icon: Building2, featureFlag: 'section_company_research' },
      { name: 'Cadences', href: '/cadences', icon: Workflow, featureFlag: 'section_cadences' },
      { name: 'Lead Search', href: '/lead-search', icon: Search, featureFlag: 'section_lead_search' },
      { name: 'Leads', href: '/leads', icon: Users, featureFlag: 'section_leads' },
      { name: 'LinkedIn Inbox', href: '/inbox', icon: MessageSquare, featureFlag: 'section_linkedin_inbox' },
      { name: 'Outreach Activity', href: '/outreach', icon: Activity, featureFlag: 'section_cadences' },
      { name: 'Notifications', href: '/notifications', icon: Bell, featureFlag: 'section_notifications' },
    ],
  },
  {
    id: 'ae',
    label: 'Account Executive',
    items: [
      { name: 'Accounts', href: '/account-executive', icon: Star, featureFlag: 'section_account_executive' },
      { name: 'Pipeline CRM', href: '/account-executive/crm', icon: TrendingUp, featureFlag: 'section_account_executive' },
      { name: 'Calendar', href: '/account-executive/calendar', icon: Calendar, featureFlag: 'section_account_executive' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools & Setup',
    items: [
      { name: 'ICP Profile', href: '/account-mapping?tab=icp-profiles', icon: ScanSearch, featureFlag: 'section_account_mapping' },
      { name: 'Buyer Personas', href: '/buyer-personas', icon: UserCircle, featureFlag: 'section_account_mapping' },
      { name: 'AI Prompts', href: '/ai-prompts', icon: Brain, featureFlag: 'section_ai_prompts' },
      { name: 'Business Cases', href: '/business-cases', icon: Briefcase, featureFlag: 'section_business_cases' },
      { name: 'Templates', href: '/templates', icon: FileText, featureFlag: 'section_templates' },
      { name: 'Workflows', href: '/workflows', icon: GitBranch, featureFlag: 'section_workflows' },
      { name: 'Company Registry', href: '/company-registry', icon: ShieldCheck, featureFlag: 'section_company_registry' },
    ],
  },
]

// ae_navigation removed — AE items now in unified sdr_sections

export function Sidebar() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { role } = usePermissions()
  const isSuperAdmin = useSuperAdmin()
  const featureFlags = useFeatureFlags()
  // mode context kept for backward compat but not used in unified nav

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    agents: true,
    outreach: true,
    ae: false,
    tools: false,
  })

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

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium',
      'transition-all duration-150 ease-out',
      isActive
        ? 'nav-active-gradient text-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:shadow-sm'
    )

  return (
    <div className="flex h-full w-[280px] flex-col sidebar-gradient">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] logo-gradient text-white text-sm font-bold shrink-0">
          C
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-base font-semibold tracking-tight font-heading">Chief</span>
          <p className="text-xs text-muted-foreground">AI Platform</p>
        </div>
      </div>

      {/* Org Switcher */}
      <div className="px-4 pb-1">
        <OrgSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-1">
        {/* ── Unified Navigation — organized by app ────────────────── */}
        <>
            {sdr_sections.map((section) => {
              const visibleItems = section.items.filter(
                (item) => !item.featureFlag || featureFlags[item.featureFlag]
              )
              if (visibleItems.length === 0) return null

              const isOpen = openSections[section.id]

              return (
                <div key={section.id} className="mb-4">
                  {/* Section header */}
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 ease-out"
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 transition-transform duration-200',
                        !isOpen && '-rotate-90'
                      )}
                    />
                  </button>

                  {/* Section items — animated */}
                  <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="space-y-0.5 mt-0.5 overflow-hidden"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      {visibleItems.map((item, idx) => (
                        <motion.div
                          key={item.name}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.025, duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                        >
                        <NavLink
                          to={item.href}
                          end={item.end}
                          className={navLinkClass}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="flex-1">{item.name}</span>
                          {item.name === 'Notifications' && unreadCount > 0 && (
                            <motion.span
                              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground"
                              animate={{ scale: [1, 1.15, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </motion.span>
                          )}
                        </NavLink>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              )
            })}

            {/* Bottom items: Settings, Admin, Super Admin */}
            <div className="mt-2 border-t border-border/50 pt-2 space-y-0.5">
              <NavLink to="/settings" className={navLinkClass}>
                <Settings className="h-[18px] w-[18px]" />
                <span className="flex-1">Settings</span>
              </NavLink>
              {role === 'admin' && (
                <NavLink to="/admin" className={navLinkClass}>
                  <Shield className="h-[18px] w-[18px]" />
                  <span className="flex-1">Admin</span>
                </NavLink>
              )}
              {isSuperAdmin && (
                <NavLink to="/super-admin/organizations" className={navLinkClass}>
                  <Crown className="h-[18px] w-[18px]" />
                  <span className="flex-1">Super Admin</span>
                </NavLink>
              )}
            </div>
          </>
      </nav>
    </div>
  )
}
