import { useLocation } from "react-router-dom"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { MoonIcon, SunIcon } from "lucide-react"
import { navItems } from "@/components/app-sidebar"

type Props = {
  theme: "dark" | "light"
  onThemeToggle: () => void
}

export function SiteHeader({ theme, onThemeToggle }: Props) {
  const location = useLocation()
  const current = navItems.find((n) => location.pathname.startsWith(n.url))

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 backdrop-blur-sm transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-2 px-3 lg:px-4">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-auto" />

        {/* Breadcrumb */}
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="hidden text-muted-foreground sm:block">ownNBLM</span>
          {current && (
            <>
              <span className="hidden text-muted-foreground/50 sm:block">/</span>
              <span className="font-medium text-foreground">{current.title}</span>
            </>
          )}
        </div>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onThemeToggle}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
