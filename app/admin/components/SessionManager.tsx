'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Clock, Camera, HardDrive, Shield, ShieldOff,
  RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle,
  RotateCcw, Search, X,
} from 'lucide-react'

interface Session {
  id: string
  team_name: string
  expires_at: string
  created_at: string
  status: 'active' | 'expired' | 'revoked'
  photo_count: number
  total_size: number
}

interface SessionManagerProps {
  isEntraAuth: boolean
  storedToken: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const absDiff = Math.abs(diff)

  const minutes = Math.floor(absDiff / (1000 * 60))
  const hours = Math.floor(absDiff / (1000 * 60 * 60))
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24))

  if (diff > 0) {
    if (hours < 1) return `${minutes}m remaining`
    if (hours < 48) return `${hours}h remaining`
    return `${days}d remaining`
  } else {
    if (hours < 1) return `${minutes}m ago`
    if (hours < 48) return `${hours}h ago`
    return `${days}d ago`
  }
}

const statusConfig = {
  active: {
    label: 'Active',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: CheckCircle2,
  },
  expired: {
    label: 'Expired',
    color: 'bg-white/10 text-white/40 border-white/10',
    icon: Clock,
  },
  revoked: {
    label: 'Revoked',
    color: 'bg-red-500/20 text-red-300 border-red-500/30',
    icon: XCircle,
  },
}

export default function SessionManager({ isEntraAuth, storedToken }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!isEntraAuth) h['x-admin-token'] = storedToken
    return h
  }, [isEntraAuth, storedToken])

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/sessions', { headers: headers() })
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = await res.json()
      setSessions(data.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleAction = async (sessionId: string, action: 'revoke' | 'reactivate') => {
    setActionLoading(sessionId)
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error('Action failed')
      await fetchSessions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  // Apply status filter + search query
  const filtered = sessions
    .filter(s => filter === 'all' || s.status === filter)
    .filter(s => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        s.team_name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        new Date(s.created_at).toLocaleDateString().includes(q)
      )
    })

  const counts = {
    all: sessions.length,
    active: sessions.filter(s => s.status === 'active').length,
    expired: sessions.filter(s => s.status === 'expired').length,
    revoked: sessions.filter(s => s.status === 'revoked').length,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-3xl shadow-lg shadow-black/20 border border-white/10 bg-white/[0.07] backdrop-blur-sm overflow-hidden flex flex-col min-h-0 flex-1"
    >
      {/* Header */}
      <div className="bg-white/[0.05] border-b border-white/10 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg tracking-wide uppercase text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-300/60" />
            Session History
            {sessions.length > 0 && (
              <span className="text-xs font-semibold bg-white/10 text-white/50 px-2.5 py-0.5 rounded-full ml-1">
                {sessions.length}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={fetchSessions}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="px-4 py-3 space-y-2 border-b border-white/5 shrink-0">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions by team name..."
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-white/10 bg-white/[0.06]
              focus:border-white/25 focus:ring-1 focus:ring-white/10
              outline-none transition text-white placeholder:text-white/25 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
          {(['all', 'active', 'expired', 'revoked'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all
                ${filter === f
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/35 hover:text-white/60'
                }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pt-2 shrink-0"
          >
            <p className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable session list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2"
      >
        {/* Loading */}
        {loading && sessions.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/40 font-medium text-sm">
              {searchQuery
                ? `No sessions matching "${searchQuery}"`
                : filter === 'all'
                  ? 'No sessions yet'
                  : `No ${filter} sessions`
              }
            </p>
          </div>
        )}

        {/* Session cards */}
        <AnimatePresence>
          {filtered.map((session) => {
            const config = statusConfig[session.status]
            const StatusIcon = config.icon

            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                layout
                className="rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-sm overflow-hidden"
              >
                <div className="p-3 flex items-center gap-3">
                  {/* Status indicator */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${config.color}`}>
                    <StatusIcon className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm truncate">
                        {session.team_name}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${config.color}`}>
                        {config.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-white/35">
                      <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {session.photo_count} photo{session.photo_count !== 1 ? 's' : ''}
                      </span>
                      {session.total_size > 0 && (
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {formatBytes(session.total_size)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {session.status === 'active'
                          ? formatRelativeTime(session.expires_at)
                          : session.status === 'expired'
                            ? 'Expired ' + formatRelativeTime(session.expires_at)
                            : 'Revoked'
                        }
                      </span>
                    </div>

                    <p className="text-[10px] text-white/20 mt-0.5">
                      Created {new Date(session.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {/* Action button */}
                  {session.status === 'active' && (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAction(session.id, 'revoke')}
                      disabled={actionLoading === session.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                        bg-red-500/10 text-red-300 border border-red-500/20
                        hover:bg-red-500/20 transition disabled:opacity-50 shrink-0"
                      title="Revoke this session"
                    >
                      {actionLoading === session.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldOff className="w-3.5 h-3.5" />
                      )}
                      Revoke
                    </motion.button>
                  )}

                  {session.status === 'revoked' && (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAction(session.id, 'reactivate')}
                      disabled={actionLoading === session.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                        bg-emerald-500/10 text-emerald-300 border border-emerald-500/20
                        hover:bg-emerald-500/20 transition disabled:opacity-50 shrink-0"
                      title="Reactivate this session"
                    >
                      {actionLoading === session.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Reactivate
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Summary footer */}
      {sessions.length > 0 && (
        <div className="border-t border-white/5 px-4 py-2.5 shrink-0">
          <div className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-blue-300/30 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-200/30 leading-relaxed">
              PINs are stored as secure hashes. Revoking a session immediately prevents uploads.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
