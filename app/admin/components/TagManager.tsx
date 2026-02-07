'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, X, Plus, Loader2, Search } from 'lucide-react'

/* ─── Types ──────────────────────────────────────────── */
export interface TagItem {
  id: string
  name: string
  category: string
  color: string | null
  usage_count?: number
}

interface TagManagerProps {
  /** Tags currently assigned to the photo(s) */
  assignedTags: TagItem[]
  /** Called when a tag is added */
  onAddTag: (tagId: string) => void
  /** Called when a tag is removed */
  onRemoveTag: (tagId: string) => void
  /** Auth headers for API calls */
  getHeaders: () => Record<string, string>
  /** Compact mode for sidebar */
  compact?: boolean
}

/* ─── Category colors ────────────────────────────────── */
const CATEGORY_COLORS: Record<string, string> = {
  status: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  type: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  priority: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  custom: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
}

function tagBadgeClass(tag: TagItem): string {
  if (tag.color) {
    return `border-[${tag.color}]/30 text-[${tag.color}]`
  }
  return CATEGORY_COLORS[tag.category] || CATEGORY_COLORS.custom
}

/* ─── Component ──────────────────────────────────────── */
export default function TagManager({
  assignedTags,
  onAddTag,
  onRemoveTag,
  getHeaders,
  compact = false,
}: TagManagerProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ─── Fetch available tags ──────────────────── */
  const fetchTags = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/photos/tags?${params}`, {
        headers: getHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setAllTags(data.tags)
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }, [getHeaders])

  useEffect(() => {
    if (showPicker) {
      fetchTags()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showPicker, fetchTags])

  // Debounced search
  useEffect(() => {
    if (!showPicker) return
    const timer = setTimeout(() => fetchTags(search || undefined), 200)
    return () => clearTimeout(timer)
  }, [search, showPicker, fetchTags])

  /* ─── Close on outside click ──────────────── */
  useEffect(() => {
    if (!showPicker) return
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  /* ─── Create new tag ──────────────────────── */
  const createTag = async () => {
    if (!search.trim() || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/photos/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ name: search.trim(), category: 'custom' }),
      })
      if (res.ok) {
        const data = await res.json()
        onAddTag(data.tag.id)
        setSearch('')
        fetchTags()
      }
    } catch {
      // Non-critical
    } finally {
      setCreating(false)
    }
  }

  const assignedIds = new Set(assignedTags.map((t) => t.id))
  const availableTags = allTags.filter((t) => !assignedIds.has(t.id))
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === search.trim().toLowerCase()
  )

  return (
    <div className="space-y-2">
      {/* Assigned tags */}
      <div className="flex flex-wrap gap-1.5">
        {assignedTags.map((tag) => (
          <motion.span
            key={tag.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg
              text-[11px] font-medium border ${tagBadgeClass(tag)}`}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => onRemoveTag(tag.id)}
              className="ml-0.5 hover:text-white transition opacity-60 hover:opacity-100"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.span>
        ))}

        {/* Add tag button */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className={`inline-flex items-center gap-1 rounded-lg border border-dashed
              border-white/20 text-white/40 hover:text-white/70 hover:border-white/40
              transition ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
          >
            <Plus className="w-3 h-3" />
            {!compact && 'Add tag'}
          </button>

          {/* Tag picker dropdown */}
          <AnimatePresence>
            {showPicker && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-2 z-50 w-64
                  rounded-xl bg-[#0a2a4a] border border-white/15
                  shadow-2xl shadow-black/40 overflow-hidden"
              >
                {/* Search input */}
                <div className="p-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !exactMatch && search.trim()) {
                          createTag()
                        }
                      }}
                      placeholder="Search or create tag..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/10 border border-white/10
                        text-xs text-white placeholder-white/30 outline-none focus:border-blue-400/40"
                    />
                  </div>
                </div>

                {/* Tag list */}
                <div className="max-h-48 overflow-auto p-1.5">
                  {loading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                    </div>
                  ) : availableTags.length === 0 && !search.trim() ? (
                    <p className="text-xs text-white/30 text-center py-4">No tags available</p>
                  ) : (
                    <>
                      {availableTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            onAddTag(tag.id)
                            setSearch('')
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                            text-left hover:bg-white/10 transition group"
                        >
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px]
                            font-medium border ${tagBadgeClass(tag)}`}>
                            {tag.name}
                          </span>
                          <span className="text-[10px] text-white/20 capitalize ml-auto">
                            {tag.category}
                          </span>
                          {tag.usage_count !== undefined && (
                            <span className="text-[9px] text-white/15">
                              {tag.usage_count}
                            </span>
                          )}
                        </button>
                      ))}

                      {/* Create new tag option */}
                      {search.trim() && !exactMatch && (
                        <button
                          type="button"
                          onClick={createTag}
                          disabled={creating}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                            text-left hover:bg-white/10 transition mt-1
                            border-t border-white/5 pt-2"
                        >
                          {creating ? (
                            <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                          <span className="text-xs text-emerald-300">
                            Create &ldquo;{search.trim()}&rdquo;
                          </span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
