import { FileTextIcon } from "lucide-react"
import type { Citation } from "@/components/source-excerpt-panel"

type Props = {
  citations?: Citation[]
  onSelect: (c: Citation) => void
}

function chipLabel(c: Citation, index: number): string {
  const name = c.source_name
    ? c.source_name.replace(/\.[^.]+$/, "").slice(0, 28)
    : `Source ${index + 1}`
  const page = c.page ? ` · p.${c.page}` : ""
  return `${name}${page}`
}

export function CitationChips({ citations, onSelect }: Props) {
  if (!citations?.length) return null
  // Deduplicate by source+page so the same page doesn't appear twice
  const seen = new Set<string>()
  const unique = citations.filter((c) => {
    const key = `${c.source_id}:${c.page ?? c.chunk_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unique.map((c, i) => (
        <button
          key={c.chunk_id}
          type="button"
          onClick={() => onSelect(c)}
          title={c.excerpt.slice(0, 120)}
          className="flex cursor-pointer items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
        >
          <FileTextIcon className="size-3 shrink-0" />
          {chipLabel(c, i)}
        </button>
      ))}
    </div>
  )
}
