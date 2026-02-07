'use client'

import { useEffect, useState, useRef, type RefObject } from 'react'

type RenditionVariant = 'thumb_sm' | 'thumb_md' | 'web' | 'original'

interface ResponsiveImageResult {
  src: string
  currentVariant: RenditionVariant
  isLoading: boolean
}

interface PhotoRenditions {
  thumb_sm?: string
  thumb_md?: string
  web?: string
  original: string
}

const BREAKPOINTS: { maxWidth: number; variant: RenditionVariant }[] = [
  { maxWidth: 200, variant: 'thumb_sm' },
  { maxWidth: 400, variant: 'thumb_md' },
  { maxWidth: 1200, variant: 'web' },
]

function selectVariant(containerWidth: number, dpr: number): RenditionVariant {
  const effectiveWidth = containerWidth * Math.min(dpr, 2)
  for (const bp of BREAKPOINTS) {
    if (effectiveWidth <= bp.maxWidth) return bp.variant
  }
  return 'original'
}

/**
 * Adobe-style responsive image hook.
 * Monitors container size via ResizeObserver and returns the optimal rendition URL.
 * Automatically bumps up one tier on high-DPI (Retina) screens.
 */
export function useResponsiveImage(
  renditions: PhotoRenditions,
  containerRef: RefObject<HTMLElement | null>
): ResponsiveImageResult {
  const [currentVariant, setCurrentVariant] = useState<RenditionVariant>('thumb_sm')
  const [isLoading, setIsLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1

    const updateVariant = (width: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const next = selectVariant(width, dpr)
        setCurrentVariant((prev) => {
          if (prev !== next) setIsLoading(true)
          return next
        })
      }, 100)
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateVariant(entry.contentRect.width)
      }
    })

    observer.observe(el)
    // Initial measurement
    updateVariant(el.clientWidth)

    return () => {
      observer.disconnect()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [containerRef])

  // Resolve the URL — fall back down through available renditions
  const src =
    renditions[currentVariant] ||
    renditions.web ||
    renditions.thumb_md ||
    renditions.thumb_sm ||
    renditions.original

  return { src, currentVariant, isLoading }
}

/**
 * Build rendition URLs from a photo ID using CDN or signed proxy.
 */
export function buildRenditions(
  photoId: string,
  cdnBaseUrl?: string,
  signedOriginalUrl?: string
): PhotoRenditions {
  const base = cdnBaseUrl || ''
  const prefix = base ? `${base}/renditions/${photoId}` : `/api/photos/${photoId}/image`

  if (base) {
    return {
      thumb_sm: `${prefix}/thumb_sm.webp`,
      thumb_md: `${prefix}/thumb_md.webp`,
      web: `${prefix}/web.webp`,
      original: signedOriginalUrl || `${prefix}/original`,
    }
  }

  // Signed proxy fallback (local dev / no CDN)
  return {
    thumb_sm: `${prefix}?type=thumb_sm`,
    thumb_md: `${prefix}?type=thumb_md`,
    web: `${prefix}?type=web`,
    original: signedOriginalUrl || `${prefix}?type=original`,
  }
}
