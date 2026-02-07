'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2, Tag, Download, X,
  Loader2, AlertTriangle, Search, Plus,
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface TagOption {
  id: string
  name: string
  category: string
  color: string | null
}

interface BulkActionBarProps {
  selectedIds: Set<string>
  onComplete: () => void
  onClearSelection: () => void
  getHeaders: () => Record<string, string>
}

export default function BulkActionBar({
  selectedIds,
  onComplete,
  onClearSelection,
  getHeaders,
}: BulkActionBarProps) {
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState('')

  // Tag picker state
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [tags, setTags] = useState<TagOption[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const tagPickerRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const count = selectedIds.size
  const ids = Array.from(selectedIds)

  /* ─── Bulk action executor ──────────────────── */
  const executeBulk = async (bulkAction: string, value?: string) => {
    setLoading(true)
    setAction(bulkAction)
    try {
      const res = await fetch('/api/admin/photos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ action: bulkAction, photoIds: ids, value }),
      })
      if (!res.ok) throw new Error('Bulk operation failed')
      onComplete()
    } catch (err) {
      console.error('Bulk action failed:', err)
    } finally {
      setLoading(false)
      setAction(null)
      setConfirmDelete(false)
      setShowTagPicker(false)
    }
  }

  /* ─── Tag picker ────────────────────────────── */
  const fetchTags = useCallback(async (q?: string) => {
    setTagsLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/photos/tags?${params}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTags(data.tags)
      }
    } catch {
      // Non-critical
    } finally {
      setTagsLoading(false)
    }
  }, [getHeaders])

  useEffect(() => {
    if (showTagPicker) {
      fetchTags()
      setTimeout(() => tagInputRef.current?.focus(), 100)
    }
  }, [showTagPicker, fetchTags])

  useEffect(() => {
    if (!showTagPicker) return
    const timer = setTimeout(() => fetchTags(tagSearch || undefined), 200)
    return () => clearTimeout(timer)
  }, [tagSearch, showTagPicker, fetchTags])

  // Close tag picker on outside click
  useEffect(() => {
    if (!showTagPicker) return
    const handleClick = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false)
        setTagSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTagPicker])

  /* ─── JSZip bulk download ──────────────────── */
  const handleDownload = async () => {
    setLoading(true)
    setAction('download')
    setDownloadProgress('Fetching URLs...')
    try {
      const res = await fetch('/api/admin/photos/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ photoIds: ids }),
      })
      if (!res.ok) throw new Error('Download failed')
      const data = await res.json()
      const downloads = data.downloads as { url: string; fileName: string }[]

      if (downloads.length === 1) {
        // Single file — direct download
        const a = document.createElement('a')
        a.href = downloads[0].url
        a.download = downloads[0].fileName
        a.click()
      } else {
        // Multiple files — create ZIP
        const zip = new JSZip()
        for (let i = 0; i < downloads.length; i++) {
          setDownloadProgress(`Downloading ${i + 1}/${downloads.length}...`)
          try {
            const fileRes = await fetch(downloads[i].url)
            if (fileRes.ok) {
              const blob = await fileRes.blob()
              zip.file(downloads[i].fileName, blob)
            }
          } catch {
            // Skip failed downloads
          }
        }

        setDownloadProgress('Creating ZIP...')
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const timestamp = new Date().toISOString().split('T')[0]
        saveAs(zipBlob, `aspr-photos-${timestamp}.zip`)
      }

      onComplete()
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setLoading(false)
      setAction(null)
      setDownloadProgress('')
    }
  }

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-3 px-5 py-3 rounded-2xl
        bg-[#0a2a4a]/95 backdrop-blur-xl border border-white/15
        shadow-2xl shadow-black/40"
    >
      {/* Count */}
      <span className="text-sm font-semibold text-blue-300">
        {count} selected
      </span>

      <div className="w-px h-6 bg-white/10" />

      {/* Status actions */}
      <div className="flex items-center gap-1.5">
        {['reviewed', 'flagged', 'archived'].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => executeBulk('status', status)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium
              bg-white/[0.07] text-white/60 border border-white/10
              hover:bg-white/[0.12] hover:text-white transition
              disabled:opacity-40 disabled:cursor-not-allowed capitalize"
          >
            {loading && action === 'status' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              status
            )}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-white/10" />

      {/* Tag action */}
      <div className="relative" ref={tagPickerRef}>
        <button
          type="button"
          onClick={() => setShowTagPicker(!showTagPicker)}
          disabled={loading}
          className="p-2 rounded-lg bg-white/[0.07] text-white/50 border border-white/10
            hover:text-white hover:bg-white/[0.12] transition disabled:opacity-40"
          title="Tag selected"
        >
          <Tag className="w-4 h-4" />
        </button>

        {/* Tag picker dropdown */}
        <AnimatePresence>
          {showTagPicker && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 w-56
                rounded-xl bg-[#0a2a4a] border border-white/15
                shadow-2xl shadow-black/40 overflow-hidden"
            >
              <div className="p-2 border-b border-white/10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/10 border border-white/10
                      text-xs text-white placeholder-white/30 outline-none focus:border-blue-400/40"
                  />
                </div>
              </div>
              <div className="max-h-40 overflow-auto p-1.5">
                {tagsLoading ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                  </div>
                ) : tags.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-3">No tags found</p>
                ) : (
                  tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => executeBulk('tag', tag.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                        text-left text-xs text-white/70 hover:bg-white/10 transition"
                    >
                      <span className="capitalize text-white/30 text-[10px]">{tag.category}</span>
                      <span>{tag.name}</span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Download */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center gap-1.5 p-2 rounded-lg bg-white/[0.07] text-white/50
          border border-white/10 hover:text-white hover:bg-white/[0.12] transition disabled:opacity-40"
        title="Download selected as ZIP"
      >
        {loading && action === 'download' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {downloadProgress && (
              <span className="text-[10px] text-white/40 max-w-24 truncate">{downloadProgress}</span>
            )}
          </>
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>

      {/* Delete */}
      {confirmDelete ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => executeBulk('delete')}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              bg-red-500/30 text-red-300 border border-red-400/30 text-xs font-semibold
              hover:bg-red-500/40 transition disabled:opacity-40"
          >
            {loading && action === 'delete' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <AlertTriangle className="w-3 h-3" />
                Delete {count}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="px-2 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={loading}
          className="p-2 rounded-lg bg-white/[0.07] text-white/50 border border-white/10
            hover:text-red-400 hover:bg-red-500/10 hover:border-red-400/20 transition
            disabled:opacity-40"
          title="Delete selected"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      <div className="w-px h-6 bg-white/10" />

      {/* Clear selection */}
      <button
        type="button"
        onClick={onClearSelection}
        className="p-2 rounded-lg text-white/30 hover:text-white/60 transition"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
}
