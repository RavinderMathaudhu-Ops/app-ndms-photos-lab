'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronUp, ChevronDown, MapPin, Calendar, Camera,
  Tag, Check, Loader2, ImageOff, Eye, Download,
  ArrowLeft, ArrowRight,
} from 'lucide-react'
import Lenis from 'lenis'
import type { AdminPhoto } from './PhotoGrid'

interface PhotoReviewProps {
  photos: AdminPhoto[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onPhotoClick: (photo: AdminPhoto) => void
  onLoadMore: () => void
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function statusColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    case 'reviewed': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    case 'flagged': return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    case 'archived': return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
    default: return 'bg-white/10 text-white/60 border-white/20'
  }
}

export default function PhotoReview({
  photos, loading, loadingMore, hasMore,
  selectedIds, onSelect, onPhotoClick, onLoadMore,
}: PhotoReviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  /* ─── Lenis smooth scroll (vertical, snap-like) ──── */
  useEffect(() => {
    const container = containerRef.current
    if (!container || photos.length === 0) return

    const lenis = new Lenis({
      wrapper: container,
      content: container.firstElementChild as HTMLElement,
      smoothWheel: true,
      duration: 0.8,
    })
    lenisRef.current = lenis

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [photos.length])

  /* ─── Track active slide via IntersectionObserver ── */
  useEffect(() => {
    const container = containerRef.current
    if (!container || photos.length === 0) return

    const slides = container.querySelectorAll('[data-review-slide]')
    if (slides.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-review-slide'))
            setActiveIndex(idx)
            // Load more when nearing the end
            if (idx >= photos.length - 3 && hasMore && !loadingMore) {
              onLoadMore()
            }
          }
        }
      },
      { root: container, threshold: 0.6 }
    )

    slides.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [photos.length, hasMore, loadingMore, onLoadMore])

  /* ─── Keyboard navigation ──────────────────────── */
  const goTo = useCallback((index: number) => {
    const container = containerRef.current
    if (!container) return
    const slide = container.querySelector(`[data-review-slide="${index}"]`)
    if (slide) {
      lenisRef.current?.scrollTo(slide as HTMLElement, { duration: 0.6 })
    }
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        const next = Math.min(activeIndex + 1, photos.length - 1)
        goTo(next)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = Math.max(activeIndex - 1, 0)
        goTo(prev)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onPhotoClick(photos[activeIndex])
      } else if (e.key === 's' || e.key === 'S') {
        onSelect(photos[activeIndex].id)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeIndex, photos, goTo, onPhotoClick, onSelect])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center">
          <ImageOff className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/40 font-medium">No photos found</p>
      </div>
    )
  }

  const currentPhoto = photos[activeIndex]

  return (
    <div className="relative flex-1 min-h-0 flex">
      {/* ─── Main review scroll area ──── */}
      <div ref={containerRef} className="flex-1 overflow-auto snap-y snap-mandatory">
        <div>
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              data-review-slide={idx}
              className="snap-start h-[calc(100vh-140px)] flex items-center justify-center p-6 relative"
            >
              {/* Full photo */}
              <div className="relative max-w-full max-h-full flex items-center justify-center">
                <img
                  src={photo.originalUrl || photo.thumbnailUrl}
                  alt={photo.file_name}
                  loading={idx <= activeIndex + 2 ? 'eager' : 'lazy'}
                  className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-xl
                    shadow-2xl shadow-black/40"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = photo.thumbnailUrl
                  }}
                />

                {/* Select overlay (top-left) */}
                <div className="absolute top-4 left-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelect(photo.id) }}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border
                      ${selectedIds.has(photo.id)
                        ? 'bg-blue-500 border-blue-400 shadow-lg shadow-blue-500/30'
                        : 'bg-black/50 border-white/20 backdrop-blur-sm hover:bg-black/70 hover:border-white/40'
                      }`}
                  >
                    {selectedIds.has(photo.id) && <Check className="w-4 h-4 text-white" />}
                  </button>
                </div>

                {/* Status badge (top-right) */}
                <div className="absolute top-4 right-4">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border capitalize
                    ${statusColor(photo.status)}`}>
                    {photo.status}
                  </span>
                </div>
              </div>

              {/* Bottom info bar */}
              <div className="absolute bottom-0 left-0 right-0 px-8 pb-4">
                <div className="flex items-end justify-between gap-4">
                  <div className="flex items-center gap-6 text-sm text-white/60">
                    <span className="font-medium text-white/80">{photo.file_name}</span>
                    <span>{formatBytes(photo.file_size)}</span>
                    <span>{photo.width}×{photo.height}</span>
                    {photo.team_name && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5" />{photo.team_name}
                      </span>
                    )}
                    {photo.location_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />{photo.location_name}
                      </span>
                    )}
                    {photo.camera_info && (
                      <span className="flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5" />{photo.camera_info}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={photo.originalUrl}
                      download={photo.file_name}
                      className="p-2 rounded-lg bg-white/[0.07] text-white/50 border border-white/10
                        hover:text-white hover:bg-white/[0.12] transition"
                      title="Download original"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => onPhotoClick(photo)}
                      className="p-2 rounded-lg bg-white/[0.07] text-white/50 border border-white/10
                        hover:text-white hover:bg-white/[0.12] transition"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Loading more */}
          {loadingMore && (
            <div className="h-20 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* ─── Side navigation rail ──── */}
      <div className="w-14 flex flex-col items-center justify-center gap-2 py-4 border-l border-white/5">
        {/* Up */}
        <button
          onClick={() => goTo(Math.max(activeIndex - 1, 0))}
          disabled={activeIndex === 0}
          className="p-2 rounded-lg text-white/30 hover:text-white/70 transition disabled:opacity-20"
        >
          <ChevronUp className="w-5 h-5" />
        </button>

        {/* Counter */}
        <div className="text-center">
          <span className="text-sm font-semibold text-white/80">{activeIndex + 1}</span>
          <span className="text-xs text-white/30">/{photos.length}</span>
        </div>

        {/* Progress dots */}
        <div className="flex flex-col gap-1 py-2 max-h-40 overflow-hidden">
          {photos.slice(
            Math.max(0, activeIndex - 4),
            Math.min(photos.length, activeIndex + 5)
          ).map((_, i) => {
            const realIdx = Math.max(0, activeIndex - 4) + i
            return (
              <button
                key={realIdx}
                onClick={() => goTo(realIdx)}
                className={`w-1.5 rounded-full transition-all ${
                  realIdx === activeIndex
                    ? 'h-4 bg-blue-400'
                    : 'h-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            )
          })}
        </div>

        {/* Down */}
        <button
          onClick={() => goTo(Math.min(activeIndex + 1, photos.length - 1))}
          disabled={activeIndex === photos.length - 1}
          className="p-2 rounded-lg text-white/30 hover:text-white/70 transition disabled:opacity-20"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        {/* Keyboard hints */}
        <div className="mt-auto space-y-1 text-center">
          <div className="flex items-center justify-center gap-0.5">
            <ArrowLeft className="w-3 h-3 text-white/15" />
            <ArrowRight className="w-3 h-3 text-white/15" />
          </div>
          <p className="text-[8px] text-white/15 uppercase tracking-wider">nav</p>
          <p className="text-[8px] text-white/15 mt-1">S = select</p>
        </div>
      </div>
    </div>
  )
}
