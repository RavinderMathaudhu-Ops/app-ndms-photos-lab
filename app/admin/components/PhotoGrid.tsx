'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Loader2, ImageOff, MapPin, Calendar, Check,
} from 'lucide-react'
import PhotoFilterBar, { type PhotoFilters, type ViewMode } from './PhotoFilterBar'
import PhotoDetailSidebar from './PhotoDetailSidebar'
import BulkActionBar from './BulkActionBar'
import BulkUploadPanel from './BulkUploadPanel'
import PhotoStrip from './PhotoStrip'
import PhotoReview from './PhotoReview'
import { useToast } from './Toast'

/* ─── Types ──────────────────────────────────────────── */
export interface AdminPhoto {
  id: string
  session_id: string
  file_name: string
  file_size: number
  width: number
  height: number
  mime_type: string
  latitude: number | null
  longitude: number | null
  location_name: string | null
  notes: string | null
  incident_id: string | null
  status: string
  storage_tier: string | null
  date_taken: string | null
  camera_info: string | null
  created_at: string
  updated_at: string | null
  updated_by: string | null
  team_name: string | null
  thumbnailUrl: string
  originalUrl: string
}

interface PhotoGridProps {
  isEntraAuth: boolean
  storedToken: string
}

/* ─── Helpers ────────────────────────────────────────── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

/* ─── Responsive column count ────────────────────────── */
function useColumnCount() {
  const [cols, setCols] = useState(4)
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w < 640) setCols(2)
      else if (w < 768) setCols(3)
      else if (w < 1024) setCols(4)
      else if (w < 1280) setCols(5)
      else setCols(6)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return cols
}

