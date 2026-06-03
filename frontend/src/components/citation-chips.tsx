import type { Citation } from "@/components/source-excerpt-panel"

type Props = {
  citations?: Citation[]
  onSelect: (c: Citation) => void
}

export function CitationChips({ citations, onSelect }: Props) {
  if (!citations?.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {citations.map((c) => (
        <button
          key={c.chunk_id}
          type="button"
          onClick={() => onSelect(c)}
          className="cursor-pointer rounded border border-border bg-surface px-2 py-1 text-xs transition-colors duration-200 hover:border-accent"
          title="Click to view source"
        >
          [{c.excerpt.slice(0, 40)}…]
        </button>
      ))}
    </div>
  )
}
