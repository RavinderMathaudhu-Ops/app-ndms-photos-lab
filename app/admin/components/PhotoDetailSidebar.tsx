'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, MapPin, Calendar, Camera, Download, Trash2,
  Edit3, Save, Loader2, AlertCircle, Tag, Eye,
  ChevronDown, Clock, User, Crop,
} from 'lucide-react'
import type { AdminPhoto } from './PhotoGrid'
import TagManager, { type TagItem } from './TagManager'
import PhotoEditor from './PhotoEditor'

interface PhotoDetailSidebarProps {
  photo: AdminPhoto
  onClose: () => void
  onUpdated: (photo: AdminPhoto) => void
  onDeleted: (id: string) => void
  getHeaders: () => Record<string, string>
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_OPTIONS = ['active', 'reviewed', 'flagged', 'archived']

export default function PhotoDetailSidebar({
  photo,
  onClose,
  onUpdated,
  onDeleted,
  getHeaders,
}: PhotoDetailSidebarProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEditor, setShowEditor] = useState(false)

  // Editable fields
  const [editStatus, setEditStatus] = useState(photo.status)
  const [editNotes, setEditNotes] = useState(photo.notes || '')
  const [editLocation, setEditLocation] = useState(photo.location_name || '')
  const [editIncident, setEditIncident] = useState(photo.incident_id || '')

  // Tags
  const [photoTags, setPhotoTags] = useState<TagItem[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)

  const fetchPhotoTags = useCallback(async () => {
    setTagsLoading(true)
    try {
      const res = await fetch(`/api/admin/photos/${photo.id}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setPhotoTags(
          (data.tags || []).map((t: any) => ({
            id: t.tag_id || t.id,
            name: t.name,
            category: t.category,
            color: t.color,
          }))
        )
      }
    } catch {
      // Non-critical
    } finally {
      setTagsLoading(false)
    }
  }, [photo.id, getHeaders])

  useEffect(() => {
    fetchPhotoTags()
  }, [fetchPhotoTags])

  const handleAddTag = async (tagId: string) => {
    try {
      await fetch('/api/admin/photos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ action: 'tag', photoIds: [photo.id], value: tagId }),
      })
      fetchPhotoTags()
    } catch {
      // Non-critical
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    try {
      await fetch('/api/admin/photos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ action: 'untag', photoIds: [photo.id], value: tagId }),
      })
      setPhotoTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch {
      // Non-critical
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({
          status: editStatus,
          notes: editNotes || null,
          locationName: editLocation || null,
          incidentId: editIncident || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Update failed')
      }

      onUpdated({
        ...photo,
        status: editStatus,
        notes: editNotes || null,
        location_name: editLocation || null,
        incident_id: editIncident || null,
        updated_at: new Date().toISOString(),
      })
      setEditing(false)
    } catch (err) {
      console.error('Update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/photos/${photo.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Delete failed')
      onDeleted(photo.id)
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 bottom-0 w-full max-w-md z-50
        bg-gradient-to-b from-[#0a2a4a] to-[#062e61]
        border-l border-white/10 shadow-2xl shadow-black/40
        flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h3 className="font-display text-lg text-white tracking-wide uppercase">Photo Details</h3>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* Preview image */}
        <div className="relative aspect-video bg-black/30">
          <img
            src={photo.thumbnailUrl}
            alt={photo.file_name}
            className="w-full h-full object-contain"
          />
          <a
            href={photo.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-3 p-2 rounded-xl bg-black/50 backdrop-blur-sm
              text-white/70 hover:text-white border border-white/10 hover:border-white/30 transition"
            title="View original"
          >
            <Eye className="w-4 h-4" />
          </a>
        </div>

        {/* Info sections */}
        <div className="p-5 space-y-5">
          {/* File info */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">{photo.file_name}</p>
            <div className="flex flex-wrap gap-2 text-xs text-white/40">
              <span>{formatBytes(photo.file_size)}</span>
              <span>·</span>
              <span>{photo.width}×{photo.height}</span>
              <span>·</span>
              <span>{photo.mime_type}</span>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Status</label>
            {editing ? (
              <div className="flex gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setEditStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition
                      ${editStatus === s
                        ? 'bg-blue-500/30 border-blue-400/40 text-blue-300'
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold border capitalize
                ${photo.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  photo.status === 'reviewed' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                  photo.status === 'flagged' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                  'bg-gray-500/20 text-gray-300 border-gray-500/30'
                }`}>
                {photo.status}
              </span>
            )}
          </div>

          {/* Metadata fields */}
          <div className="space-y-3">
            {/* Team */}
            {photo.team_name && (
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-white/40">Team</p>
                  <p className="text-sm text-white/80">{photo.team_name}</p>
                </div>
              </div>
            )}

            {/* Date */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-white/40">Uploaded</p>
                <p className="text-sm text-white/80">{formatDate(photo.created_at)}</p>
                {photo.updated_at && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    Updated {formatDate(photo.updated_at)}
                    {photo.updated_by && ` by ${photo.updated_by}`}
                  </p>
                )}
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-white/40">Location</p>
                {editing ? (
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Location name"
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10
                      text-sm text-white placeholder-white/30 outline-none focus:border-blue-400/40"
                  />
                ) : (
                  <p className="text-sm text-white/80">{photo.location_name || '—'}</p>
                )}
                {photo.latitude && photo.longitude && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                  </p>
                )}
              </div>
            </div>

