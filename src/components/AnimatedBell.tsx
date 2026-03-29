import { motion } from 'motion/react'
import { Bell } from 'lucide-react'

/**
 * Micro-animation #5: Bell icon that rings when there are unread notifications.
 */
interface AnimatedBellProps {
  hasUnread?: boolean
  className?: string
}

export function AnimatedBell({ hasUnread = false, className }: AnimatedBellProps) {
  return (
    <div className="relative">
      <motion.div
        animate={hasUnread ? { rotate: [0, 15, -15, 10, -10, 5, -5, 0] } : {}}
        transition={hasUnread ? { duration: 0.8, repeat: Infinity, repeatDelay: 4 } : {}}
      >
        <Bell className={className} />
      </motion.div>
      {hasUnread && (
        <motion.span
          className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  )
}
