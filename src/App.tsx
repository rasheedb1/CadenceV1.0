import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { CadenceProvider } from '@/contexts/CadenceContext'
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <CadenceProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route element={<MainLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/cadences" element={<Cadences />} />
                  <Route path="/cadences/:id" element={<CadenceBuilder />} />
                  <Route path="/cadences/:cadenceId/step/:stepId" element={<LeadStepExecution />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/inbox" element={<LinkedInInbox />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/admin/logs" element={<AdminLogs />} />
                  <Route path="/admin/metrics" element={<AdminMetrics />} />
                </Route>
              </Routes>
              <Toaster position="bottom-right" />
            </CadenceProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
