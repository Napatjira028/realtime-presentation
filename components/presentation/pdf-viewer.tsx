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
 * Renders one PDF page at high resolution and fits it inside
 * the presentation container without cropping.
 */
export function PdfViewer({
  fileUrl,
  pageNumber,
  onNumPages,
  className,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [size, setSize] = useState({
    width: 0,
    height: 0,
  })

  const [pageAspect, setPageAspect] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const [pixelRatio, setPixelRatio] = useState(1)

  // Detect real screen pixel density.
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Limit to 2.5 to keep the slide very sharp
      // without making PDF rendering unnecessarily heavy.
      setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5))
    }
  }, [])

  // Watch the actual presentation area.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateSize = () => {
      const rect = el.getBoundingClientRect()

      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    updateSize()

    const observer = new ResizeObserver(() => {
      updateSize()
    })

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  // Fit PDF completely inside the stage.
  let renderWidth: number | undefined

  if (size.width > 0 && size.height > 0 && pageAspect) {
    const containerAspect = size.width / size.height

    if (pageAspect >= containerAspect) {
      renderWidth = size.width
    } else {
      renderWidth = size.height * pageAspect
    }
  } else if (size.width > 0) {
    renderWidth = size.width
  }

  const handleDocLoad = useCallback(
    (info: { numPages: number }) => {
      setError(false)
      onNumPages?.(info.numPages)
    },
    [onNumPages],
  )

  const fallback = (
    <div className="flex flex-col items-center gap-2 text-background/70">
      <Loader2
        className="size-7 animate-spin"
        aria-hidden="true"
      />
      <span className="text-xs">
        Loading presentation…
      </span>
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={`relative flex size-full items-center justify-center overflow-hidden bg-foreground ${
        className ?? ""
      }`}
    >
      {error ? (
        <p className="px-6 text-center text-sm text-background/70">
          Could not load the presentation file.
        </p>
      ) : (
        <Document
          file={fileUrl}
          onLoadSuccess={handleDocLoad}
          onLoadError={() => setError(true)}
          loading={fallback}
          error={
            <p className="px-6 text-center text-sm text-background/70">
              Could not load the presentation file.
            </p>
          }
        >
          {renderWidth ? (
            <Page
              key={`${pageNumber}-${Math.round(renderWidth)}-${pixelRatio}`}
              pageNumber={pageNumber}
              width={renderWidth}
              devicePixelRatio={pixelRatio}
              renderMode="canvas"
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(page) => {
                setPageAspect(page.width / page.height)
              }}
              loading={fallback}
            />
          ) : (
            fallback
          )}
        </Document>
      )}
    </div>
  )
}