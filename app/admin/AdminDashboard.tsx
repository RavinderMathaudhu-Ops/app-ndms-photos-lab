'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Plus, LogOut, Lock, Key, Shield, CheckCircle2,
  AlertCircle, Loader2, Users, Clock, ChevronRight,
  ImageIcon,
} from 'lucide-react'
import PhotoGrid from './components/PhotoGrid'
import SessionManager from './components/SessionManager'
import { ToastProvider } from './components/Toast'

/* ─── Types ──────────────────────────────────────────── */
type Step = 'login' | 'dashboard'
type AdminTab = 'pins' | 'photos'

interface PinEntry {
  id: string
  pin: string
  team_name: string
}

/* ─── Animation Variants ─────────────────────────────── */
const EASE_OUT = [0.25, 0.8, 0.25, 1] as const
const EASE_IN = [0.4, 0, 1, 1] as const

const pageVariants = {
  enter: { x: '100%', y: 40, opacity: 0 },
  center: {
    x: 0,
    y: 0,
    opacity: 1,
    transition: { duration: 0.35, ease: EASE_OUT },
  },
  exit: { x: '-100%', opacity: 0, transition: { duration: 0.25, ease: EASE_IN } },
}

const stagger = {
  animate: { transition: { staggerChildren: 0.04 } },
}

const slideUp = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
}

const popIn = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.35, ease: EASE_OUT },
  },
}

const cardPop = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT },
  },
}

