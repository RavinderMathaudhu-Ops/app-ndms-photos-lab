'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Filter, Grid3X3, Rows3, Maximize2,
  SlidersHorizontal, X, ChevronDown,
} from 'lucide-react'

export type ViewMode = 'grid' | 'strip' | 'review'
export type SortMode = 'newest' | 'oldest'

export interface PhotoFilters {
  search: string
  incident: string
  status: string
  dateFrom: string
  dateTo: string
  sort: SortMode
}

interface PhotoFilterBarProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  incidents: string[]
  totalPhotos: number
  selectedCount: number
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'archived', label: 'Archived' },
]

export default function PhotoFilterBar({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  incidents,
  totalPhotos,
  selectedCount,
}: PhotoFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const update = (partial: Partial<PhotoFilters>) => {
    onFiltersChange({ ...filters, ...partial })
  }

  const hasActiveFilters = filters.incident || filters.status || filters.dateFrom || filters.dateTo

  return (
    <div className="space-y-3">
      {/* Main bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search photos..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.07] backdrop-blur-sm
              border border-white/10 text-white text-sm placeholder-white/30
              outline-none focus:border-blue-400/40 focus:ring-2 focus:ring-blue-400/10 transition-all"
          />
          {filters.search && (
            <button
              onClick={() => update({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Advanced filters toggle */}
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ y: 0 }}
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium
            border transition-all backdrop-blur-sm
            ${hasActiveFilters
              ? 'bg-blue-500/20 border-blue-400/30 text-blue-300'
              : 'bg-white/[0.07] border-white/10 text-white/50 hover:text-white/80'
            }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-blue-400" />
          )}
        </motion.button>

        {/* View mode toggle */}
        <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.05] overflow-hidden">
          {([
            { mode: 'grid' as ViewMode, icon: Grid3X3, label: 'Grid' },
            { mode: 'strip' as ViewMode, icon: Rows3, label: 'Strip' },
            { mode: 'review' as ViewMode, icon: Maximize2, label: 'Review' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-3 py-2.5 transition-all
                ${viewMode === mode
                  ? 'bg-white/15 text-white'
                  : 'text-white/30 hover:text-white/60'
                }`}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Count */}
        <div className="text-xs text-white/40 whitespace-nowrap">
          {selectedCount > 0 ? (
            <span className="text-blue-300">{selectedCount} selected</span>
          ) : (
            <span>{totalPhotos.toLocaleString()} photos</span>
          )}
        </div>
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-white/[0.05] border border-white/10"
        >
          {/* Incident */}
          <div className="relative">
            <select
              value={filters.incident}
              onChange={(e) => update({ incident: e.target.value })}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-white/10 border border-white/10
                text-white text-sm outline-none focus:border-blue-400/40 transition cursor-pointer"
            >
              <option value="" className="bg-[#0a2a4a]">All Incidents</option>
              {incidents.map((inc) => (
                <option key={inc} value={inc} className="bg-[#0a2a4a]">{inc}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={filters.status}
              onChange={(e) => update({ status: e.target.value })}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-white/10 border border-white/10
                text-white text-sm outline-none focus:border-blue-400/40 transition cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a2a4a]">{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10
                text-white text-sm outline-none focus:border-blue-400/40 transition
                [color-scheme:dark]"
              placeholder="From"
            />
            <span className="text-white/30 text-xs">to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/10
                text-white text-sm outline-none focus:border-blue-400/40 transition
                [color-scheme:dark]"
              placeholder="To"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortMode })}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-white/10 border border-white/10
                text-white text-sm outline-none focus:border-blue-400/40 transition cursor-pointer"
            >
              <option value="newest" className="bg-[#0a2a4a]">Newest First</option>
              <option value="oldest" className="bg-[#0a2a4a]">Oldest First</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={() => update({ incident: '', status: '', dateFrom: '', dateTo: '' })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-300/80
                bg-red-500/10 border border-red-400/20 hover:bg-red-500/20 transition"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </motion.div>
      )}
    </div>
  )
}
