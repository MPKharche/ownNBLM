import { Button } from "@/components/ui/button"

export type Citation = {
  source_id: string
  page?: number
  chunk_id: string
  excerpt: string
}

type Props = {
  citation: Citation
  onClose: () => void
}

export function SourceExcerptPanel({ citation, onClose }: Props) {
  return (
    <aside className="panel-slide w-72 shrink-0 border-l border-border bg-card p-4 text-sm">
      <h3 className="font-heading font-medium">Source excerpt</h3>
      <p className="mt-2 text-muted-foreground">Page {citation.page ?? "?"}</p>
      <p className="mt-3 leading-relaxed">{citation.excerpt}</p>
      <Button type="button" variant="ghost" size="sm" className="mt-4 cursor-pointer" onClick={onClose}>
        Close
      </Button>
    </aside>
  )
}
