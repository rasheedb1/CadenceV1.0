import { useMemo } from 'react'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_FEATURE_FLAGS } from '@/types/feature-flags'
import type { OrgFeatureFlags, FeatureFlagKey } from '@/types/feature-flags'

export function useFeatureFlags(): OrgFeatureFlags {
  const { org, membership } = useOrg()
  const { isSuperAdmin } = useAuth()

  return useMemo(() => {
    // Super Admin always sees everything
    if (isSuperAdmin) return { ...DEFAULT_FEATURE_FLAGS }
    // Merge: defaults → org flags → user flags
    // User-level overrides take precedence over org-level
    return {
      ...DEFAULT_FEATURE_FLAGS,
      ...(org?.feature_flags ?? {}),
      ...(membership?.feature_flags ?? {}),
    }
  }, [org?.feature_flags, membership?.feature_flags, isSuperAdmin])
}

export function useFeatureFlag(flag: FeatureFlagKey): boolean {
  return useFeatureFlags()[flag]
}
