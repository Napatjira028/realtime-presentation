"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import { Loader2 } from "lucide-react"
import "@/lib/pdf"

interface PdfViewerProps {
  fileUrl: string
  pageNumber: number
  onNumPages?: (numPages: number) => void
  className?: string
}

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

  let renderWidth: number | undefined

  if (size.width > 0 && size.height > 0 && pageAspect) {
    const containerAspect = size.width / size.height

    renderWidth =
      pageAspect >= containerAspect
        ? size.width
        : size.height * pageAspect
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
              key={`${pageNumber}-${Math.round(renderWidth)}`}
              pageNumber={pageNumber}
              width={renderWidth}

              devicePixelRatio={2.5}

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