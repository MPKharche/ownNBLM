import { AppSidebar } from "@/components/app-sidebar"

import { SiteHeader } from "@/components/site-header"

import { TooltipProvider } from "@/components/ui/tooltip"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"



type Props = {

  children: React.ReactNode

  theme: "dark" | "light"

  onThemeToggle: () => void

}



export function AppShell({ children, theme, onThemeToggle }: Props) {

  return (

    <TooltipProvider>

      <SidebarProvider

        style={

          {

            "--sidebar-width": "16rem",

            "--header-height": "3rem",

          } as React.CSSProperties

        }

      >

        <AppSidebar variant="inset" />

        <SidebarInset>

          <SiteHeader theme={theme} onThemeToggle={onThemeToggle} />

          <main className="flex flex-1 flex-col">{children}</main>

        </SidebarInset>

      </SidebarProvider>

    </TooltipProvider>

  )

}

