"use client"

import type { ReactNode } from "react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

// PDF rendering is client-only (pdf.js worker), so load it without SSR.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-foreground">
      <Loader2 className="size-7 animate-spin text-background/70" aria-hidden="true" />
    </div>
  ),
})

interface PdfStageProps {
  fileUrl: string | null
  pageNumber: number
  onNumPages?: (numPages: number) => void
  /** Shown when no file has been uploaded yet. */
  emptyState?: ReactNode
}

/** A 16:9 presentation stage that renders the current PDF page, or an empty state. */
export function PdfStage({ fileUrl, pageNumber, onNumPages, emptyState }: PdfStageProps) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-foreground shadow-sm">
      {fileUrl ? (
        <PdfViewer
          fileUrl={fileUrl}
          pageNumber={pageNumber}
          onNumPages={onNumPages}
          className="size-full"
        />
      ) : (
        <div className="flex size-full items-center justify-center p-6">{emptyState}</div>
      )}
    </div>
  )
}
