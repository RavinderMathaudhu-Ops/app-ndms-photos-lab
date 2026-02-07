'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, X, Image, Loader2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

interface FileWithPreview {
  file: File
  id: string
  preview: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

interface BulkUploadPanelProps {
  getHeaders: () => Record<string, string>
  onUploadComplete: () => void
}

const MAX_FILES = 50
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ACCEPTED_TYPES = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function BulkUploadPanel({ getHeaders, onUploadComplete }: BulkUploadPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [uploading, setUploading] = useState(false)
  const [incidentId, setIncidentId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [notes, setNotes] = useState('')
  const [uploadResult, setUploadResult] = useState<{ success: number; failed: number } | null>(null)
  const abortRef = useRef(false)

  /* ─── Dropzone ──────────────────────────────────────── */
  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    const newFiles: FileWithPreview[] = accepted.map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      preview: URL.createObjectURL(file),
      status: 'pending' as const,
    }))

    setFiles((prev) => {
      const combined = [...prev.filter(f => f.status !== 'success'), ...newFiles]
      return combined.slice(0, MAX_FILES)
    })
    setUploadResult(null)

    if (rejected.length > 0) {
      console.warn('Rejected files:', rejected.map(r => r.file.name))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
    disabled: uploading,
  })

  /* ─── Remove file ───────────────────────────────────── */
  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find(f => f.id === id)
      if (file) URL.revokeObjectURL(file.preview)
      return prev.filter(f => f.id !== id)
    })
  }

  /* ─── Clear all ─────────────────────────────────────── */
  const clearAll = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview))
    setFiles([])
    setUploadResult(null)
  }

  /* ─── Upload ────────────────────────────────────────── */
  const handleUpload = async () => {
    const pending = files.filter(f => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return

    setUploading(true)
    setUploadResult(null)
    abortRef.current = false

    let success = 0
    let failed = 0

    // Upload in batches of 5 to avoid overwhelming the server
    const BATCH_SIZE = 5
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (abortRef.current) break

      const batch = pending.slice(i, i + BATCH_SIZE)

      // Mark batch as uploading
      setFiles((prev) =>
        prev.map((f) =>
          batch.some(b => b.id === f.id) ? { ...f, status: 'uploading' as const } : f
        )
      )

      // Upload batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const formData = new FormData()
          formData.append('photos', item.file)
          if (incidentId) formData.append('incidentId', incidentId)
          if (locationName) formData.append('locationName', locationName)
          if (notes) formData.append('notes', notes)

          const res = await fetch('/api/admin/photos/upload', {
            method: 'POST',
            headers: getHeaders(),
            body: formData,
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({ error: 'Upload failed' }))
            throw new Error(data.error || 'Upload failed')
          }

          return { id: item.id, result: await res.json() }
        })
      )

      // Update file statuses based on results
      setFiles((prev) =>
        prev.map((f) => {
          const result = results.find((r, idx) => batch[idx]?.id === f.id)
          if (!result) return f

          if (result.status === 'fulfilled') {
            success++
            return { ...f, status: 'success' as const }
          } else {
            failed++
            return {
              ...f,
              status: 'error' as const,
              error: result.reason?.message || 'Upload failed',
            }
          }
        })
      )
    }

    setUploadResult({ success, failed })
    setUploading(false)

    if (success > 0) {
      onUploadComplete()
    }
  }

  const pendingCount = files.filter(f => f.status === 'pending' || f.status === 'error').length
  const successCount = files.filter(f => f.status === 'success').length
  const totalSize = files.reduce((acc, f) => acc + f.file.size, 0)

  return (
    <div className="mx-4 mb-3">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl
          bg-white/[0.07] border border-white/10 hover:bg-white/[0.1] transition-all"
      >
        <div className="flex items-center gap-2.5">
          <Upload className="w-4 h-4 text-blue-300/70" />
          <span className="text-sm font-medium text-white/70">Upload Photos</span>
          {files.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-white/30" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/30" />
        )}
      </button>

      {/* Expandable panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-4 rounded-2xl bg-white/[0.05] border border-white/10 space-y-4">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer
                  transition-all duration-200
                  ${isDragActive
                    ? 'border-blue-400/60 bg-blue-500/10'
                    : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'
                  }
                  ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.07] border border-white/10 flex items-center justify-center">
                    <Image className="w-6 h-6 text-white/30" />
                  </div>
                  {isDragActive ? (
                    <p className="text-sm text-blue-300">Drop photos here</p>
                  ) : (
                    <>
                      <p className="text-sm text-white/60">
                        Drag & drop photos, or <span className="text-blue-300 underline">browse</span>
                      </p>
                      <p className="text-[10px] text-white/30">
                        JPEG, PNG, WebP — up to 50MB each — max {MAX_FILES} files
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Shared metadata fields */}
              {files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    placeholder="Incident ID (e.g., HU-2026-001)"
                    disabled={uploading}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/10
                      text-white text-xs placeholder-white/30 outline-none
                      focus:border-blue-400/40 transition disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Location name"
                    disabled={uploading}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/10
                      text-white text-xs placeholder-white/30 outline-none
                      focus:border-blue-400/40 transition disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    disabled={uploading}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/10
                      text-white text-xs placeholder-white/30 outline-none
                      focus:border-blue-400/40 transition disabled:opacity-50"
                  />
                </div>
              )}

              {/* File preview grid */}
              {files.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40">
                      {files.length} file{files.length !== 1 ? 's' : ''} ({formatBytes(totalSize)})
                    </span>
                    {!uploading && (
                      <button
                        type="button"
                        onClick={clearAll}
                        className="text-[10px] text-red-300/60 hover:text-red-300 transition"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-40 overflow-auto">
                    {files.map((item) => (
                      <div
                        key={item.id}
                        className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/20"
                      >
                        <img
                          src={item.preview}
                          alt={item.file.name}
                          className="w-full h-full object-cover"
                        />

                        {/* Status overlay */}
                        {item.status === 'uploading' && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          </div>
                        )}
                        {item.status === 'success' && (
                          <div className="absolute inset-0 bg-emerald-900/50 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                          </div>
                        )}
                        {item.status === 'error' && (
                          <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-red-300" />
                          </div>
                        )}

                        {/* Remove button */}
                        {item.status === 'pending' && !uploading && (
                          <button
                            type="button"
                            onClick={() => removeFile(item.id)}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full
                              bg-black/60 text-white/60 hover:text-white flex items-center justify-center"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload result */}
              <AnimatePresence>
                {uploadResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs
                      ${uploadResult.failed === 0
                        ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-300'
                        : 'bg-amber-500/10 border border-amber-400/20 text-amber-300'
                      }`}
                  >
                    {uploadResult.failed === 0 ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    {uploadResult.success} uploaded
                    {uploadResult.failed > 0 && `, ${uploadResult.failed} failed`}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              {pendingCount > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                      bg-blue-500/20 text-blue-300 border border-blue-400/30
                      font-semibold text-sm hover:bg-blue-500/30 transition
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload {pendingCount} Photo{pendingCount !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                  {uploading && (
                    <button
                      type="button"
                      onClick={() => { abortRef.current = true }}
                      className="px-4 py-2.5 rounded-xl text-sm text-red-300/80
                        bg-red-500/10 border border-red-400/20 hover:bg-red-500/20 transition"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}

              {/* Post-upload: clear successes */}
              {successCount > 0 && pendingCount === 0 && !uploading && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="w-full py-2 rounded-xl text-xs text-white/40
                    hover:text-white/60 hover:bg-white/[0.05] transition"
                >
                  Clear completed uploads
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
