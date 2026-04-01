/**
 * ConfirmDeleteDialog — Reusable destructive action confirmation dialog
 *
 * Usage:
 *   <ConfirmDeleteDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Delete cadence"
 *     description='Are you sure you want to delete "Q4 Outreach"? This action cannot be undone.'
 *     onConfirm={handleDelete}
 *   />
 *
 * With entity name (shows formatted confirmation):
 *   <ConfirmDeleteDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     entityName="Q4 Outreach"
 *     entityType="cadence"
 *     onConfirm={handleDelete}
 *   />
 *
 * With custom confirm label and loading state:
 *   <ConfirmDeleteDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Remove lead from cadence"
 *     description="This lead will be removed and all scheduled sends cancelled."
 *     confirmLabel="Remove"
 *     onConfirm={handleRemove}
 *   />
 */

import { useState, useCallback, useId } from 'react'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmDeleteDialogProps {
  /** Controlled open state */
  open: boolean
  /** Called when the dialog requests open/close */
  onOpenChange: (open: boolean) => void

  /**
   * Dialog title. Defaults to "Delete [entityType]?" if entityType is provided,
   * otherwise "Are you sure?"
   */
  title?: string

  /**
   * Dialog body text. If not provided and entityName is given, a default
   * description is generated automatically.
   */
  description?: string

  /**
   * The name of the entity being deleted (e.g. "Q4 Outreach").
   * Used to auto-generate title and description when those props are omitted.
   */
  entityName?: string

  /**
   * Human-readable entity type (e.g. "cadence", "lead", "template").
   * Used in the auto-generated title.
   */
  entityType?: string

  /** Label for the confirm button. Defaults to "Delete". */
  confirmLabel?: string

  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string

  /**
   * Called when the user confirms the action.
   * Can be async — the dialog will show a loading spinner while the promise is pending.
   * If the promise rejects, the dialog stays open (so the user can retry or cancel).
   */
  onConfirm: () => void | Promise<void>

  /**
   * Optional: if true, the dialog will close automatically after onConfirm resolves.
   * Defaults to true.
   */
  closeOnConfirm?: boolean

  /**
   * Show an additional warning below the description.
   * Useful for "this action cannot be undone" style notices.
   */
  warningText?: string

  /** Extra className applied to the dialog content panel */
  className?: string

  /**
   * Variant for the confirm button.
   * - "destructive" (default): red button — for delete / remove actions
   * - "warning": amber button — for soft destructive actions
   */
  variant?: 'destructive' | 'warning'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  entityName,
  entityType,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  closeOnConfirm = true,
  warningText,
  className,
  variant = 'destructive',
}: ConfirmDeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const descriptionId = useId()

  // Auto-generate title if not provided
  const resolvedTitle = title ?? (
    entityType
      ? `Delete ${entityType}?`
      : 'Are you sure?'
  )

  // Auto-generate description if not provided
  const resolvedDescription = description ?? (
    entityName
      ? `You are about to delete "${entityName}". This action cannot be undone.`
      : 'This action cannot be undone.'
  )

  const handleConfirm = useCallback(async (e: React.MouseEvent) => {
    // Prevent AlertDialog from auto-closing via its default behavior
    e.preventDefault()

    setIsLoading(true)
    try {
      await onConfirm()
      if (closeOnConfirm) {
        onOpenChange(false)
      }
    } catch (err) {
      // Keep dialog open on error — caller is responsible for showing a toast
      console.error('[ConfirmDeleteDialog] onConfirm threw:', err)
    } finally {
      setIsLoading(false)
    }
  }, [onConfirm, closeOnConfirm, onOpenChange])

  const handleOpenChange = useCallback((next: boolean) => {
    // Block closing while an async action is in flight
    if (isLoading) return
    onOpenChange(next)
  }, [isLoading, onOpenChange])

  const confirmButtonClass = cn(
    // Base: override AlertDialogAction default (which uses buttonVariants())
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium',
    'h-9 px-4 py-2 transition-colors',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    variant === 'destructive'
      ? 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
      : 'bg-warning text-white shadow-sm hover:bg-warning/90'
  )

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className={cn('sm:max-w-[420px]', className)}
        aria-describedby={descriptionId}
      >
        {/* ── Header ── */}
        <AlertDialogHeader>
          {/* Icon row */}
          <div
            className={cn(
              'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full',
              variant === 'destructive'
                ? 'bg-destructive/10'
                : 'bg-warning/10'
            )}
            aria-hidden="true"
          >
            {variant === 'destructive' ? (
              <Trash2
                className={cn(
                  'h-6 w-6',
                  'text-destructive'
                )}
              />
            ) : (
              <AlertTriangle
                className={cn(
                  'h-6 w-6',
                  'text-warning'
                )}
              />
            )}
          </div>

          <AlertDialogTitle className="text-center sm:text-center">
            {resolvedTitle}
          </AlertDialogTitle>

          <AlertDialogDescription
            id={descriptionId}
            className="text-center sm:text-center"
          >
            {resolvedDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* ── Optional warning callout ── */}
        {warningText && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
              'border',
              variant === 'destructive'
                ? 'border-destructive/20 bg-destructive/5 text-destructive'
                : 'border-warning/20 bg-warning/5 text-warning'
            )}
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{warningText}</span>
          </div>
        )}

        {/* ── Footer ── */}
        <AlertDialogFooter className="flex-row justify-center gap-2 sm:justify-center">
          {/* Cancel — disabled while loading */}
          <AlertDialogCancel
            disabled={isLoading}
            className="flex-1 sm:flex-none sm:min-w-[100px]"
          >
            {cancelLabel}
          </AlertDialogCancel>

          {/* Confirm — shows spinner while async action runs */}
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(confirmButtonClass, 'flex-1 sm:flex-none sm:min-w-[100px]')}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                {variant === 'destructive' && (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{confirmLabel}</span>
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Convenience hook ─────────────────────────────────────────────────────────

/**
 * useConfirmDelete — zero-boilerplate hook for delete confirmation.
 *
 * @example
 * const { dialogProps, open: openConfirm } = useConfirmDelete({
 *   entityType: 'cadence',
 *   onConfirm: (id) => deleteCadence(id),
 * })
 *
 * <button onClick={() => openConfirm('cadence-id-123', 'Q4 Outreach')}>
 *   Delete
 * </button>
 *
 * <ConfirmDeleteDialog {...dialogProps} />
 */
export function useConfirmDelete<T = string>({
  entityType,
  onConfirm,
  confirmLabel,
  warningText,
}: {
  entityType?: string
  onConfirm: (payload: T) => void | Promise<void>
  confirmLabel?: string
  warningText?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [entityName, setEntityName] = useState<string | undefined>(undefined)
  const [pendingPayload, setPendingPayload] = useState<T | null>(null)

  const open = useCallback((payload: T, name?: string) => {
    setPendingPayload(payload)
    setEntityName(name)
    setIsOpen(true)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (pendingPayload !== null) {
      await onConfirm(pendingPayload)
    }
  }, [pendingPayload, onConfirm])

  const dialogProps: ConfirmDeleteDialogProps = {
    open: isOpen,
    onOpenChange: setIsOpen,
    entityName,
    entityType,
    onConfirm: handleConfirm,
    confirmLabel,
    warningText,
  }

  return { dialogProps, open }
}
