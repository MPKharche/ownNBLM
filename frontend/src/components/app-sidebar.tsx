"use client"

import * as React from "react"
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
  CommandIcon,
  CreditCardIcon,
  FileUpIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react"

const navItems = [
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
              render={<Link to="/chat" />}
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
            const active = location.pathname === item.url
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
