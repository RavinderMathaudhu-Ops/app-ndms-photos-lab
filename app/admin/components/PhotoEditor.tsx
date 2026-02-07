'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
  Save, Loader2, Undo2, Crop,
} from 'lucide-react'
import { Cropper, CropperRef } from 'react-advanced-cropper'
import 'react-advanced-cropper/dist/style.css'
import type { AdminPhoto } from './PhotoGrid'

interface PhotoEditorProps {
  photo: AdminPhoto
  onClose: () => void
  onSaved: (updated: { width: number; height: number }) => void
  getHeaders: () => Record<string, string>
}

type EditorMode = 'crop' | 'transform'

export default function PhotoEditor({
  photo,
  onClose,
  onSaved,
  getHeaders,
}: PhotoEditorProps) {
  const cropperRef = useRef<CropperRef>(null)
  const [mode, setMode] = useState<EditorMode>('crop')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)

  /* ─── Transform actions ─────────────────────────────── */
  const handleRotateRight = useCallback(() => {
    const cropper = cropperRef.current
    if (cropper) {
      cropper.rotateImage(90)
      setRotation((r) => (r + 90) % 360)
    }
  }, [])

  const handleRotateLeft = useCallback(() => {
    const cropper = cropperRef.current
    if (cropper) {
      cropper.rotateImage(-90)
      setRotation((r) => (r - 90 + 360) % 360)
    }
  }, [])

  const handleFlipH = useCallback(() => {
    const cropper = cropperRef.current
    if (cropper) {
      cropper.flipImage(true, false)
      setFlipH((f) => !f)
    }
  }, [])

  const handleFlipV = useCallback(() => {
    const cropper = cropperRef.current
    if (cropper) {
      cropper.flipImage(false, true)
      setFlipV((f) => !f)
    }
  }, [])

  const handleReset = useCallback(() => {
    const cropper = cropperRef.current
    if (cropper) {
      cropper.reset()
      setRotation(0)
      setFlipH(false)
      setFlipV(false)
    }
  }, [])

  /* ─── Save ──────────────────────────────────────────── */
  const handleSave = async () => {
    const cropper = cropperRef.current
    if (!cropper) return

    const canvas = cropper.getCanvas()
    if (!canvas) {
      setError('Failed to get edited image')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.92)
      )
      if (!blob) throw new Error('Failed to create image blob')

      // Build edit params for audit
      const coordinates = cropper.getCoordinates()
      const editParams = JSON.stringify({
        rotation,
        flipH,
        flipV,
        crop: coordinates
          ? { x: coordinates.left, y: coordinates.top, width: coordinates.width, height: coordinates.height }
          : null,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      })

      const formData = new FormData()
      formData.append('image', blob, `${photo.file_name}.webp`)
      formData.append('editType', mode)
      formData.append('editParams', editParams)

      const res = await fetch(`/api/admin/photos/${photo.id}/edit`, {
        method: 'POST',
        headers: getHeaders(),
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(data.error || 'Save failed')
      }

      const data = await res.json()
      onSaved({ width: data.width, height: data.height })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save edit')
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = rotation !== 0 || flipH || flipV

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-black/50 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Crop className="w-5 h-5 text-blue-300/70" />
          <h2 className="font-display text-lg text-white tracking-wide">Edit Photo</h2>
          <span className="text-xs text-white/30 truncate max-w-48">{photo.file_name}</span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-300 mr-2">{error}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition
              disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 px-5 py-3 bg-black/30 border-b border-white/10">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 mr-4">
          {([
            { key: 'crop' as EditorMode, label: 'Crop' },
            { key: 'transform' as EditorMode, label: 'Transform' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition
                ${mode === key
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:text-white/70'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Transform tools */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRotateLeft}
            disabled={saving}
            className="p-2 rounded-lg bg-white/[0.07] text-white/50 border border-white/10
              hover:text-white hover:bg-white/[0.12] transition disabled:opacity-40"
            title="Rotate left 90°"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRotateRight}
            disabled={saving}
            className="p-2 rounded-lg bg-white/[0.07] text-white/50 border border-white/10
              hover:text-white hover:bg-white/[0.12] transition disabled:opacity-40"
            title="Rotate right 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button
            type="button"
            onClick={handleFlipH}
            disabled={saving}
            className={`p-2 rounded-lg border transition disabled:opacity-40
              ${flipH
                ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                : 'bg-white/[0.07] text-white/50 border-white/10 hover:text-white hover:bg-white/[0.12]'
              }`}
            title="Flip horizontal"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleFlipV}
            disabled={saving}
            className={`p-2 rounded-lg border transition disabled:opacity-40
              ${flipV
                ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                : 'bg-white/[0.07] text-white/50 border-white/10 hover:text-white hover:bg-white/[0.12]'
              }`}
            title="Flip vertical"
          >
            <FlipVertical className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.07]
              text-white/40 border border-white/10 text-xs
              hover:text-white/70 hover:bg-white/[0.12] transition disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Info badges */}
        {hasChanges && (
          <div className="flex items-center gap-2 ml-4">
            {rotation !== 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                {rotation}°
              </span>
            )}
            {flipH && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                H-flip
              </span>
            )}
            {flipV && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                V-flip
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cropper canvas */}
      <div className="flex-1 min-h-0 relative">
        <Cropper
          ref={cropperRef}
          src={photo.originalUrl}
          className="h-full w-full"
          stencilProps={{
            aspectRatio: mode === 'crop' ? undefined : undefined,
            movable: mode === 'crop',
            resizable: mode === 'crop',
          }}
          backgroundClassName="bg-black"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 bg-black/50 border-t border-white/10">
        <div className="text-xs text-white/30">
          {photo.width}×{photo.height} · {photo.mime_type}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm text-white/50
              bg-white/[0.05] border border-white/10 hover:bg-white/[0.1] transition
              disabled:opacity-50"
          >
            Cancel
          </button>
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
              bg-blue-500/30 text-blue-300 border border-blue-400/30
              hover:bg-blue-500/40 transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Edit
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
