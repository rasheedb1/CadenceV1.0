import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Search, Trash2, ExternalLink, Users } from 'lucide-react'
import type { AccountMapCompany } from '@/types/account-mapping'
import { SalesforceBadge } from '@/components/salesforce/SalesforceBadge'
import type { SalesforceMatch } from '@/hooks/useSalesforceCheck'

interface CompanyCardProps {
  company: AccountMapCompany
  prospectCount?: number
  sfMatch?: SalesforceMatch | null
  onSearchProspects: (company: AccountMapCompany) => void
  onDeleteCompany: (id: string) => void
}

export function CompanyCard({ company, prospectCount = 0, sfMatch, onSearchProspects, onDeleteCompany }: CompanyCardProps) {
  const hasBadges = company.industry || company.company_size || company.location

  return (
    <div className="rounded-lg border p-3 hover:border-primary/20 transition-colors">
      {/* Row 1: Name + Actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{company.company_name}</span>
          <SalesforceBadge match={sfMatch || null} compact />
          {prospectCount > 0 && (
            <Badge variant="secondary" className="text-[10px] shrink-0 gap-1">
              <Users className="h-3 w-3" />
              {prospectCount}
            </Badge>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSearchProspects(company)}>
              <Search className="mr-2 h-4 w-4" /> Search Prospects
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDeleteCompany(company.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 2: Badges */}
      {hasBadges && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {company.industry && (
            <Badge variant="secondary" className="text-xs">{company.industry}</Badge>
          )}
          {company.company_size && (
            <Badge variant="outline" className="text-xs">{company.company_size}</Badge>
          )}
          {company.location && (
            <Badge variant="outline" className="text-xs">{company.location}</Badge>
          )}
        </div>
      )}

      {/* Row 3: Description */}
      {company.description && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{company.description}</p>
      )}

      {/* Row 4: Website */}
      {company.website && (
        <a
          href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}
    </div>
  )
}
