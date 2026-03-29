import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Plus, Workflow, Users, Bot, X } from 'lucide-react'

/**
 * Micro-animation #4: Floating action button with radial menu expansion.
 */

const ACTIONS = [
  { icon: Workflow, label: 'Nueva Cadencia', href: '/cadences', color: '#EC4899' },
  { icon: Users, label: 'Importar Leads', href: '/leads', color: '#F59E0B' },
  { icon: Bot, label: 'Crear Agente', href: '/agents', color: '#A855F7' },
]

export function FloatingActionButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-3">
      {/* Sub-actions */}
      <AnimatePresence>
        {open &&
          ACTIONS.map((action, i) => (
            <motion.button
              key={action.label}
              className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg cursor-pointer border-0"
              style={{ backgroundColor: action.color }}
              initial={{ opacity: 0, scale: 0, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0, y: 20 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 22 }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { setOpen(false); navigate(action.href) }}
              title={action.label}
            >
              <action.icon className="h-5 w-5" />
            </motion.button>
          ))}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl cursor-pointer border-0"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Cerrar menú' : 'Abrir acciones rápidas'}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </motion.button>
    </div>
  )
}
