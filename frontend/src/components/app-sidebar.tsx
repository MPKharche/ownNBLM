"use client"

import * as React from "react"
import { useState } from "react"
import { Link, useLocation } from "react-router-dom"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { clearAuth, getStoredUser } from "@/lib/api"
import {
  BookOpenIcon,
  CommandIcon,
  CreditCardIcon,
  FileUpIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

export const navItems = [
  { title: "Notebooks", url: "/notebooks", icon: BookOpenIcon },
  { title: "Corpus", url: "/corpus", icon: FileUpIcon },
  { title: "Chat", url: "/chat", icon: MessageSquareIcon },
  { title: "Billing", url: "/billing", icon: CreditCardIcon },
  { title: "Admin", url: "/admin", icon: SettingsIcon },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const user = getStoredUser()

  function logout() {
    clearAuth()
    window.location.href = "/login"
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link to="/notebooks" />}
            >
              <CommandIcon className="size-5!" />
              <span className="font-heading text-base font-semibold">ownNBLM</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="px-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = location.pathname.startsWith(item.url)
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  isActive={active}
                  render={<Link to={item.url} />}
                  className="cursor-pointer"
                >
                  <Icon className="size-4" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: user.name, email: user.email, avatar: "" }} onLogout={logout} />
      </SidebarFooter>
    </Sidebar>
  )
}

/** Mobile bottom navigation bar — shown only on small screens.
 *  S20: primary 3 items + a "more" button that reveals Billing and Admin in a bottom sheet.
 */
export function MobileBottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const primaryItems = navItems.slice(0, 3)
  const secondaryItems = navItems.slice(3)
  const isSecondaryActive = secondaryItems.some((i) => location.pathname.startsWith(i.url))

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-background/95 backdrop-blur-sm sm:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon
          const active = location.pathname.startsWith(item.url)
          return (
            <Link
              key={item.url}
              to={item.url}
              onClick={() => setMoreOpen(false)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
                active ? "text-accent" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`size-5 ${active ? "text-accent" : ""}`} />
              <span>{item.title}</span>
            </Link>
          )
        })}
        {/* S20: more button */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
            isSecondaryActive || moreOpen ? "text-accent" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="More navigation items"
          aria-expanded={moreOpen}
        >
          {moreOpen ? <XIcon className="size-5" /> : <MoreHorizontalIcon className="size-5" />}
          <span>More</span>
        </button>
      </nav>

      {/* Bottom sheet for secondary items */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-30 sm:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 border-t border-border bg-background/98 backdrop-blur-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {secondaryItems.map((item) => {
              const Icon = item.icon
              const active = location.pathname.startsWith(item.url)
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-6 py-4 text-sm transition-colors ${
                    active ? "text-accent font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                  <span>{item.title}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
