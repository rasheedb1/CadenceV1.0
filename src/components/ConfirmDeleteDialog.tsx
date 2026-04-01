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
import { motion, AnimatePresence, type Transition } from 'motion/react'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

// ─── Animation constants ──────────────────────────────────────────────────────

/**
 * Spring config: stiffness 400 + damping 30
 * → snappy, controlled, ~150ms perceived entry, no oscillation.
 * Damping ratio ≈ 0.95 (nearly critically damped) — intentional urgency signal
 * for a destructive confirmation dialog.
 */
const springTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
}

/**
 * Overlay uses a simple opacity tween — a spring backdrop would feel jarring.
 * Slightly faster than the content so it appears to "come from behind."
 */
const overlayTransition: Transition = {
  type: 'tween',
  duration: 0.15,
  ease: [0, 0, 0.4, 1], // equivalent to CSS cubic-bezier easeOut
}

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

  /** Label for the confirm button. @default "Delete" */
  confirmLabel?: string

  /** Label for the cancel button. @default "Cancel" */
  cancelLabel?: string

  /**
   * Called when the user confirms the action.
   * Can be async — the dialog will show a loading spinner while the promise is pending.
   * If the promise rejects, the dialog stays open (so the user can retry or cancel).
   */
  onConfirm: () => void | Promise<void>

  /**
   * If true, the dialog closes automatically after onConfirm resolves.
   * @default true
   */
  closeOnConfirm?: boolean

  /**
   * Show an additional warning callout below the description.
   * Useful for "this action cannot be undone" style notices.
   */
  warningText?: string

  /** Extra className applied to the dialog content panel */
  className?: string

  /**
   * Variant for the confirm button.
   * - "destructive" (default): red button — for delete / remove actions
   * - "warning": amber button — for soft destructive actions
   * @default "destructive"
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
    entityType ? `Delete ${entityType}?` : 'Are you sure?'
  )

  // Auto-generate description if not provided
  const resolvedDescription = description ?? (
    entityName
      ? `You are about to delete "${entityName}". This action cannot be undone.`
      : 'This action cannot be undone.'
  )

  const handleConfirm = useCallback(async (e: React.MouseEvent) => {
    // Guard against double-fire; prevent AlertDialog from auto-closing
    e.preventDefault()
    if (isLoading) return

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
  }, [onConfirm, closeOnConfirm, onOpenChange, isLoading])

  const handleOpenChange = useCallback((next: boolean) => {
    // Block closing while an async action is in flight
    if (isLoading) return
    onOpenChange(next)
  }, [isLoading, onOpenChange])

  const confirmButtonClass = cn(
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium',
    'h-9 px-4 py-2 transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    variant === 'destructive'
      ? 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
      : 'bg-amber-500 text-white shadow-sm hover:bg-amber-500/90'
  )

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {/*
       * We use AnimatePresence + forceMount so Motion controls enter/exit.
       * The portal renders overlay and content separately so we can animate
       * them with different transitions (tween overlay vs spring content).
       */}
      <AnimatePresence>
        {open && (
          <AlertDialogPrimitive.Portal forceMount>
            {/* ── Overlay: tween opacity only — spring would feel jarring ── */}
            <AlertDialogPrimitive.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/80"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
                aria-hidden="true"
              />
            </AlertDialogPrimitive.Overlay>

            {/* ── Content: spring entrance — stiffness:400, damping:30 ── */}
            <AlertDialogPrimitive.Content asChild aria-describedby={descriptionId}>
              <motion.div
                className={cn(
                  // Base layout — matches shadcn AlertDialogContent
                  'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%]',
                  'gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
                  'sm:max-w-[420px]',
                  className
                )}
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={springTransition}
              >
                {/* ── Header ── */}
                <AlertDialogHeader className="items-center gap-1">
                  {/* Icon ring */}
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-full',
                      variant === 'destructive'
                        ? 'bg-destructive/10'
                        : 'bg-amber-500/10'
                    )}
                    aria-hidden="true"
                  >
                    {variant === 'destructive' ? (
                      <Trash2 className="h-6 w-6 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-6 w-6 text-amber-500" />
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
                      'mt-1 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
                      'border',
                      variant === 'destructive'
                        ? 'border-destructive/20 bg-destructive/5 text-destructive'
                        : 'border-amber-500/20 bg-amber-500/5 text-amber-600'
                    )}
                    role="alert"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{warningText}</span>
                  </div>
                )}

                {/* ── Footer ── */}
                <AlertDialogFooter className="mt-2 flex-row justify-center gap-2 sm:justify-center">
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
                        <span>Deleting…</span>
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
              </motion.div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        )}
      </AnimatePresence>
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
