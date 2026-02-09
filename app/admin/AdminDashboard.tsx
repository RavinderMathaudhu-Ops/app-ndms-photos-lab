'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, Lock, Key, Shield, ChevronRight,
  AlertCircle, Loader2, ImageIcon, User,
} from 'lucide-react'
import PhotoGrid from './components/PhotoGrid'
import PinCreation from './components/PinCreation'
import ActivePins from './components/ActivePins'
import SessionManager from './components/SessionManager'
import { ToastProvider } from './components/Toast'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

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
  const [pins, setPins] = useState<PinEntry[]>([])
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)

  const tokenRef = useRef<HTMLInputElement>(null)

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

  /* ───── PIN Created callback ──────────────── */
  const handlePinCreated = (data: PinEntry) => {
    setPins((prev) => [data, ...prev])
    setJustCreated(data.id)
    setSessionRefreshKey((k) => k + 1)
    setTimeout(() => setJustCreated(null), 4000)
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
              {isEntraAuth && session?.user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3
                        hover:bg-white/[0.08] transition-colors focus:outline-none"
                    >
                      <Avatar size="default">
                        {session.user.image && (
                          <AvatarImage src={session.user.image} alt={session.user.name ?? ''} />
                        )}
                        <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">
                          {(session.user.name ?? '?')
                            .split(/[\s,]+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase())
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-white/80 font-medium hidden sm:block max-w-[160px] truncate">
                        {session.user.name}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex items-center gap-3 py-1">
                        <Avatar size="lg">
                          {session.user.image && (
                            <AvatarImage src={session.user.image} alt={session.user.name ?? ''} />
                          )}
                          <AvatarFallback className="bg-slate-200 text-slate-600 text-sm font-semibold">
                            {(session.user.name ?? '?')
                              .split(/[\s,]+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((w) => w[0]?.toUpperCase())
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{session.user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600 cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              )}
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
                    rounded-t transition-all
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
                  className="h-16 md:h-20 lg:h-24 mx-auto drop-shadow-[0_0_30px_rgba(21,81,151,0.5)]"
                />
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
                      bg-white/90 backdrop-blur-sm text-[#062e61] py-3.5 rounded
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
                    bg-white/[0.07] backdrop-blur-sm text-white/80 py-3.5 rounded
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
            <div className="max-w-7xl mx-auto w-full px-4 py-4 flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
              {/* Left column: Create PIN + Active PINs */}
              <div className="lg:w-[400px] xl:w-[440px] shrink-0 space-y-4 overflow-y-auto lg:max-h-full">
                <PinCreation
                  isEntraAuth={isEntraAuth}
                  storedToken={storedToken}
                  onPinCreated={handlePinCreated}
                />
                <ActivePins pins={pins} justCreated={justCreated} />
              </div>

              {/* Right column: Session History (own scrollable container) */}
              <div className="flex-1 min-h-0 flex flex-col min-w-0">
                <SessionManager
                  key={sessionRefreshKey}
                  isEntraAuth={isEntraAuth}
                  storedToken={storedToken}
                />
              </div>
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ToastProvider>
  )
}
