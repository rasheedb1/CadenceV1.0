import { useICPProfiles } from '@/hooks/useICPProfiles'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ExternalLink, Users, Unlink, AlertTriangle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ICPProfile, BuyingCommitteeRole } from '@/types/account-mapping'
import { BUYING_ROLE_CONFIG } from '@/types/account-mapping'

interface ICPProfileSelectorProps {
  accountMapId: string
  currentProfileId: string | null
  currentProfile: ICPProfile | null | undefined
  /** Whether the account map has legacy inline ICP data (for migration banner) */
  hasInlineICP: boolean
  onLink: (profileId: string | null) => void
  onConvertInline: () => void
}

export function ICPProfileSelector({
  accountMapId: _accountMapId,
  currentProfileId,
  currentProfile,
  hasInlineICP,
  onLink,
  onConvertInline,
}: ICPProfileSelectorProps) {
  const { data: profiles = [] } = useICPProfiles()
  const personas = currentProfile?.buyer_personas || []

  return (
    <div className="space-y-4">
      {/* Migration banner for legacy inline ICP data */}
      {hasInlineICP && !currentProfileId && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  This account map has inline ICP data
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">
                  Convert it to a reusable ICP Profile so you can use it across multiple account maps.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={onConvertInline}
                >
                  <ArrowRight className="mr-1 h-4 w-4" />
                  Convert to ICP Profile
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">ICP Profile</label>
          {currentProfileId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onLink(null)}
            >
              <Unlink className="mr-1 h-3 w-3" /> Unlink
            </Button>
          )}
        </div>
        <Select
          value={currentProfileId || '__none__'}
          onValueChange={(v) => onLink(v === '__none__' ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an ICP Profile..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No profile linked</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(p as unknown as { persona_count: number }).persona_count} personas)
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview of linked profile */}
      {currentProfile && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{currentProfile.name}</p>
                {currentProfile.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {currentProfile.description}
                  </p>
                )}
              </div>
              <Link to={`/account-mapping/icp-profiles/${currentProfile.id}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <ExternalLink className="mr-1 h-3 w-3" /> Edit Profile
                </Button>
              </Link>
            </div>

            {/* Personas preview */}
            {personas.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {personas.length} Buyer Persona{personas.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {[...personas]
                    .sort((a, b) => {
                      if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
                      return a.priority - b.priority
                    })
                    .map((persona) => {
                      const roleConfig = persona.role_in_buying_committee
                        ? BUYING_ROLE_CONFIG[persona.role_in_buying_committee as BuyingCommitteeRole]
                        : null
                      return (
                        <div key={persona.id} className="flex items-center gap-1.5 text-sm">
                          <span className="text-xs text-muted-foreground font-mono">{persona.priority}.</span>
                          <span>{persona.name}</span>
                          {persona.is_required && (
                            <span className="text-amber-500 text-xs" title="Required">*</span>
                          )}
                          {roleConfig && (
                            <Badge variant="outline" className={`text-[10px] h-4 ${roleConfig.color}`}>
                              {roleConfig.label}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            max {persona.max_per_company}/company
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {personas.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No personas defined in this profile.{' '}
                <Link
                  to={`/account-mapping/icp-profiles/${currentProfile.id}`}
                  className="text-primary underline"
                >
                  Add some
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!currentProfileId && !hasInlineICP && (
        <p className="text-xs text-muted-foreground">
          Select an ICP Profile to define the target customer and buyer personas for this account map.{' '}
          <Link to="/account-mapping" className="text-primary underline">
            Create one in the ICP Profiles tab
          </Link>
        </p>
      )}
    </div>
  )
}
