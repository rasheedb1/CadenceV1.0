import { cn } from '@/lib/utils'

interface ChipOption {
  value: string
  label: string
  description?: string
}

interface MultiSelectChipsProps {
  options: ChipOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
}

export function MultiSelectChips({
  options,
  selected,
  onChange,
  className,
}: MultiSelectChipsProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map(opt => {
        const isSelected = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            title={opt.description}
            className={cn(
              'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-transparent text-foreground hover:bg-muted'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
