import { useState, useMemo } from 'react'
import { ChevronsUpDown, Search, X, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Input } from './input'
import { Badge } from './badge'
import { Checkbox } from './checkbox'
import { ScrollArea } from './scroll-area'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
  group?: string
}

interface SearchableMultiSelectProps {
  options: SelectOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  allowCustom?: boolean
  maxHeight?: number
  className?: string
}

export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  allowCustom = false,
  maxHeight = 240,
  className,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(
      o => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)
    )
  }, [options, search])

  // Group options
  const grouped = useMemo(() => {
    const groups: Record<string, SelectOption[]> = {}
    for (const opt of filtered) {
      const g = opt.group || ''
      if (!groups[g]) groups[g] = []
      groups[g].push(opt)
    }
    return groups
  }, [filtered])

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const addCustom = () => {
    const trimmed = search.trim()
    if (!trimmed || selected.includes(trimmed)) return
    // Check if it matches an existing option
    const existing = options.find(o => o.label.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      toggle(existing.value)
    } else {
      onChange([...selected, trimmed])
    }
    setSearch('')
  }

  const showAddCustom =
    allowCustom &&
    search.trim() &&
    !options.some(o => o.label.toLowerCase() === search.trim().toLowerCase()) &&
    !selected.includes(search.trim())

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 text-sm"
          >
            <span className="truncate text-muted-foreground">
              {selected.length === 0 ? placeholder : `${selected.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-7 h-8 text-sm"
                onKeyDown={e => {
                  if (e.key === 'Enter' && showAddCustom) {
                    e.preventDefault()
                    addCustom()
                  }
                }}
              />
            </div>
          </div>
          <ScrollArea style={{ maxHeight }} className="overflow-y-auto">
            <div className="p-1">
              {Object.entries(grouped).map(([group, opts]) => (
                <div key={group}>
                  {group && (
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group}
                    </div>
                  )}
                  {opts.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                    >
                      <Checkbox
                        checked={selected.includes(opt.value)}
                        className="pointer-events-none"
                      />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              ))}
              {filtered.length === 0 && !showAddCustom && (
                <p className="text-center text-sm text-muted-foreground py-4">No results</p>
              )}
              {showAddCustom && (
                <button
                  type="button"
                  onClick={addCustom}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add "{search.trim()}"</span>
                </button>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(val => {
            const opt = options.find(o => o.value === val)
            return (
              <Badge key={val} variant="secondary" className="gap-1 pr-1">
                {opt?.label || val}
                <button
                  type="button"
                  onClick={() => toggle(val)}
                  className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
