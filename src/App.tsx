// Pipeline test - auto build and deploy
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { OrgProvider } from '@/contexts/OrgContext'
import { CadenceProvider } from '@/contexts/CadenceContext'
import { WorkflowProvider } from '@/contexts/WorkflowContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { MainLayout } from '@/components/layout/MainLayout'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  Agents,
  Auth,
  Dashboard,
  Cadences,
  CadenceBuilder,
  Leads,
  LinkedInInbox,
  Settings,
  Templates,
  Admin,
  AdminLogs,
  AdminMetrics,
} from '@/pages'
import { AuthCallback } from '@/pages/AuthCallback'
import { LeadStepExecution } from '@/pages/LeadStepExecution'
import { CadenceFlow } from '@/pages/CadenceFlow'
import { AIPrompts } from '@/pages/AIPrompts'
import { Onboarding } from '@/pages/Onboarding'
import { Workflows } from '@/pages/Workflows'
import { WorkflowBuilder } from '@/pages/WorkflowBuilder'
import { WorkflowRuns } from '@/pages/WorkflowRuns'
import { Notifications } from '@/pages/Notifications'
import { AccountMapping } from '@/pages/AccountMapping'
import { AccountMapDetail } from '@/pages/AccountMapDetail'
import { ICPProfileDetail } from '@/pages/ICPProfileDetail'
import { CompanyRegistry } from '@/pages/CompanyRegistry'
import { BuyerPersonas } from '@/pages/BuyerPersonas'
import { AccountMappingProvider } from '@/contexts/AccountMappingContext'
import { CompanyResearchProvider } from '@/contexts/CompanyResearchContext'
import { BusinessCasesProvider } from '@/contexts/BusinessCasesContext'
import { PageErrorBoundary } from '@/components/PageErrorBoundary'
import { OrgSelect } from '@/pages/OrgSelect'
import { AcceptInvite } from '@/pages/AcceptInvite'
import { OrgSettings } from '@/pages/OrgSettings'
import { OrgMembers } from '@/pages/OrgMembers'
import { SuperAdminOrgs } from '@/pages/SuperAdminOrgs'
import { FeatureRoute } from '@/components/FeatureRoute'
import { SalesforceCallback } from '@/pages/SalesforceCallback'
import { OutreachActivity } from '@/pages/OutreachActivity'
import { CompanyResearch } from '@/pages/CompanyResearch'
import { ResearchProjectDetail } from '@/pages/ResearchProjectDetail'
import { BusinessCases } from '@/pages/BusinessCases'
import { BusinessCaseNew } from '@/pages/BusinessCaseNew'
import { Presentaciones } from '@/pages/Presentaciones'
import { BusinessCaseTemplateEditor } from '@/pages/BusinessCaseTemplateEditor'
import { BusinessCaseGenerate } from '@/pages/BusinessCaseGenerate'
import { AccountExecutive } from '@/pages/AccountExecutive'
import { AccountExecutiveCalendar } from '@/pages/AccountExecutiveCalendar'
import { AccountExecutiveDetail } from '@/pages/AccountExecutiveDetail'
import { CRMPipeline } from '@/pages/CRMPipeline'
import { AccountExecutiveProvider } from '@/contexts/AccountExecutiveContext'
import { AgentProvider } from '@/contexts/AgentContext'
import { ModeProvider } from '@/contexts/ModeContext'
import { LeadSearch } from '@/pages/LeadSearch'
import { AgentDetail } from '@/pages/AgentDetail'
import { AppLauncher } from '@/pages/AppLauncher'
import { MissionControl } from '@/pages/MissionControl'
import Chat from '@/pages/Chat'

// SS deck (Stripe Sessions style decks at /m/:slug). Lazy-loaded so the
// 21 slide components + 40MB of assets don't inflate the main bundle.
const SSDeckRoute = lazy(() => import('@/ss-deck/SSDeckRoute'))
const SSDeckPrintRoute = lazy(() => import('@/ss-deck/SSDeckPrintRoute'))

