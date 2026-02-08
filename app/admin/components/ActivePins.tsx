'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Key, Shield, CheckCircle2, Users, Clock,
} from 'lucide-react'

interface PinEntry {
  id: string
  pin: string
  team_name: string
}

interface ActivePinsProps {
  pins: PinEntry[]
  justCreated: string | null
}

const EASE_OUT = [0.25, 0.8, 0.25, 1] as const

const stagger = {
  animate: { transition: { staggerChildren: 0.04 } },
}

const cardPop = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT },
  },
}

export default function ActivePins({ pins, justCreated }: ActivePinsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyPin = async (pin: string, id: string) => {
    await navigator.clipboard.writeText(pin)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-wide uppercase text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-300/60" />
          Active PINs
        </h2>
        {pins.length > 0 && (
          <span className="text-xs font-semibold bg-white/10 text-white/60 px-3 py-1 rounded-full">
            {pins.length} PIN{pins.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Empty state */}
      {pins.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center py-6 gap-3"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center">
            <Key className="w-7 h-7 text-white/20" />
          </div>
          <p className="text-white/40 font-medium text-sm">No PINs created yet</p>
          <p className="text-xs text-white/25">Create a PIN above to get started</p>
        </motion.div>
      )}

      {/* PIN cards */}
      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-2">
        <AnimatePresence>
          {pins.map((pin) => (
            <motion.div
              key={pin.id}
              variants={cardPop}
              layout
              className={`rounded-2xl border overflow-hidden bg-white/[0.07] backdrop-blur-sm
                transition-all duration-500 shadow-lg shadow-black/20
                ${justCreated === pin.id
                  ? 'border-emerald-400/40 ring-2 ring-emerald-400/20'
                  : 'border-white/10'
                }`}
            >
              <div className="p-3 flex items-center gap-3">
                {/* PIN display */}
                <div className="relative">
                  <div className={`px-4 py-2.5 rounded-xl font-mono font-bold text-lg tracking-[0.2em]
                    transition-colors duration-500
                    ${justCreated === pin.id
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/10 text-white'
                    }`}>
                    {pin.pin}
                  </div>
                  {justCreated === pin.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500
                        flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    </motion.div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">
                    {pin.team_name}
                  </p>
                  <p className="text-xs text-white/40 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3 h-3" />
                    Expires in 48 hours
                  </p>
                </div>

                {/* Copy button */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => copyPin(pin.pin, pin.id)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all
                    ${copiedId === pin.id
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/10 text-white/40 hover:bg-white/20 hover:text-white'
                    }`}
                  title="Copy PIN to clipboard"
                >
                  {copiedId === pin.id ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring' as const, stiffness: 500, damping: 15 }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Security note */}
      {pins.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-400/20"
        >
          <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Share PINs with team members via a secure channel only. Each PIN provides
            upload access for 48 hours. PINs cannot be recovered after creation.
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}
