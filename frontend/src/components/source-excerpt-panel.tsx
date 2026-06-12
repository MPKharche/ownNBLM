import { FileTextIcon, MaximizeIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DocumentPreviewDrawer } from "@/components/document-preview-drawer"

export type Citation = {
  source_id: string
  source_name?: string
  page?: number
  chunk_id: string
  excerpt: string
}

type Props = {
  citation: Citation
  onClose: () => void
}

export function SourceExcerptPanel({ citation, onClose }: Props) {
  const [showPreview, setShowPreview] = useState(false)
  const label = citation.source_name
    ? citation.source_name.replace(/\.[^.]+$/, "")
    : "Source"
  const pageLabel = citation.page ? `Page ${citation.page}` : null

  return (
    <>
      <aside className="panel-slide flex w-80 shrink-0 flex-col border-l border-border bg-card text-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium" title={citation.source_name}>{label}</p>
              {pageLabel && (
                <p className="text-xs text-muted-foreground">{pageLabel}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {citation.source_id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="p-1.5 cursor-pointer"
                onClick={() => setShowPreview(true)}
                title="Open document"
              >
                <MaximizeIcon className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-1.5 cursor-pointer"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>

        {/* Excerpt */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Relevant excerpt
          </p>
          <blockquote className="border-l-2 border-accent pl-3 italic leading-relaxed text-foreground/90">
            {citation.excerpt}
          </blockquote>
        </div>

        {/* Footer — open full doc */}
        {citation.source_id && (
          <div className="shrink-0 border-t border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
            >
              <MaximizeIcon className="size-3.5" />
              View in document{citation.page ? ` (p.${citation.page})` : ""}
            </button>
          </div>
        )}
      </aside>

      {showPreview && citation.source_id && (
        <DocumentPreviewDrawer
          sourceId={citation.source_id}
          sourceName={citation.source_name ?? "Document"}
          page={citation.page}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}
