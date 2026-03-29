import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
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
  ArrowLeft,
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
import { useMode } from '@/contexts/ModeContext'
import { supabase } from '@/integrations/supabase/client'
import { OrgSwitcher } from './OrgSwitcher'
import { Button } from '@/components/ui/button'
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

// ── SDR / Prospecting navigation — 3 sections ────────────────────────────────
const sdr_sections: NavSection[] = [
  {
    id: 'daily',
    label: 'Uso Diario',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, end: true },
      { name: 'Buscar Empresas y Leads', href: '/account-mapping', icon: Target, featureFlag: 'section_account_mapping' },
      { name: 'Investigación', href: '/company-research', icon: Building2, featureFlag: 'section_company_research' },
      { name: 'Cadencias', href: '/cadences', icon: Workflow, featureFlag: 'section_cadences' },
      { name: 'Notificaciones', href: '/notifications', icon: Bell, featureFlag: 'section_notifications' },
      { name: 'Inbox LinkedIn', href: '/inbox', icon: MessageSquare, featureFlag: 'section_linkedin_inbox' },
      { name: 'Buscar Leads', href: '/lead-search', icon: Search, featureFlag: 'section_lead_search' },
      { name: 'Agentes IA', href: '/agents', icon: Bot, featureFlag: 'section_agents' },
      { name: 'Actividad Outreach', href: '/outreach', icon: Activity, featureFlag: 'section_cadences' },
    ],
  },
  {
    id: 'onetime',
    label: 'Configuración Inicial',
    items: [
      { name: 'Perfil ICP', href: '/account-mapping?tab=icp-profiles', icon: ScanSearch, featureFlag: 'section_account_mapping' },
      { name: 'Buyer Personas', href: '/buyer-personas', icon: UserCircle, featureFlag: 'section_account_mapping' },
      { name: 'AI Prompts', href: '/ai-prompts', icon: Brain, featureFlag: 'section_ai_prompts' },
      { name: 'Business Cases', href: '/business-cases', icon: Briefcase, featureFlag: 'section_business_cases' },
      { name: 'Templates', href: '/templates', icon: FileText, featureFlag: 'section_templates' },
      { name: 'Workflows', href: '/workflows', icon: GitBranch, featureFlag: 'section_workflows' },
    ],
  },
  {
    id: 'tracker',
    label: 'Seguimiento',
    items: [
      { name: 'Leads', href: '/leads', icon: Users, featureFlag: 'section_leads' },
      { name: 'Business Cases', href: '/business-cases?view=tracker', icon: Briefcase, featureFlag: 'section_business_cases' },
      { name: 'Investigación', href: '/company-research', icon: Building2, featureFlag: 'section_company_research' },
      { name: 'Registro de Empresas', href: '/company-registry', icon: ShieldCheck, featureFlag: 'section_company_registry' },
    ],
  },
]

// ── AE navigation ─────────────────────────────────────────────────────────────
const ae_navigation: { name: string; href: string; icon: typeof LayoutDashboard }[] = [
  { name: 'Ejecutivo de Cuenta', href: '/account-executive', icon: Star },
  { name: 'Pipeline CRM', href: '/account-executive/crm', icon: TrendingUp },
  { name: 'Calendario', href: '/account-executive/calendar', icon: Calendar },
  { name: 'Configuración', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { role } = usePermissions()
  const isSuperAdmin = useSuperAdmin()
  const featureFlags = useFeatureFlags()
  const { mode, setMode } = useMode()
  const navigate = useNavigate()

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    daily: true,
    onetime: true,
    tracker: true,
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

  const handleBackToSDR = () => {
    setMode('sdr')
    navigate('/')
  }

  const isAE = mode === 'ae'

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
      isActive
        ? 'nav-active-gradient text-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
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
          {isAE ? (
            <p className="text-xs font-medium text-amber-500">Ejecutivo de Cuenta</p>
          ) : (
            <p className="text-xs text-muted-foreground">Automatización de Ventas</p>
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
            Volver a Prospección
          </Button>
          <div className="mt-2 border-t border-border/50" />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-1">
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
                  className={navLinkClass}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{item.name}</span>
                </NavLink>
              )
            })}
            {role === 'admin' && (
              <NavLink to="/admin" className={navLinkClass}>
                <Shield className="h-[18px] w-[18px]" />
                <span className="flex-1">Admin</span>
              </NavLink>
            )}
          </>
        ) : (
          // ── SDR Navigation — 3 sections ────────────────────────────
          <>
            {sdr_sections.map((section) => {
              const visibleItems = section.items.filter(
                (item) => !item.featureFlag || featureFlags[item.featureFlag]
              )
              if (visibleItems.length === 0) return null

              const isOpen = openSections[section.id]

              return (
                <div key={section.id} className="mb-3">
                  {/* Section header */}
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
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
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                    >
                      {visibleItems.map((item, idx) => (
                        <motion.div
                          key={item.name}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03, duration: 0.2 }}
                        >
                        <NavLink
                          to={item.href}
                          end={item.end}
                          className={navLinkClass}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="flex-1">{item.name}</span>
                          {item.name === 'Notificaciones' && unreadCount > 0 && (
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
                <span className="flex-1">Configuración</span>
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
        )}
      </nav>
    </div>
  )
}
