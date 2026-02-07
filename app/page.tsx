'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, MapPin, LogOut, Shield, ChevronRight,
  Upload, CheckCircle2, X, Loader2,
  AlertCircle, ImagePlus, Send, RotateCcw, Locate,
  Image as ImageIcon,
} from 'lucide-react'

/* ─── Types ──────────────────────────────────────────── */
type Step = 'welcome' | 'pin' | 'photos' | 'metadata' | 'uploading' | 'success'

interface PhotoFile {
  file: File
  preview: string
  id: string
}

const STEP_ORDER: Step[] = ['welcome', 'pin', 'photos', 'metadata', 'uploading', 'success']

/* ─── Animation Variants ─────────────────────────────── */
const EASE_OUT = [0.25, 0.8, 0.25, 1] as const
const EASE_IN = [0.4, 0, 1, 1] as const

const pageVariants = {
  enter: (d: number) => ({
    x: d > 0 ? '100%' : '-100%',
    y: d > 0 ? 40 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    y: 0,
    opacity: 1,
    transition: { duration: 0.35, ease: EASE_OUT },
  },
  exit: (d: number) => ({
    x: d < 0 ? '100%' : '-100%',
    y: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: EASE_IN },
  }),
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
function Particles({ muted = false }: { muted?: boolean }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return null

  const count = muted ? 18 : 35
  const opacity = muted ? 'bg-white/[0.04]' : 'bg-white/[0.07]'

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none z-[1] transition-opacity duration-1000 ${muted ? 'opacity-60' : 'opacity-100'}`}>
      {Array.from({ length: count }, (_, i) => {
        const size = 2 + (i * 7) % 6
        return (
          <div
            key={i}
            className={`absolute rounded-full ${opacity} animate-float`}
            style={{
              width: size,
              height: size,
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              animationDelay: `${(i * 0.3) % 10}s`,
              animationDuration: `${8 + (i * 0.4) % 8}s`,
            }}
          />
        )
      })}
    </div>
  )
}

/* ─── Step Dots ──────────────────────────────────────── */
function StepDots({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current)
  return (
    <div className="flex gap-2 justify-center">
      {STEP_ORDER.map((s, i) => (
        <motion.div
          key={s}
          layout
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i === idx
              ? 'bg-white w-8'
              : i < idx
                ? 'bg-white/50 w-2'
                : 'bg-white/15 w-2'
          }`}
        />
      ))}
    </div>
  )
}