            {/* Incident */}
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-white/40">Incident ID</p>
                {editing ? (
                  <input
                    type="text"
                    value={editIncident}
                    onChange={(e) => setEditIncident(e.target.value)}
                    placeholder="e.g., HU-2024-001"
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10
                      text-sm text-white placeholder-white/30 outline-none focus:border-blue-400/40"
                  />
                ) : (
                  <p className="text-sm text-white/80">{photo.incident_id || '—'}</p>
                )}
              </div>
            </div>

            {/* Camera info */}
            {photo.camera_info && (
              <div className="flex items-start gap-3">
                <Camera className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-white/40">Camera</p>
                  <p className="text-sm text-white/80">{photo.camera_info}</p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1">
              <p className="text-xs text-white/40">Notes</p>
              {editing ? (
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Add notes..."
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10
                    text-sm text-white placeholder-white/30 outline-none focus:border-blue-400/40 resize-none"
                />
              ) : (
                <p className="text-sm text-white/60 whitespace-pre-wrap">{photo.notes || '—'}</p>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-white/30" />
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Tags</p>
              </div>
              {tagsLoading ? (
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading tags...
                </div>
              ) : (
                <TagManager
                  assignedTags={photoTags}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  getHeaders={getHeaders}
                  compact
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-white/10 px-5 py-4 flex items-center gap-3">
        {editing ? (
          <>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ y: 0 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                bg-blue-500/30 text-blue-300 border border-blue-400/30 text-sm font-medium
                hover:bg-blue-500/40 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </motion.button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setEditStatus(photo.status)
                setEditNotes(photo.notes || '')
                setEditLocation(photo.location_name || '')
                setEditIncident(photo.incident_id || '')
              }}
              className="px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/70
                bg-white/5 border border-white/10 transition"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ y: 0 }}
              onClick={() => setEditing(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                bg-white/[0.07] text-white/70 border border-white/10 text-sm font-medium
                hover:bg-white/[0.12] hover:text-white transition"
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </motion.button>
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="p-2.5 rounded-xl bg-white/[0.07] text-white/50 border border-white/10
                hover:text-blue-300 hover:bg-blue-500/10 hover:border-blue-400/20 transition"
              title="Crop & Edit Image"
            >
              <Crop className="w-4 h-4" />
            </button>
            <a
              href={photo.originalUrl}
              download={photo.file_name}
              className="p-2.5 rounded-xl bg-white/[0.07] text-white/50 border border-white/10
                hover:text-white hover:bg-white/[0.12] transition"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-2.5 rounded-xl bg-red-500/30 text-red-300 border border-red-400/30
                    text-xs font-semibold hover:bg-red-500/40 transition disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2.5 rounded-xl text-xs text-white/40 bg-white/5 border border-white/10"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-2.5 rounded-xl bg-white/[0.07] text-white/50 border border-white/10
                  hover:text-red-400 hover:bg-red-500/10 hover:border-red-400/20 transition"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Photo editor modal */}
      <AnimatePresence>
        {showEditor && (
          <PhotoEditor
            photo={photo}
            onClose={() => setShowEditor(false)}
            onSaved={(updated) => {
              setShowEditor(false)
              onUpdated({
                ...photo,
                width: updated.width,
                height: updated.height,
                updated_at: new Date().toISOString(),
              })
            }}
            getHeaders={getHeaders}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
