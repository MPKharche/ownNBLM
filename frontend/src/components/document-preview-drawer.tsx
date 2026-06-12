/**
 * DocumentPreviewDrawer — inline PDF/text viewer that opens from citation chips
 * or corpus page. Renders the file in an <iframe> at the correct page.
 */

import { ExternalLinkIcon, XIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { sourcePreviewUrl } from "@/lib/api"

type Props = {
  sourceId: string
  sourceName: string
  page?: number
  onClose: () => void
}

export function DocumentPreviewDrawer({ sourceId, sourceName, page, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Build URL — PDF.js in browsers honors #page=N fragment
  const baseUrl = sourcePreviewUrl(sourceId)
  const isPdf = sourceName.toLowerCase().endsWith(".pdf")
  const iframeUrl = isPdf && page ? `${baseUrl}#page=${page}` : baseUrl

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Close on backdrop click
  function onBackdrop(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  const label = sourceName.replace(/\.[^.]+$/, "")

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onBackdrop}
    >
      <div className="flex h-[92svh] w-full max-w-4xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:h-[88svh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{label}</p>
            {page && (
              <p className="text-xs text-muted-foreground">Page {page}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3.5" />
              Open in tab
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close preview"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-hidden">
          {isPdf ? (
            <iframe
              src={iframeUrl}
              className="h-full w-full border-0"
              title={`Preview: ${sourceName}`}
            />
          ) : (
            /* For markdown/text: fetch and render as pre */
            <TextPreview url={baseUrl} />
          )}
        </div>
      </div>
    </div>
  )
}

function TextPreview({ url }: { url: string }) {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then((t) => { if (ref.current) ref.current.textContent = t })
      .catch(() => { if (ref.current) ref.current.textContent = "Failed to load preview." })
  }, [url])

  return (
    <pre
      ref={ref}
      className="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-foreground/80"
    >
      Loading…
    </pre>
  )
}