/* ─── Main Wizard ────────────────────────────────────── */
export default function PhotoUploadWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [direction, setDirection] = useState(1)

  // Auth state
  const [pin, setPin] = useState<string[]>(Array(6).fill(''))
  const [token, setToken] = useState('')
  const [teamName, setTeamName] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [pinValid, setPinValid] = useState(false)

  // Photos
  const [photos, setPhotos] = useState<PhotoFile[]>([])
  const [dragOver, setDragOver] = useState(false)

  // Metadata
  const [notes, setNotes] = useState('')
  const [incidentId, setIncidentId] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationName, setLocationName] = useState('')
  const [locating, setLocating] = useState(false)

  // Upload
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [lastBatchSize, setLastBatchSize] = useState(0)

  // Refs
  const pinRefs = useRef<(HTMLInputElement | null)[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Restore session
  useEffect(() => {
    const t = sessionStorage.getItem('aspr_token')
    const team = sessionStorage.getItem('aspr_team')
    if (t) {
      setToken(t)
      setTeamName(team || 'Anonymous')
      setStep('photos')
    }
  }, [])

  const goTo = useCallback(
    (next: Step) => {
      setDirection(STEP_ORDER.indexOf(next) > STEP_ORDER.indexOf(step) ? 1 : -1)
      setStep(next)
    },
    [step],
  )

  /* ───── PIN logic ──────────────────────────── */
  const handlePinInput = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...pin]
    next[i] = val.slice(-1)
    setPin(next)
    setAuthError('')
    if (val && i < 5) pinRefs.current[i + 1]?.focus()
    if (val && i === 5 && next.every(Boolean)) submitPin(next.join(''))
  }

  const handlePinKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) pinRefs.current[i - 1]?.focus()
  }

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (p.length === 6) {
      setPin(p.split(''))
      pinRefs.current[5]?.focus()
      submitPin(p)
    }
  }

  const submitPin = async (pinStr: string) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/auth/validate-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinStr }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Invalid PIN')
      }
      const { token: t, sessionId, teamName: team } = await res.json()
      sessionStorage.setItem('aspr_token', t)
      sessionStorage.setItem('aspr_session_id', sessionId)
      sessionStorage.setItem('aspr_team', team)
      setToken(t)
      setTeamName(team)
      setPinValid(true)
      setTimeout(() => goTo('photos'), 900)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Verification failed')
      setPin(Array(6).fill(''))
      setTimeout(() => pinRefs.current[0]?.focus(), 120)
    } finally {
      setAuthLoading(false)
    }
  }

  /* ───── Photo logic ────────────────────────── */
  const addPhotos = useCallback((files: FileList | File[]) => {
    const arr: PhotoFile[] = []
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith('image/') || f.size > 50 * 1024 * 1024) return
      arr.push({
        file: f,
        preview: URL.createObjectURL(f),
        id: Math.random().toString(36).slice(2, 11),
      })
    })
    setPhotos((prev) => [...prev, ...arr])
  }, [])

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const r = prev.find((p) => p.id === id)
      if (r) URL.revokeObjectURL(r.preview)
      return prev.filter((p) => p.id !== id)
    })
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files) addPhotos(e.dataTransfer.files)
    },
    [addPhotos],
  )

  /* ───── Location ───────────────────────────── */
  const [gpsError, setGpsError] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [zipLooking, setZipLooking] = useState(false)

  const getLocation = () => {
    setGpsError('')
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device. Use ZIP code instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationName(
          `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        )
        setLocating(false)
        setGpsError('')
      },
      (err) => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Location access denied. Enable in browser settings or use ZIP code.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError('Location unavailable. Use ZIP code instead.')
        } else {
          setGpsError('Location timed out. Use ZIP code instead.')
        }
      },
      { timeout: 10000 },
    )
  }

  const lookupZip = async () => {
    const cleaned = zipCode.replace(/\s/g, '').slice(0, 5)
    if (!/^\d{5}$/.test(cleaned)) {
      setGpsError('Enter a valid 5-digit ZIP code')
      return
    }
    setZipLooking(true)
    setGpsError('')
    try {
      const res = await fetch(
        `https://api.zippopotam.us/us/${cleaned}`
      )
      if (!res.ok) throw new Error('ZIP not found')
      const data = await res.json()
      const place = data.places?.[0]
      if (!place) throw new Error('ZIP not found')
      const lat = parseFloat(place.latitude)
      const lng = parseFloat(place.longitude)
      setLocation({ lat, lng })
      setLocationName(`${place['place name']}, ${place['state abbreviation']} ${cleaned}`)
      setGpsError('')
    } catch {
      setGpsError('ZIP code not found. Check and try again.')
    } finally {
      setZipLooking(false)
    }
  }

  /* ───── Upload ─────────────────────────────── */
  const handleUpload = async () => {
    setLastBatchSize(photos.length)
    goTo('uploading')
    setUploadProgress(0)
    setUploadedCount(0)
    setUploadError('')

    try {
      for (let i = 0; i < photos.length; i++) {
        const fd = new FormData()
        fd.append('photo', photos[i].file)
        if (notes) fd.append('notes', notes)
        if (incidentId) fd.append('incidentId', incidentId)
        if (location) {
          fd.append('latitude', location.lat.toString())
          fd.append('longitude', location.lng.toString())
        }
        if (locationName) fd.append('locationName', locationName)

        const res = await fetch('/api/photos/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error || `Failed: ${photos[i].file.name}`)
        }
        setUploadedCount(i + 1)
        setUploadProgress(Math.round(((i + 1) / photos.length) * 100))
      }

      photos.forEach((p) => URL.revokeObjectURL(p.preview))
      setTimeout(() => goTo('success'), 600)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const resetForMore = () => {
    setPhotos([])
    setNotes('')
    setIncidentId('')
    setLocation(null)
    setLocationName('')
    setUploadProgress(0)
    setUploadedCount(0)
    setUploadError('')
    goTo('photos')
  }

  const logout = () => {
    sessionStorage.clear()
    setToken('')
    setTeamName('')
    setPin(Array(6).fill(''))
    setPinValid(false)
    goTo('welcome')
  }

  /* ───── Derived ────────────────────────────── */
  const isDark = true
  const RING_R = 52
  const RING_CIRC = 2 * Math.PI * RING_R

  /* ─── Background image per step ───────────────────── */
  const showHeroField = step === 'welcome' || step === 'success'
  const showHeroCollage = step === 'pin'

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  return (
    <div
      className="min-h-screen relative overflow-hidden bg-[#031a36]"
    >
      {/* ─── Background layers ─── */}
      <div className="absolute inset-0 z-0">
        {/* Base gradient (always visible underneath) */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#031a36] via-[#062e61] to-[#155197]" />

        {/* Hero field image — welcome + success */}
        <div className={`absolute inset-0 transition-opacity duration-[1200ms] ease-in-out ${showHeroField ? 'opacity-100' : 'opacity-0'}`}>
          <img
            src="/hero-field.png"
            alt=""
            className="w-full h-full object-cover animate-ken-burns"
          />
          <div className={`absolute inset-0 transition-all duration-[1200ms] ${
            step === 'success'
              ? 'bg-gradient-to-b from-[#031a36]/70 via-emerald-950/60 to-[#062e61]'
              : 'bg-gradient-to-b from-[#031a36]/40 via-[#062e61]/60 to-[#062e61]'
          }`} />
          <div className="absolute inset-0 hero-vignette" />
        </div>

        {/* Hero collage — PIN step */}
        <div className={`absolute inset-0 transition-opacity duration-[1200ms] ease-in-out ${showHeroCollage ? 'opacity-100' : 'opacity-0'}`}>
          <img
            src="/hero-collage.png"
            alt=""
            className="w-full h-full object-cover animate-ken-burns-delayed"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#031a36]/60 via-[#062e61]/75 to-[#062e61]" />
          <div className="absolute inset-0 hero-vignette" />
        </div>
      </div>

      {isDark && <Particles muted={showHeroField || showHeroCollage} />}

      {/* ─── Branded header (light steps) ─── */}
      {(step === 'photos' || step === 'metadata') && (
        <motion.header
          initial={{ y: -64 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="sticky top-0 z-50 bg-gradient-to-r from-[#062e61] to-[#155197] text-white px-4 py-3 shadow-2xl shadow-[#062e61]/30"
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/aspr-logo-white.png" alt="ASPR" className="h-8 w-auto" />
              <div className="h-5 w-px bg-white/25" />
              <span className="text-sm font-medium text-white/70">Team: {teamName}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/gallery')}
                className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition"
              >
                <ImageIcon className="w-4 h-4" /> Gallery
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </motion.header>
      )}

      {/* ─── Step content ─── */}
      <AnimatePresence mode="wait" custom={direction}>
        {/* ═══ WELCOME ═══ */}
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            custom={direction}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ x: '-100%', opacity: 0, transition: { duration: 0.25, ease: EASE_IN } }}
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            <motion.div
              variants={stagger}
              initial="initial"
              animate="animate"
              className="text-center space-y-6 lg:space-y-8"
            >
              {/* HHS */}
              <motion.div variants={slideUp}>
                <img
                  src="/hhs_longlogo_white.png"
                  alt="U.S. Department of Health and Human Services"
                  className="h-16 md:h-20 lg:h-28 mx-auto opacity-60"
                />
              </motion.div>

              {/* ASPR logo */}
              <motion.div variants={popIn}>
                <img
                  src="/aspr-logo-white.png"
                  alt="ASPR"
                  className="h-16 md:h-20 lg:h-24 mx-auto drop-shadow-[0_0_40px_rgba(21,81,151,0.6)]"
                />
              </motion.div>

              {/* Title */}
              <motion.div variants={slideUp} className="space-y-2">
                <h1 className="text-4xl md:text-5xl lg:text-7xl font-display text-white tracking-wide leading-tight uppercase">
                  Photo Repository
                </h1>
                <p className="text-base md:text-lg lg:text-xl text-blue-200/60 max-w-lg mx-auto leading-relaxed">
                  Secure photo upload for disaster response and emergency documentation
                </p>
              </motion.div>

              {/* CTA */}
              <motion.div variants={slideUp}>
                <motion.button
                  onClick={() => goTo('pin')}
                  whileHover={{ y: -2, boxShadow: '0 0 30px rgba(255,255,255,0.15)' }}
                  whileTap={{ y: 0 }}
                  className="inline-flex items-center gap-2.5 bg-white/90 backdrop-blur-sm text-[#062e61]
                    px-7 py-3.5 rounded-lg font-semibold text-base
                    border border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.08)] transition-all"
                >
                  Get Started
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </motion.div>

              {/* Footer */}
              <motion.div variants={slideUp} className="pt-2 lg:pt-6 space-y-1 text-xs text-blue-300/30">
                <p className="font-semibold">
                  Administration for Strategic Preparedness and Response
                </p>
                <p>U.S. Department of Health and Human Services</p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ PIN ═══ */}
        {step === 'pin' && (
          <motion.div
            key="pin"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            <motion.div
              variants={stagger}
              initial="initial"
              animate="animate"
              className="text-center space-y-6 w-full max-w-sm"
            >
              {/* Back */}
              <motion.button
                variants={slideUp}
                onClick={() => goTo('welcome')}
                className="text-blue-300/50 hover:text-white transition text-sm"
              >
                &larr; Back
              </motion.button>

              {/* Icon / Success checkmark */}
              <motion.div variants={popIn}>
                {pinValid ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                  >
                    <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]" />
                  </motion.div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.07] backdrop-blur-sm border border-white/10 flex items-center justify-center mx-auto">
                    <Shield className="w-7 h-7 text-blue-300/80" />
                  </div>
                )}
              </motion.div>

              {/* Title */}
              <motion.div variants={slideUp} className="space-y-2">
                <h2 className="text-3xl md:text-4xl font-display text-white tracking-wide uppercase">
                  {pinValid ? `Welcome, ${teamName}` : 'Enter Access PIN'}
                </h2>
                {!pinValid && (
                  <p className="text-sm text-blue-200/50">
                    6-digit code from your incident commander
                  </p>
                )}
              </motion.div>

              {/* PIN boxes */}
              {!pinValid && (
                <motion.div
                  variants={slideUp}
                  className="flex gap-3 justify-center"
                  onPaste={handlePinPaste}
                >
                  {pin.map((digit, i) => (
                    <motion.input
                      key={i}
                      ref={(el) => {
                        pinRefs.current[i] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinInput(i, e.target.value)}
                      onKeyDown={(e) => handlePinKey(i, e)}
                      animate={authError ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                      transition={{ duration: 0.4 }}
                      disabled={authLoading}
                      autoFocus={i === 0}
                      className={`w-12 h-16 rounded-lg text-center text-2xl font-bold
                        bg-white/[0.07] backdrop-blur-sm border text-white outline-none
                        transition-all duration-200
                        ${digit ? 'border-blue-400/60 bg-blue-400/10' : 'border-white/15'}
                        focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15
                        disabled:opacity-50`}
                    />
                  ))}
                </motion.div>
              )}

              {/* Error */}
              <AnimatePresence>
                {authError && (
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 justify-center text-red-400 text-sm"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {authError}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Loading */}
              {authLoading && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 justify-center text-blue-300/80"
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying&hellip;
                </motion.p>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* ═══ PHOTOS ═══ */}
        {step === 'photos' && (
          <motion.div
            key="photos"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="h-[calc(100vh-56px)] flex flex-col"
          >
            <div className="max-w-2xl mx-auto w-full px-4 py-4 flex flex-col flex-1 min-h-0">
              {/* Drop zone + camera — compact row */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 flex-shrink-0"
              >
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`flex-1 cursor-pointer rounded-2xl border-2 border-dashed
                    flex items-center gap-4 px-5 py-4 transition-all duration-300 ${
                      dragOver
                        ? 'border-blue-400 bg-blue-400/10 scale-[1.01]'
                        : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                    }`}
                >
                  <motion.div
                    animate={dragOver ? { scale: 1.15, rotate: 8 } : { scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    className="w-10 h-10 rounded-xl bg-white/[0.07] border border-white/10
                      flex items-center justify-center flex-shrink-0"
                  >
                    <ImagePlus className="w-5 h-5 text-white/40" />
                  </motion.div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {dragOver ? 'Drop here' : 'Select photos'}
                    </p>
                    <p className="text-[11px] text-white/40 truncate">
                      Drag &amp; drop &bull; JPG, PNG &bull; 50 MB max
                    </p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="Select photos to upload"
                    onChange={(e) => {
                      if (e.target.files) addPhotos(e.target.files)
                      e.target.value = ''
                    }}
                    className="hidden"
                  />
                </div>

                {/* Camera button — compact square */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*'
                    input.capture = 'environment'
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files
                      if (files) addPhotos(files)
                    }
                    input.click()
                  }}
                  className="w-[68px] rounded-2xl bg-white/[0.07] border border-white/10
                    flex flex-col items-center justify-center gap-1
                    hover:bg-white/[0.12] transition flex-shrink-0"
                >
                  <Camera className="w-5 h-5 text-white/60" />
                  <span className="text-[10px] text-white/40 font-medium">Camera</span>
                </motion.button>
              </motion.div>

              {/* Photo grid — scrollable area */}
              <div className="flex-1 min-h-0 mt-3 overflow-auto">
                <AnimatePresence>
                  {photos.length > 0 ? (
                    <motion.div
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                          {photos.length} photo{photos.length !== 1 ? 's' : ''} selected
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            photos.forEach((p) => URL.revokeObjectURL(p.preview))
                            setPhotos([])
                          }}
                          className="text-[11px] text-red-400/60 hover:text-red-300 transition font-medium"
                        >
                          Clear all
                        </button>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        <AnimatePresence>
                          {photos.map((photo, i) => (
                            <motion.div
                              key={photo.id}
                              layout
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{
                                delay: i * 0.03,
                                type: 'spring',
                                stiffness: 400,
                                damping: 22,
                              }}
                              className="relative aspect-square rounded-xl overflow-hidden group
                                shadow-md shadow-black/20 ring-1 ring-white/10"
                            >
                              <img
                                src={photo.preview}
                                alt={photo.file.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent
                                opacity-0 group-hover:opacity-100 transition-opacity" />
                              <motion.button
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.85 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removePhoto(photo.id)
                                }}
                                className="absolute top-1 right-1 w-6 h-6 rounded-full
                                  bg-black/60 text-white flex items-center justify-center
                                  opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                              >
                                <X className="w-3 h-3" />
                              </motion.button>
                              <div className="absolute bottom-0 inset-x-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[9px] text-white/90 truncate bg-black/40 backdrop-blur-sm rounded px-1 py-0.5">
                                  {photo.file.name}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-col items-center justify-center h-full gap-3"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06]
                        flex items-center justify-center"
                      >
                        <Upload className="w-7 h-7 text-white/15" />
                      </div>
                      <p className="text-sm text-white/25">Select or capture photos above</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sticky bottom bar — slides up when photos selected */}
              <AnimatePresence>
                {photos.length > 0 && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className="flex-shrink-0 pt-3 pb-1"
                  >
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 0 }}
                      onClick={() => goTo('metadata')}
                      className="w-full py-3 rounded-lg bg-white/90 backdrop-blur-sm text-[#062e61]
                        font-semibold text-sm border border-white/30
                        shadow-[0_0_15px_rgba(255,255,255,0.06)]
                        flex items-center justify-center gap-2 transition-all"
                    >
                      Continue with {photos.length} photo{photos.length !== 1 ? 's' : ''}
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ═══ METADATA ═══ */}
        {step === 'metadata' && (
          <motion.div
            key="metadata"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="h-[calc(100vh-56px)] flex flex-col"
          >
            <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col flex-1 min-h-0">
              {/* Photo strip */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-1.5 overflow-x-auto pb-2 snap-x scrollbar-none flex-shrink-0"
              >
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden ring-2 ring-white/20 shadow-md snap-start"
                  >
                    <img
                      src={p.preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </motion.div>

              <div className="flex-1 min-h-0 flex flex-col gap-3 pt-3">
                {/* Incident ID + Location row */}
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-semibold text-white/50">Incident ID</label>
                    <input
                      type="text"
                      value={incidentId}
                      onChange={(e) => setIncidentId(e.target.value)}
                      placeholder="e.g., HU-2024-001"
                      className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.08]
                        focus:border-white/25 focus:ring-2 focus:ring-white/10
                        outline-none transition-all text-white placeholder:text-white/30 text-sm"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-semibold text-white/50">Location</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={getLocation}
                        disabled={locating}
                        className="flex items-center gap-1 px-2.5 py-2.5 rounded-lg border border-white/10
                          bg-white/[0.08] hover:bg-white/[0.14] hover:border-white/20 transition-all text-xs font-medium text-white/70"
                      >
                        {locating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-300" />
                        ) : (
                          <Locate className="w-3.5 h-3.5 text-blue-300" />
                        )}
                        GPS
                      </button>
                      <div className="flex-1 flex gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupZip() } }}
                          placeholder="ZIP"
                          className="w-[72px] px-2.5 py-2.5 rounded-lg border border-white/10 bg-white/[0.08]
                            focus:border-white/25 focus:ring-2 focus:ring-white/10
                            outline-none transition-all text-white placeholder:text-white/30 text-sm text-center"
                        />
                        {zipCode.length === 5 && (
                          <button
                            type="button"
                            onClick={lookupZip}
                            disabled={zipLooking}
                            className="px-2 py-2.5 rounded-lg bg-white/[0.12] border border-white/15 text-white text-xs font-medium hover:bg-white/[0.18] transition-all"
                          >
                            {zipLooking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Go'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location result / error */}
                <AnimatePresence>
                  {gpsError && !location && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs text-amber-300 flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {gpsError}
                    </motion.p>
                  )}
                  {location && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                        bg-white/[0.08] border border-white/10
                        text-blue-200 text-xs font-mono"
                    >
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{locationName}</span>
                      <button
                        type="button"
                        title="Clear location"
                        onClick={() => { setLocation(null); setLocationName(''); setZipCode('') }}
                        className="ml-auto text-white/40 hover:text-white transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Notes */}
                <div className="flex-1 min-h-0 flex flex-col space-y-1">
                  <label className="text-xs font-semibold text-white/50">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                    placeholder="Describe what's in the photos, context, conditions..."
                    className="flex-1 min-h-[60px] w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.08]
                      focus:border-white/25 focus:ring-2 focus:ring-white/10
                      outline-none transition-all resize-none text-white placeholder:text-white/30 text-sm"
                  />
                  <p className="text-[10px] text-white/30 text-right">{notes.length}/500</p>
                </div>
              </div>

              {/* Actions — always pinned at bottom */}
              <div className="flex gap-3 pt-3 pb-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => goTo('photos')}
                  className="flex-1 py-3 rounded-lg border border-white/15 text-white/60
                    font-medium hover:bg-white/[0.08] hover:border-white/25 transition-all text-sm"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="flex-[2] py-3 rounded-lg bg-white/90 backdrop-blur-sm
                    text-[#062e61] font-semibold border border-white/30
                    shadow-[0_0_15px_rgba(255,255,255,0.06)]
                    flex items-center justify-center gap-2 transition-all
                    hover:bg-white hover:shadow-[0_0_25px_rgba(255,255,255,0.12)]"
                >
                  <Send className="w-4 h-4" />
                  Upload {photos.length} Photo{photos.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ UPLOADING ═══ */}
        {step === 'uploading' && (
          <motion.div
            key="uploading"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            <div className="text-center space-y-6">
              {/* ASPR logo */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                transition={{ delay: 0.3 }}
              >
                <img src="/aspr-logo-white.png" alt="" className="h-8 mx-auto" />
              </motion.div>

              {/* Progress ring */}
              <div className="relative w-32 h-32 lg:w-40 lg:h-40 mx-auto">
                <svg className="w-32 h-32 lg:w-40 lg:h-40 -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r={RING_R}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="6"
                  />
                  <motion.circle
                    cx="60"
                    cy="60"
                    r={RING_R}
                    fill="none"
                    stroke="url(#ring-grad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRC}
                    initial={{ strokeDashoffset: RING_CIRC }}
                    animate={{
                      strokeDashoffset: RING_CIRC * (1 - uploadProgress / 100),
                    }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                  <defs>
                    <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    key={uploadProgress}
                    initial={{ scale: 1.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-3xl lg:text-4xl font-bold text-white"
                  >
                    {uploadProgress}%
                  </motion.span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-lg font-semibold text-white">
                  {uploadError
                    ? 'Upload Failed'
                    : uploadProgress === 100
                      ? 'Finishing up...'
                      : `Uploading ${uploadedCount} of ${lastBatchSize}`}
                </p>

                {/* Linear bar */}
                <div className="w-64 lg:w-72 mx-auto">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.35 }}
                    />
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {uploadError && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 pt-2"
                    >
                      <p className="text-red-400 text-sm">{uploadError}</p>
                      <motion.button
                        whileHover={{ y: -1 }}
                        whileTap={{ y: 0 }}
                        onClick={handleUpload}
                        className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm text-[#062e61]
                          px-6 py-3 rounded-lg font-semibold border border-white/30
                          shadow-[0_0_15px_rgba(255,255,255,0.06)] transition-all"
                      >
                        <RotateCcw className="w-4 h-4" /> Retry
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ SUCCESS ═══ */}
        {step === 'success' && (
          <motion.div
            key="success"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            {/* Celebration particles */}
            <SuccessParticles />

            <motion.div
              variants={stagger}
              initial="initial"
              animate="animate"
              className="text-center space-y-6 lg:space-y-8 relative z-10"
            >
              {/* ASPR logo */}
              <motion.div variants={slideUp}>
                <img src="/aspr-logo-white.png" alt="" className="h-8 lg:h-10 mx-auto opacity-30" />
              </motion.div>

              {/* Success icon */}
              <motion.div
                variants={popIn}
                className="w-24 h-24 lg:w-28 lg:h-28 rounded-full bg-emerald-500/15 border border-emerald-400/20
                  flex items-center justify-center mx-auto backdrop-blur-sm"
              >
                <CheckCircle2 className="w-12 h-12 lg:w-16 lg:h-16 text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]" />
              </motion.div>

              {/* Message */}
              <motion.div variants={slideUp} className="space-y-2">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-display text-white tracking-wide uppercase">Upload Complete</h2>
                <p className="text-blue-200/60 text-lg">
                  {lastBatchSize} photo{lastBatchSize !== 1 ? 's' : ''} uploaded successfully
                </p>
                <p className="text-sm text-blue-300/30">Team: {teamName}</p>
              </motion.div>

              {/* Actions */}
              <motion.div variants={slideUp} className="flex flex-col gap-3 w-full max-w-xs mx-auto">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0 }}
                  onClick={resetForMore}
                  className="inline-flex items-center justify-center gap-2
                    bg-white/90 backdrop-blur-sm text-[#062e61] py-3 rounded-lg
                    font-semibold text-sm border border-white/30
                    shadow-[0_0_15px_rgba(255,255,255,0.06)] transition-all"
                >
                  <Camera className="w-4 h-4" />
                  Upload More Photos
                </motion.button>
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0 }}
                  onClick={() => router.push('/gallery')}
                  className="inline-flex items-center justify-center gap-2
                    bg-white/[0.08] border border-white/15 text-white/80 py-3 rounded-lg
                    font-medium text-sm backdrop-blur-sm hover:bg-white/[0.14] hover:border-white/25 transition-all"
                >
                  <ImageIcon className="w-4 h-4" />
                  View Gallery
                </motion.button>
                <button
                  type="button"
                  onClick={logout}
                  className="text-blue-300/40 hover:text-white transition text-sm py-2"
                >
                  Logout
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Bottom step dots (dark screens) ─── */}
      {isDark && step !== 'uploading' && (
        <div className="fixed bottom-6 inset-x-0 z-50 pointer-events-none">
          <StepDots current={step} />
        </div>
      )}
    </div>
  )
}

/* ─── Success Celebration Particles ──────────────────── */
function SuccessParticles() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return null

  const colors = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#ffffff']

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 40 }, (_, i) => {
        const color = colors[i % colors.length]
        const size = 4 + (i * 3) % 8
        const startX = 40 + (i * 7) % 20
        const delay = (i * 0.05) % 2
        return (
          <motion.div
            key={i}
            initial={{
              x: `${startX}vw`,
              y: '50vh',
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: `${(i * 13) % 100}vw`,
              y: `${-20 + (i * 7) % 30}vh`,
              scale: [0, 1.5, 0.8],
              opacity: [1, 1, 0],
              rotate: (i % 2 === 0 ? 1 : -1) * 360,
            }}
            transition={{
              duration: 2 + (i * 0.05) % 1.5,
              delay,
              ease: 'easeOut',
            }}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: i % 3 === 0 ? '50%' : '2px',
              backgroundColor: color,
            }}
          />
        )
      })}
    </div>
  )
}
