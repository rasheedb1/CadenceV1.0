import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const url = new URL(window.location.href)
    const errorParam = url.searchParams.get('error') || url.hash.match(/error=([^&]+)/)?.[1]
    const errorDescription =
      url.searchParams.get('error_description') ||
      decodeURIComponent(url.hash.match(/error_description=([^&]+)/)?.[1] ?? '')

    if (errorParam) {
      console.error('[AuthCallback] OAuth error', { error: errorParam, description: errorDescription, url: window.location.href })
      const reason = errorDescription.toLowerCase().includes('restricted')
        ? 'domain_restricted'
        : 'oauth_error'
      supabase.auth.signOut().finally(() => {
        navigate(`/auth?error=${reason}`, { replace: true })
      })
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/', { replace: true })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/', { replace: true })
      }
    })

    const timeout = setTimeout(() => {
      navigate('/auth?error=oauth_timeout', { replace: true })
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  )
}
