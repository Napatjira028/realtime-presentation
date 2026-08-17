"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import { Loader2 } from "lucide-react"
import "@/lib/pdf"

interface PdfViewerProps {
  fileUrl: string
  pageNumber: number
  /** Called once the document loads, with its total page count. */
  onNumPages?: (numPages: number) => void
  className?: string
}

/**
 * Renders a single PDF page centered and letterboxed inside its container.
 * The container defines the stage size (e.g. an aspect-video 16:9 box); the
 * page is scaled to fit entirely within it. Client-only (uses pdf.js worker).
 */
export function PdfViewer({ fileUrl, pageNumber, onNumPages, className }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pageAspect, setPageAspect] = useState<number | null>(null) // width / height
  const [error, setError] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setSize({ width: cr.width, height: cr.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit the page inside the container (letterbox): pick width vs height by aspect.
  let renderWidth: number | undefined
  if (size.width && size.height && pageAspect) {
    const containerAspect = size.width / size.height
    renderWidth = pageAspect >= containerAspect ? size.width : size.height * pageAspect
  } else if (size.width) {
    renderWidth = size.width
  }

  const handleDocLoad = useCallback(
    (info: { numPages: number }) => onNumPages?.(info.numPages),
    [onNumPages],
  )

  const fallback = (
    <div className="flex flex-col items-center gap-2 text-background/70">
      <Loader2 className="size-7 animate-spin" aria-hidden="true" />
      <span className="text-xs">Loading presentation…</span>
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center overflow-hidden bg-foreground ${className ?? ""}`}
    >
      {error ? (
        <p className="px-6 text-center text-sm text-background/70 text-pretty">
          Could not load the presentation file.
        </p>
      ) : (
        <Document
          file={fileUrl}
          onLoadSuccess={handleDocLoad}
          onLoadError={() => setError(true)}
          loading={fallback}
          error={
            <p className="px-6 text-center text-sm text-background/70 text-pretty">
              Could not load the presentation file.
            </p>
          }
        >
          <Page
            pageNumber={pageNumber}
            width={renderWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={(page) => setPageAspect(page.width / page.height)}
            loading={fallback}
          />
        </Document>
      )}
    </div>
  )
}