// Workshop BC deck (/workshop/:slug). Lazy-loaded — reuses ss-deck tokens
// and primitives but has its own 17-slide deck for workshop-grade BCs.
const WorkshopRoute = lazy(() => import('@/workshops-bc/WorkshopRoute'))
const WorkshopPrintRoute = lazy(() => import('@/workshops-bc/WorkshopPrintRoute'))

// Pricing-only mini-deck (/pricing/:slug). Reads the same workshops_bc
// row but renders just the 7 commercial-proposal slides (cover · CNP ·
// CP/POS · included features · add-ons · NOVA+concierge · closing).
const PricingRoute = lazy(() => import('@/workshops-bc/PricingRoute'))
const PricingPrintRoute = lazy(() => import('@/workshops-bc/PricingPrintRoute'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ModeProvider>
        <BrowserRouter>
          <AuthProvider>
            <OrgProvider>
            <CadenceProvider>
            <WorkflowProvider>
            <AccountMappingProvider>
            <CompanyResearchProvider>
            <BusinessCasesProvider>
            <AgentProvider>
            <AccountExecutiveProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/org-select" element={<OrgSelect />} />
                <Route path="/invite/:token" element={<AcceptInvite />} />
                <Route path="/" element={<AppLauncher />} />
                <Route path="/mission-control" element={<MissionControl />} />
                {/* Agents — standalone app (not inside Chief Outreach) */}
                <Route path="/agents" element={<Agents />} />
                <Route path="/agents/:id" element={<AgentDetail />} />
                <Route path="/agents/workflows" element={<Workflows />} />
                <Route path="/agents/workflows/:id" element={<WorkflowBuilder />} />
                <Route path="/agents/workflows/:id/runs" element={<WorkflowRuns />} />

                {/* Chat with agents */}
                <Route path="/chat" element={<Chat />} />
                <Route path="/chat/:id" element={<Chat />} />
                {/* Presentaciones — standalone app (own dashboard for BCs, separate from Outreach) */}
                <Route path="/presentaciones" element={<Presentaciones />} />

                {/* Stripe Sessions style decks — fully public, no auth/layout */}
                <Route path="/m/:slug" element={<Suspense fallback={null}><SSDeckRoute /></Suspense>} />
                <Route path="/m/:slug/pdf" element={<Suspense fallback={null}><SSDeckPrintRoute /></Suspense>} />

                {/* Workshop BC decks — fully public, no auth/layout */}
                <Route path="/workshop/:slug" element={<Suspense fallback={null}><WorkshopRoute /></Suspense>} />
                <Route path="/workshop/:slug/pdf" element={<Suspense fallback={null}><WorkshopPrintRoute /></Suspense>} />

                {/* Pricing-only mini-deck — public, no auth/layout */}
                <Route path="/pricing/:slug" element={<Suspense fallback={null}><PricingRoute /></Suspense>} />
                <Route path="/pricing/:slug/pdf" element={<Suspense fallback={null}><PricingPrintRoute /></Suspense>} />
                <Route element={<MainLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/cadences" element={<FeatureRoute flag="section_cadences"><Cadences /></FeatureRoute>} />
                  <Route path="/cadences/:id" element={<FeatureRoute flag="section_cadences"><CadenceBuilder /></FeatureRoute>} />
                  <Route path="/cadences/:cadenceId/step/:stepId" element={<FeatureRoute flag="section_cadences"><LeadStepExecution /></FeatureRoute>} />
                  <Route path="/cadence-flow" element={<FeatureRoute flag="section_cadences"><CadenceFlow /></FeatureRoute>} />
                  <Route path="/cadence-flow/:id" element={<FeatureRoute flag="section_cadences"><CadenceFlow /></FeatureRoute>} />
                  <Route path="/workflows" element={<FeatureRoute flag="section_workflows"><Workflows /></FeatureRoute>} />
                  <Route path="/workflows/:id" element={<FeatureRoute flag="section_workflows"><WorkflowBuilder /></FeatureRoute>} />
                  <Route path="/workflows/:id/runs" element={<FeatureRoute flag="section_workflows"><WorkflowRuns /></FeatureRoute>} />
                  <Route path="/account-mapping" element={<FeatureRoute flag="section_account_mapping"><AccountMapping /></FeatureRoute>} />
                  <Route path="/account-mapping/icp-profiles/:id" element={<FeatureRoute flag="section_account_mapping"><PageErrorBoundary><ICPProfileDetail /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/account-mapping/:id" element={<FeatureRoute flag="section_account_mapping"><AccountMapDetail /></FeatureRoute>} />
                  <Route path="/buyer-personas" element={<FeatureRoute flag="section_account_mapping"><BuyerPersonas /></FeatureRoute>} />
                  <Route path="/company-registry" element={<FeatureRoute flag="section_company_registry"><CompanyRegistry /></FeatureRoute>} />
                  <Route path="/company-research" element={<FeatureRoute flag="section_company_research"><PageErrorBoundary><CompanyResearch /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/company-research/:id" element={<FeatureRoute flag="section_company_research"><PageErrorBoundary><ResearchProjectDetail /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/business-cases" element={<FeatureRoute flag="section_business_cases"><BusinessCases /></FeatureRoute>} />
                  <Route path="/business-cases/new" element={<FeatureRoute flag="section_business_cases"><BusinessCaseNew /></FeatureRoute>} />
                  <Route path="/business-cases/templates/:id" element={<FeatureRoute flag="section_business_cases"><BusinessCaseTemplateEditor /></FeatureRoute>} />
                  <Route path="/business-cases/generate" element={<FeatureRoute flag="section_business_cases"><BusinessCaseGenerate /></FeatureRoute>} />
                  <Route path="/account-executive" element={<FeatureRoute flag="section_account_executive"><PageErrorBoundary><AccountExecutive /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/account-executive/crm" element={<FeatureRoute flag="section_account_executive"><PageErrorBoundary><CRMPipeline /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/account-executive/:id" element={<FeatureRoute flag="section_account_executive"><PageErrorBoundary><AccountExecutiveDetail /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/account-executive/calendar" element={<FeatureRoute flag="section_account_executive"><PageErrorBoundary><AccountExecutiveCalendar /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/account-executive/presentations" element={<FeatureRoute flag="section_account_executive"><PageErrorBoundary><Presentaciones embedded /></PageErrorBoundary></FeatureRoute>} />
                  <Route path="/lead-search" element={<FeatureRoute flag="section_lead_search"><LeadSearch /></FeatureRoute>} />
                  <Route path="/leads" element={<FeatureRoute flag="section_leads"><Leads /></FeatureRoute>} />
                  <Route path="/inbox" element={<FeatureRoute flag="section_linkedin_inbox"><LinkedInInbox /></FeatureRoute>} />
                  <Route path="/templates" element={<FeatureRoute flag="section_templates"><Templates /></FeatureRoute>} />
                  <Route path="/ai-prompts" element={<FeatureRoute flag="section_ai_prompts"><AIPrompts /></FeatureRoute>} />
                  <Route path="/notifications" element={<FeatureRoute flag="section_notifications"><Notifications /></FeatureRoute>} />
                  <Route path="/outreach" element={<OutreachActivity />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/organization" element={<OrgSettings />} />
                  <Route path="/settings/members" element={<OrgMembers />} />
                  <Route path="/settings/salesforce/callback" element={<SalesforceCallback />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/admin/logs" element={<AdminLogs />} />
                  <Route path="/admin/metrics" element={<AdminMetrics />} />
                  <Route path="/super-admin/organizations" element={<SuperAdminOrgs />} />
                </Route>
              </Routes>
              <Toaster position="bottom-right" />
            </AccountExecutiveProvider>
            </AgentProvider>
            </BusinessCasesProvider>
            </CompanyResearchProvider>
            </AccountMappingProvider>
            </WorkflowProvider>
            </CadenceProvider>
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>
        </ModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
