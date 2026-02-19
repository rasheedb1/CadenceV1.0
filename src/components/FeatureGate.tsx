import type { ReactNode } from 'react'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import type { FeatureFlagKey } from '@/types/feature-flags'

interface FeatureGateProps {
  flag: FeatureFlagKey
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Hides children when the feature flag is OFF for the current org.
 * Super Admins always see everything.
 */
export function FeatureGate({ flag, children, fallback = null }: FeatureGateProps) {
  const enabled = useFeatureFlag(flag)
  if (!enabled) return <>{fallback}</>
  return <>{children}</>
}
