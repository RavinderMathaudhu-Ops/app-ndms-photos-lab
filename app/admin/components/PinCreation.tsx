'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Loader2, AlertCircle } from 'lucide-react'

interface PinCreationProps {
  isEntraAuth: boolean
  storedToken: string
  onPinCreated: (pin: { id: string; pin: string; team_name: string }) => void
}

export default function PinCreation({ isEntraAuth, storedToken, onPinCreated }: PinCreationProps) {
  const [teamName, setTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const teamRef = useRef<HTMLInputElement>(null)

  const createPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setCreateError('')

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (!isEntraAuth) {
        headers['x-admin-token'] = storedToken
      }

      const res = await fetch('/api/auth/create-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamName: teamName.trim() || 'Team ' + Date.now() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create PIN')
      }

      const data = await res.json()
      onPinCreated(data)
      setTeamName('')
      teamRef.current?.focus()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl shadow-lg shadow-black/20 border border-white/10 bg-white/[0.07] backdrop-blur-sm overflow-hidden"
    >
      <div className="bg-white/[0.05] border-b border-white/10 px-5 py-3">
        <h2 className="font-display text-xl tracking-wide uppercase text-white flex items-center gap-3">
          <Plus className="w-5 h-5" />
          Create New PIN
        </h2>
        <p className="text-xs text-blue-200/50 mt-0.5">
          Generate access PINs for disaster response field teams
        </p>
      </div>

      <form onSubmit={createPin} className="px-5 py-4 space-y-3">
        <div className="space-y-2">
          <label htmlFor="teamName" className="text-sm font-semibold text-white/50">
            Team Name
          </label>
          <input
            ref={teamRef}
            id="teamName"
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g., Urban Search & Rescue, Medical Team 1"
            className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/10
              focus:border-white/30 focus:ring-2 focus:ring-white/10
              outline-none transition text-white placeholder:text-white/30 text-sm"
          />
          <p className="text-xs text-white/30">Leave blank for auto-generated name</p>
        </div>

        <AnimatePresence>
          {createError && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-red-400 text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              {createError}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ y: -1 }}
          whileTap={{ y: 0 }}
          className="w-full py-3 rounded-lg bg-white/90 backdrop-blur-sm text-[#062e61]
            font-semibold text-sm border border-white/30
            shadow-[0_0_15px_rgba(255,255,255,0.06)]
            flex items-center justify-center gap-2
            disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating PIN...
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              Generate PIN
            </>
          )}
        </motion.button>
      </form>
    </motion.div>
  )
}
