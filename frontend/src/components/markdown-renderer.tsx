/**
 * MarkdownRenderer — full GFM markdown with dark-theme styling.
 *
 * Features:
 * - GitHub Flavored Markdown: tables, strikethrough, task lists, autolinks
 * - Syntax-highlighted code blocks (dark theme, no extra network requests)
 * - Styled tables, blockquotes, headings, lists
 * - Strips inline [source] / (Source: ...) citation markers — those are
 *   shown as chips instead
 */

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import type { Components } from "react-markdown"

// Patterns that match LLM citation inline markers — stripped from visible text
// Matches: [source], [Source], **(Source: ...)**, (Source: [...])
const CITATION_PATTERN = /(\*\*\(Source:[^)]*\)\*\*|\(Source:[^)]*\)|\[source\]|\[Source\])/gi

function stripCitationMarkers(text: string): string {
  return text.replace(CITATION_PATTERN, "").replace(/\s{2,}/g, " ").trim()
}

// Custom components that wire into .chat-prose styling
const components: Components = {
  // Code blocks — syntax highlighted
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const isBlock = match || (String(children).includes("\n"))
    if (isBlock) {
      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match ? match[1] : "text"}
          PreTag="div"
          customStyle={{
            margin: "0.5rem 0",
            borderRadius: "0.5rem",
            border: "1px solid hsl(222 30% 14%)",
            fontSize: "0.8125rem",
            background: "hsl(222 47% 7%)",
          }}
          codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },

  // Strip citation markers from plain text nodes
  p({ children }) {
    const cleaned = typeof children === "string"
      ? stripCitationMarkers(children)
      : children
    return <p>{cleaned}</p>
  },

  // Tables — rendered by remark-gfm, styled via .chat-prose CSS
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table>{children}</table>
      </div>
    )
  },

  // S12: Cap headings at h3 to avoid competing with page hierarchy.
  // # → h3, ## → h4, ### → h5, #### → h6
  h1: ({ children }) => <h3 className="font-heading">{children}</h3>,
  h2: ({ children }) => <h4 className="font-heading">{children}</h4>,
  h3: ({ children }) => <h5 className="font-heading">{children}</h5>,
  h4: ({ children }) => <h6 className="font-heading">{children}</h6>,
  h5: ({ children }) => <h6 className="font-heading">{children}</h6>,
  h6: ({ children }) => <h6 className="font-heading">{children}</h6>,

  // Links — open in new tab safely
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },

  // Blockquotes — used for direct quotes from source material
  blockquote({ children }) {
    return <blockquote>{children}</blockquote>
  },
}

type Props = {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = "" }: Props) {
  // Pre-process: strip citation markers at the string level too
  // (catches multi-line patterns the node visitor misses)
  const cleaned = content.replace(CITATION_PATTERN, "").replace(/ {2,}/g, " ")

  return (
    <div className={`chat-prose prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  )
}