/* ─── Floating Particles ─────────────────────────────── */
function Particles() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 25 }, (_, i) => {
        const size = 2 + (i * 7) % 5
        return (
          <div
            key={i}
            className="absolute rounded-full bg-white/[0.06] animate-float"
            style={{
              width: size,
              height: size,
              left: `${(i * 41) % 100}%`,
              top: `${(i * 59) % 100}%`,
              animationDelay: `${(i * 0.35) % 10}s`,
              animationDuration: `${9 + (i * 0.5) % 7}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/* ─── Props ──────────────────────────────────────────── */
interface AdminDashboardProps {
  entraIdConfigured: boolean
}

/* ─── Main Admin Page ────────────────────────────────── */
export default function AdminDashboard({ entraIdConfigured }: AdminDashboardProps) {
  const { data: session, status } = useSession()

  const [step, setStep] = useState<Step>('login')
  const [adminToken, setAdminToken] = useState('')
  const [storedToken, setStoredToken] = useState('')
  const [error, setError] = useState('')

  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('pins')

  // Dashboard state
  const [teamName, setTeamName] = useState('')
  const [pins, setPins] = useState<PinEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)

  const tokenRef = useRef<HTMLInputElement>(null)
  const teamRef = useRef<HTMLInputElement>(null)

  // Auto-advance to dashboard when Entra ID session exists
  useEffect(() => {
    if (entraIdConfigured && status === 'authenticated' && session) {
      setStep('dashboard')
    }
  }, [entraIdConfigured, status, session])

  // Determine auth mode
  const isEntraAuth = entraIdConfigured && !!session

  useEffect(() => {
    if (step === 'login' && !entraIdConfigured) tokenRef.current?.focus()
    if (step === 'dashboard') teamRef.current?.focus()
  }, [step, entraIdConfigured])

  /* ───── Login ──────────────────────────────── */
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminToken.trim()) {
      setError('Admin token is required')
      return
    }
    setStoredToken(adminToken)
    setStep('dashboard')
    setError('')
    setAdminToken('')
  }

  /* ───── Create PIN ─────────────────────────── */
  const createPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setCreateError('')
    setJustCreated(null)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      // Only send x-admin-token when using fallback auth
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
      setPins((prev) => [data, ...prev])
      setJustCreated(data.id)
      setTeamName('')
      setSessionRefreshKey((k) => k + 1)
      teamRef.current?.focus()

      // Auto-clear highlight after 4 seconds
      setTimeout(() => setJustCreated(null), 4000)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create PIN')
    } finally {
      setLoading(false)
    }
  }

  /* ───── Copy PIN ───────────────────────────── */
  const copyPin = async (pin: string, id: string) => {
    await navigator.clipboard.writeText(pin)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  /* ───── Logout ─────────────────────────────── */
  const logout = () => {
    if (isEntraAuth) {
      signOut({ callbackUrl: '/admin' })
      return
    }
    setStoredToken('')
    setPins([])
    setStep('login')
  }

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */

  // Show loading state while Entra ID session is being checked
  if (entraIdConfigured && status === 'loading') {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#031a36] via-[#062e61] to-[#155197] flex items-center justify-center">
        <Particles />
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    )
  }

  return (
    <ToastProvider>
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#031a36] via-[#062e61] to-[#155197]">
      <Particles />

      {/* ─── Dashboard header with tabs ─── */}
      {step === 'dashboard' && (
        <motion.header
          initial={{ y: -80 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
          className="sticky top-0 z-50 bg-gradient-to-r from-[#062e61] to-[#155197] text-white shadow-2xl shadow-[#062e61]/30"
        >
          <div className="max-w-7xl mx-auto px-4">
            {/* Top row: logo + logout */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <img src="/aspr-logo-white.png" alt="ASPR" className="h-12 w-auto drop-shadow-[0_0_12px_rgba(21,81,151,0.4)]" />
                <div className="h-6 w-px bg-white/25" />
                <span className="font-display text-xl tracking-wide uppercase">Admin Portal</span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>

            {/* Tab navigation */}
            <div className="flex items-center gap-1 -mb-px">
              {([
                { key: 'pins' as AdminTab, label: 'PINs', icon: Key },
                { key: 'photos' as AdminTab, label: 'Photos', icon: ImageIcon },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-medium
                    rounded-t-xl transition-all
                    ${activeTab === key
                      ? 'text-white bg-white/[0.07]'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {activeTab === key && (
                    <motion.div
                      layoutId="admin-tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/80 rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </motion.header>
      )}

      <AnimatePresence mode="wait">
        {/* ═══ LOGIN STEP ═══ */}
        {step === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ x: '-100%', opacity: 0, transition: { duration: 0.25, ease: EASE_IN } }}
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            <motion.div
              variants={stagger}
              initial="initial"
              animate="animate"
              className="text-center space-y-6 w-full max-w-sm"
            >
              {/* HHS + ASPR logos */}
              <motion.div variants={slideUp}>
                <img
                  src="/hhs_longlogo_white.png"
                  alt="U.S. Department of Health and Human Services"
                  className="h-20 md:h-24 lg:h-28 mx-auto opacity-50"
                />
              </motion.div>

              <motion.div variants={popIn}>
                <img
                  src="/aspr-logo-white.png"
                  alt="ASPR"
                  className="h-20 md:h-24 lg:h-28 mx-auto drop-shadow-[0_0_30px_rgba(21,81,151,0.5)]"
                />
              </motion.div>

              {/* Icon */}
              <motion.div variants={popIn}>
                <div className="w-16 h-16 rounded-2xl bg-white/[0.07] backdrop-blur-sm border border-white/10 flex items-center justify-center mx-auto">
                  <Key className="w-7 h-7 text-blue-300/80" />
                </div>
              </motion.div>

              {/* Title */}
              <motion.div variants={slideUp} className="space-y-2">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-display text-white tracking-wide uppercase">
                  Admin Portal
                </h1>
                <p className="text-sm text-blue-200/50">
                  PIN management for field team access
                </p>
              </motion.div>

              {/* Login — SSO + token fallback */}
              {entraIdConfigured && (
                <motion.div variants={slideUp} className="space-y-4">
                  <motion.button
                    type="button"
                    onClick={() => signIn('microsoft-entra-id', { callbackUrl: '/admin' })}
                    whileHover={{ y: -1, boxShadow: '0 0 25px rgba(255,255,255,0.12)' }}
                    whileTap={{ y: 0 }}
                    className="w-full inline-flex items-center justify-center gap-2
                      bg-white/90 backdrop-blur-sm text-[#062e61] py-3.5 rounded-lg
                      font-semibold text-base border border-white/30
                      shadow-[0_0_15px_rgba(255,255,255,0.06)] transition-all"
                  >
                    <Shield className="w-5 h-5" />
                    Sign in with HHS Account
                  </motion.button>
                  <div className="flex items-center gap-3 text-blue-200/30 text-xs">
                    <div className="flex-1 h-px bg-blue-200/10" />
                    <span>or</span>
                    <div className="flex-1 h-px bg-blue-200/10" />
                  </div>
                </motion.div>
              )}

              <motion.form variants={slideUp} onSubmit={handleLogin} className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    ref={tokenRef}
                    type="password"
                    value={adminToken}
                    onChange={(e) => { setAdminToken(e.target.value); setError('') }}
                    placeholder="Enter admin token"
                    className="w-full pl-11 pr-4 py-3.5 rounded-lg bg-white/[0.07] backdrop-blur-sm
                      border border-white/15 text-white placeholder-white/30 outline-none
                      focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15 transition-all"
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 justify-center text-red-400 text-sm"
                    >
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  whileHover={{ y: -1, boxShadow: '0 0 25px rgba(255,255,255,0.12)' }}
                  whileTap={{ y: 0 }}
                  className="w-full inline-flex items-center justify-center gap-2
                    bg-white/[0.07] backdrop-blur-sm text-white/80 py-3.5 rounded-lg
                    font-semibold text-base border border-white/10
                    shadow-[0_0_15px_rgba(255,255,255,0.03)] transition-all
                    hover:bg-white/[0.12] hover:text-white"
                >
                  Authenticate with Token
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </motion.form>

              {/* Footer */}
              <motion.div variants={slideUp} className="pt-2 lg:pt-4 space-y-1 text-xs text-blue-300/25">
                <p className="font-semibold">Administration for Strategic Preparedness and Response</p>
                <p>U.S. Department of Health and Human Services</p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ DASHBOARD STEP ═══ */}
        {step === 'dashboard' && (
          <motion.div
            key="dashboard"
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="h-[calc(100vh-92px)] flex flex-col"
          >
            {/* ─── Photos tab ─── */}
            {activeTab === 'photos' && (
              <PhotoGrid isEntraAuth={isEntraAuth} storedToken={storedToken} />
            )}

            {/* ─── PINs tab ─── */}
            {activeTab === 'pins' && (
            <div className="max-w-4xl mx-auto w-full px-4 py-4 space-y-4 flex flex-col flex-1 min-h-0 overflow-auto">
              {/* ─── Create PIN section ─── */}
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

              {/* ─── Active PINs ─── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl tracking-wide uppercase text-white flex items-center gap-2">
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
                {pins.length === 0 && !loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center py-8 gap-3"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center">
                      <Key className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/40 font-medium">No PINs created yet</p>
                    <p className="text-xs text-white/25">Create a PIN above to get started</p>
                  </motion.div>
                )}

                {/* PIN cards */}
                <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-3">
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
                        <div className="p-4 flex items-center gap-4">
                          {/* PIN display */}
                          <div className="relative">
                            <div className={`px-5 py-3 rounded-xl font-mono font-bold text-xl tracking-[0.2em]
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
                            <p className="font-semibold text-white truncate">
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
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
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
                    className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-400/20"
                  >
                    <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200/80 leading-relaxed">
                      Share PINs with team members via a secure channel only. Each PIN provides
                      upload access for 48 hours. PINs cannot be recovered after creation.
                    </p>
                  </motion.div>
                )}
              </motion.div>

              {/* ─── Session History ─── */}
              <SessionManager
                key={sessionRefreshKey}
                isEntraAuth={isEntraAuth}
                storedToken={storedToken}
              />
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ToastProvider>
  )
}
