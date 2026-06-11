import { FileTextIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

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
  const label = citation.source_name
    ? citation.source_name.replace(/\.[^.]+$/, "") // strip extension
    : "Source"
  const pageLabel = citation.page ? `Page ${citation.page}` : null

  return (
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 cursor-pointer p-1"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </Button>
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
    </aside>
  )
}
