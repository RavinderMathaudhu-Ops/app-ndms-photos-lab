'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, MapPin, Calendar, ChevronLeft, ChevronRight,
  Loader2, ImageOff,
} from 'lucide-react'
import Lenis from 'lenis'
import type { AdminPhoto } from './PhotoGrid'

interface PhotoStripProps {
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
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
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

/* ─── Group photos by date ──────────────────────────── */
function groupByDate(photos: AdminPhoto[]): Map<string, AdminPhoto[]> {
  const groups = new Map<string, AdminPhoto[]>()
  for (const p of photos) {
    const key = new Date(p.created_at).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  return groups
}

export default function PhotoStrip({
  photos, loading, loadingMore, hasMore,
  selectedIds, onSelect, onPhotoClick, onLoadMore,
}: PhotoStripProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  /* ─── Horizontal Lenis ──────────────────────── */
  useEffect(() => {
    const wrapper = wrapperRef.current
    const content = contentRef.current
    if (!wrapper || !content) return

    const lenis = new Lenis({
      wrapper,
      content,
      orientation: 'horizontal',
      gestureOrientation: 'both',
      smoothWheel: true,
    })
    lenisRef.current = lenis

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    const updateScrollButtons = () => {
      setCanScrollLeft(wrapper.scrollLeft > 10)
      setCanScrollRight(
        wrapper.scrollLeft + wrapper.clientWidth < wrapper.scrollWidth - 10
      )
    }

    // Check scroll position for arrow visibility + infinite load
    lenis.on('scroll', () => {
      updateScrollButtons()
      const scrollRight = wrapper.scrollWidth - wrapper.scrollLeft - wrapper.clientWidth
      if (scrollRight < 300 && hasMore && !loadingMore) {
        onLoadMore()
      }
    })

    updateScrollButtons()
    // Recheck after images might have loaded
    const timer = setTimeout(updateScrollButtons, 500)

    return () => {
      clearTimeout(timer)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [photos.length, hasMore, loadingMore, onLoadMore])

  const scroll = (dir: 'left' | 'right') => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const distance = wrapper.clientWidth * 0.7
    lenisRef.current?.scrollTo(
      wrapper.scrollLeft + (dir === 'left' ? -distance : distance),
      { duration: 0.6 }
    )
  }

  const dateGroups = groupByDate(photos)

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

  return (
    <div className="relative flex-1 min-h-0">
      {/* Scroll arrows */}
      <AnimatePresence>
        {canScrollLeft && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20
              w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm
              border border-white/10 text-white/70 hover:text-white
              flex items-center justify-center transition shadow-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {canScrollRight && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20
              w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm
              border border-white/10 text-white/70 hover:text-white
              flex items-center justify-center transition shadow-lg"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#031a36] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#031a36] to-transparent z-10 pointer-events-none" />

      {/* Horizontal scroll container */}
      <div ref={wrapperRef} className="h-full overflow-x-auto overflow-y-hidden scrollbar-hide">
        <div ref={contentRef} className="flex items-start gap-6 px-8 py-4 h-full min-w-max">
          {Array.from(dateGroups.entries()).map(([dateLabel, groupPhotos]) => (
            <div key={dateLabel} className="flex flex-col gap-3 flex-shrink-0">
              {/* Date header */}
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                  {dateLabel}
                </span>
                <span className="text-[10px] text-white/20">{groupPhotos.length} photos</span>
              </div>

              {/* Photo cards row */}
              <div className="flex items-start gap-3">
                {groupPhotos.map((photo) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`group relative flex-shrink-0 w-52 rounded-2xl overflow-hidden cursor-pointer
                      border transition-all duration-200
                      ${selectedIds.has(photo.id)
                        ? 'border-blue-400/50 ring-2 ring-blue-400/20'
                        : 'border-white/10 hover:border-white/20'
                      }
                      bg-white/[0.05]`}
                    onClick={() => onPhotoClick(photo)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[4/3] bg-black/20 overflow-hidden">
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.file_name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300
                          group-hover:scale-105"
                        onError={(e) => { (e.target as HTMLImageElement).classList.add('hidden') }}
                      />
                    </div>

                    {/* Select checkbox */}
                    <div className={`absolute top-2 left-2 z-10 transition-opacity
                      ${selectedIds.has(photo.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelect(photo.id) }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all border
                          ${selectedIds.has(photo.id)
                            ? 'bg-blue-500 border-blue-400 shadow-lg shadow-blue-500/30'
                            : 'bg-black/40 border-white/30 backdrop-blur-sm hover:bg-black/60'
                          }`}
                      >
                        {selectedIds.has(photo.id) && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    </div>

                    {/* Status badge */}
                    {photo.status !== 'active' && (
                      <div className="absolute top-2 right-2">
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase border
                          ${statusColor(photo.status)}`}>
                          {photo.status}
                        </span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="p-2.5 space-y-1">
                      <p className="text-xs font-medium text-white/80 truncate">{photo.file_name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-white/30">
                        {photo.team_name && <span className="truncate">{photo.team_name}</span>}
                        {photo.location_name && (
                          <span className="flex items-center gap-0.5 truncate">
                            <MapPin className="w-2.5 h-2.5" />
                            {photo.location_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}

          {/* Loading more */}
          {loadingMore && (
            <div className="flex items-center justify-center px-8 self-center">
              <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
