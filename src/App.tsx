import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
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
            <CadenceProvider>
            <WorkflowProvider>
            <AccountMappingProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route element={<MainLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/cadences" element={<Cadences />} />
                  <Route path="/cadences/:id" element={<CadenceBuilder />} />
                  <Route path="/cadences/:cadenceId/step/:stepId" element={<LeadStepExecution />} />
                  <Route path="/workflows" element={<Workflows />} />
                  <Route path="/workflows/:id" element={<WorkflowBuilder />} />
                  <Route path="/workflows/:id/runs" element={<WorkflowRuns />} />
                  <Route path="/account-mapping" element={<AccountMapping />} />
                  <Route path="/account-mapping/:id" element={<AccountMapDetail />} />
                  <Route path="/company-registry" element={<CompanyRegistry />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/inbox" element={<LinkedInInbox />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/ai-prompts" element={<AIPrompts />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/admin/logs" element={<AdminLogs />} />
                  <Route path="/admin/metrics" element={<AdminMetrics />} />
                </Route>
              </Routes>
              <Toaster position="bottom-right" />
            </AccountMappingProvider>
            </WorkflowProvider>
            </CadenceProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
