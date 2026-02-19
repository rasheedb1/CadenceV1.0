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
import { LeadStepExecution } from '@/pages/LeadStepExecution'
import { AIPrompts } from '@/pages/AIPrompts'
import { Onboarding } from '@/pages/Onboarding'
import { Workflows } from '@/pages/Workflows'
import { WorkflowBuilder } from '@/pages/WorkflowBuilder'
import { WorkflowRuns } from '@/pages/WorkflowRuns'
import { Notifications } from '@/pages/Notifications'
import { AccountMapping } from '@/pages/AccountMapping'
import { AccountMapDetail } from '@/pages/AccountMapDetail'
import { CompanyRegistry } from '@/pages/CompanyRegistry'
import { AccountMappingProvider } from '@/contexts/AccountMappingContext'
import { OrgSelect } from '@/pages/OrgSelect'
import { AcceptInvite } from '@/pages/AcceptInvite'
import { OrgSettings } from '@/pages/OrgSettings'
import { OrgMembers } from '@/pages/OrgMembers'
import { SuperAdminOrgs } from '@/pages/SuperAdminOrgs'
import { FeatureRoute } from '@/components/FeatureRoute'
import { SalesforceCallback } from '@/pages/SalesforceCallback'

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
        <BrowserRouter>
          <AuthProvider>
            <OrgProvider>
            <CadenceProvider>
            <WorkflowProvider>
            <AccountMappingProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/org-select" element={<OrgSelect />} />
                <Route path="/invite/:token" element={<AcceptInvite />} />
                <Route element={<MainLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/cadences" element={<FeatureRoute flag="section_cadences"><Cadences /></FeatureRoute>} />
                  <Route path="/cadences/:id" element={<FeatureRoute flag="section_cadences"><CadenceBuilder /></FeatureRoute>} />
                  <Route path="/cadences/:cadenceId/step/:stepId" element={<FeatureRoute flag="section_cadences"><LeadStepExecution /></FeatureRoute>} />
                  <Route path="/workflows" element={<FeatureRoute flag="section_workflows"><Workflows /></FeatureRoute>} />
                  <Route path="/workflows/:id" element={<FeatureRoute flag="section_workflows"><WorkflowBuilder /></FeatureRoute>} />
                  <Route path="/workflows/:id/runs" element={<FeatureRoute flag="section_workflows"><WorkflowRuns /></FeatureRoute>} />
                  <Route path="/account-mapping" element={<FeatureRoute flag="section_account_mapping"><AccountMapping /></FeatureRoute>} />
                  <Route path="/account-mapping/:id" element={<FeatureRoute flag="section_account_mapping"><AccountMapDetail /></FeatureRoute>} />
                  <Route path="/company-registry" element={<FeatureRoute flag="section_company_registry"><CompanyRegistry /></FeatureRoute>} />
                  <Route path="/leads" element={<FeatureRoute flag="section_leads"><Leads /></FeatureRoute>} />
                  <Route path="/inbox" element={<FeatureRoute flag="section_linkedin_inbox"><LinkedInInbox /></FeatureRoute>} />
                  <Route path="/templates" element={<FeatureRoute flag="section_templates"><Templates /></FeatureRoute>} />
                  <Route path="/ai-prompts" element={<FeatureRoute flag="section_ai_prompts"><AIPrompts /></FeatureRoute>} />
                  <Route path="/notifications" element={<FeatureRoute flag="section_notifications"><Notifications /></FeatureRoute>} />
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
            </AccountMappingProvider>
            </WorkflowProvider>
            </CadenceProvider>
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