/* ─── Main Component ─────────────────────────────────── */
export default function PhotoGrid({ isEntraAuth, storedToken }: PhotoGridProps) {
  const { toast } = useToast()
  const [photos, setPhotos] = useState<AdminPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<PhotoFilters>({
    search: '',
    incident: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    sort: 'newest',
  })
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailPhoto, setDetailPhoto] = useState<AdminPhoto | null>(null)
  const [incidents, setIncidents] = useState<string[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const columnCount = useColumnCount()

  /* ───── Auth headers ─────────────────────────── */
  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {}
    if (!isEntraAuth) {
      headers['x-admin-token'] = storedToken
    }
    return headers
  }, [isEntraAuth, storedToken])

  /* ───── Fetch photos ─────────────────────────── */
  const fetchPhotos = useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError('')

    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      if (cursor) params.set('cursor', cursor)
      if (filters.search) params.set('search', filters.search)
      if (filters.incident) params.set('incident', filters.incident)
      if (filters.status) params.set('status', filters.status)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      params.set('sort', filters.sort)

      const res = await fetch(`/api/admin/photos?${params}`, {
        headers: getHeaders(),
      })

      if (!res.ok) throw new Error('Failed to fetch photos')

      const data = await res.json()

      if (cursor) {
        setPhotos((prev) => [...prev, ...data.photos])
      } else {
        setPhotos(data.photos)
      }
      setNextCursor(data.nextCursor)
      setTotal(data.total)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load photos'
      setError(msg)
      toast('error', msg)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filters, getHeaders, toast])

  /* ───── Fetch incidents for filter dropdown ──── */
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/photos/stats', { headers: getHeaders() })
      if (!res.ok) return
      const data = await res.json()
      const incidentList = (data.incidents || [])
        .map((i: any) => i.incident_id)
        .filter((id: string) => id !== '(No Incident)')
      setIncidents(incidentList)
    } catch {
      // Non-critical
    }
  }, [getHeaders])

  /* ───── Effects ──────────────────────────────── */
  useEffect(() => {
    fetchIncidents()
  }, [fetchIncidents])

  // Debounce search, immediate for other filters
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      fetchPhotos()
    }, filters.search ? 300 : 0)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [filters, fetchPhotos])

  /* ───── Virtualizer (grid mode) ────────────── */
  const rowCount = useMemo(
    () => Math.ceil(photos.length / columnCount),
    [photos.length, columnCount]
  )

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 320, // Conservative estimate; measureElement refines it
    overscan: 3,
    gap: 12, // matches Tailwind gap-3 (0.75rem = 12px)
  })

  /* ───── Infinite scroll (grid mode) ──────────── */
  useEffect(() => {
    if (viewMode !== 'grid') return
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      if (loadingMore || !nextCursor) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollTop + clientHeight >= scrollHeight * 0.8) {
        fetchPhotos(nextCursor)
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [viewMode, loadingMore, nextCursor, fetchPhotos])

  /* ───── Selection ────────────────────────────── */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(photos.map((p) => p.id)))
    }
  }

  /* ───── Load more (for strip/review delegation) */
  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMore) fetchPhotos(nextCursor)
  }, [nextCursor, loadingMore, fetchPhotos])

  /* ───── Callbacks ──────────────────────────── */
  const handleBulkComplete = () => {
    toast('success', `Bulk action completed on ${selectedIds.size} photos`)
    setSelectedIds(new Set())
    fetchPhotos()
  }

  const handleUploadComplete = () => {
    toast('success', 'Photos uploaded successfully')
    fetchPhotos()
  }

  const handlePhotoUpdated = (updated: AdminPhoto) => {
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    if (detailPhoto?.id === updated.id) setDetailPhoto(updated)
    toast('success', 'Photo updated')
  }

  const handlePhotoDeleted = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
    toast('success', 'Photo deleted')
    if (detailPhoto?.id === id) setDetailPhoto(null)
    setTotal((prev) => prev - 1)
  }

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-4 py-3">
        <PhotoFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          incidents={incidents}
          totalPhotos={total}
          selectedCount={selectedIds.size}
        />
      </div>

      {/* Bulk upload panel */}
      <BulkUploadPanel getHeaders={getHeaders} onUploadComplete={handleUploadComplete} />

      {/* Error state */}
      {error && (
        <div className="px-4 pb-3">
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-400/20 text-red-300 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* ─── Strip view ─── */}
      {viewMode === 'strip' && (
        <PhotoStrip
          photos={photos}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={!!nextCursor}
          selectedIds={selectedIds}
          onSelect={toggleSelect}
          onPhotoClick={setDetailPhoto}
          onLoadMore={handleLoadMore}
        />
      )}

      {/* ─── Review view ─── */}
      {viewMode === 'review' && (
        <PhotoReview
          photos={photos}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={!!nextCursor}
          selectedIds={selectedIds}
          onSelect={toggleSelect}
          onPhotoClick={setDetailPhoto}
          onLoadMore={handleLoadMore}
        />
      )}

      {/* ─── Grid view (virtualized) ─── */}
      {viewMode === 'grid' && (
        <div ref={scrollRef} className="flex-1 overflow-auto px-4 pb-4">
          {loading ? (
            <div className="grid gap-3 pt-3" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
              {Array.from({ length: columnCount * 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.05] animate-pulse">
                  <div className="aspect-[4/3] bg-white/[0.06]" />
                  <div className="p-2.5 space-y-2">
                    <div className="h-3 bg-white/[0.06] rounded w-3/4" />
                    <div className="h-2 bg-white/[0.04] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : photos.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center py-20 gap-3"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/[0.07] border border-white/10 flex items-center justify-center">
                <ImageOff className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/40 font-medium">No photos found</p>
              <p className="text-xs text-white/25">
                {filters.search || filters.incident || filters.status
                  ? 'Try adjusting your filters'
                  : 'Photos uploaded by field teams will appear here'}
              </p>
            </motion.div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center gap-3 pb-3">
                <button
                  type="button"
                  onClick={selectAll}
                  className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition
                    ${selectedIds.size === photos.length
                      ? 'bg-blue-500 border-blue-400'
                      : 'border-white/20 hover:border-white/40'
                    }`}
                  >
                    {selectedIds.size === photos.length && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {selectedIds.size === photos.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Virtualized grid */}
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const startIdx = virtualRow.index * columnCount
                  const rowPhotos = photos.slice(startIdx, startIdx + columnCount)

                  return (
                    <div
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      >
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
                      >
                        {rowPhotos.map((photo) => (
                          <div
                            key={photo.id}
                            className={`group relative rounded-2xl overflow-hidden cursor-pointer
                              border transition-all duration-200
                              ${selectedIds.has(photo.id)
                                ? 'border-blue-400/50 ring-2 ring-blue-400/20'
                                : 'border-white/10 hover:border-white/20'
                              }
                              bg-white/[0.05] backdrop-blur-sm`}
                            onClick={() => setDetailPhoto(photo)}
                          >
                            {/* Thumbnail */}
                            <div className="aspect-[4/3] bg-black/20 overflow-hidden relative">
                              <img
                                src={photo.thumbnailUrl}
                                alt={photo.file_name}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-300
                                  group-hover:scale-105"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).classList.add('hidden')
                                }}
                              />

                              {/* Select checkbox */}
                              <div className={`absolute top-2 left-2 z-10 transition-opacity
                                ${selectedIds.has(photo.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id) }}
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
                            </div>

                            {/* Info */}
                            <div className="p-2.5 space-y-1">
                              <p className="text-xs font-medium text-white/80 truncate">{photo.file_name}</p>
                              <div className="flex items-center gap-2 text-[10px] text-white/35">
                                <span>{formatBytes(photo.file_size)}</span>
                                {photo.location_name && (
                                  <>
                                    <span className="text-white/15">|</span>
                                    <span className="flex items-center gap-0.5 truncate">
                                      <MapPin className="w-2.5 h-2.5" />
                                      {photo.location_name}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-white/25">
                                <Calendar className="w-2.5 h-2.5" />
                                {formatDate(photo.created_at)}
                                {photo.team_name && (
                                  <span className="truncate">· {photo.team_name}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
                </div>
              )}

              {/* End of list */}
              {!nextCursor && photos.length > 0 && (
                <p className="text-center py-6 text-xs text-white/20">
                  All {total} photos loaded
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Detail sidebar */}
      <AnimatePresence>
        {detailPhoto && (
          <PhotoDetailSidebar
            photo={detailPhoto}
            onClose={() => setDetailPhoto(null)}
            onUpdated={handlePhotoUpdated}
            onDeleted={handlePhotoDeleted}
            getHeaders={getHeaders}
          />
        )}
      </AnimatePresence>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkActionBar
            selectedIds={selectedIds}
            onComplete={handleBulkComplete}
            onClearSelection={() => setSelectedIds(new Set())}
            getHeaders={getHeaders}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
