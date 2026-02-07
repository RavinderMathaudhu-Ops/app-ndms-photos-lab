'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const Icon = toast.type === 'success' ? CheckCircle2
    : toast.type === 'error' ? AlertCircle
    : Info

  const colorClass = toast.type === 'success'
    ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
    : toast.type === 'error'
    ? 'bg-red-500/20 border-red-400/30 text-red-300'
    : 'bg-blue-500/20 border-blue-400/30 text-blue-300'

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl
        border backdrop-blur-xl shadow-lg shadow-black/30 max-w-sm ${colorClass}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 rounded opacity-50 hover:opacity-100 transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}
