'use client'
/**
 * Sidebar user dropdown — circular avatar only (no rounded-lg vs after:rounded-full clash).
 * Pattern from dropdown-menu-07 + avatar-05.
 */

import SimpleProfileDropdown from '@/components/shadcn-studio/blocks/dashboard-dropdown-10/simple-profile-dropdown'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useState } from 'react'

type SidebarUserDropdownProps = {
  name?: string
  email?: string
  initials?: string
  onSignOut?: () => void
}

const SidebarUserDropdown = ({
  name = 'Clarity user',
  email = 'Payroll',
  initials = 'CP',
  onSignOut
}: SidebarUserDropdownProps) => {
  const { isMobile } = useSidebar()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleDark = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    setDark(next)
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SimpleProfileDropdown
          align='end'
          dark={dark}
          email={email}
          initials={initials}
          name={name}
          onSignOut={onSignOut ?? (() => undefined)}
          onToggleTheme={toggleDark}
          side={isMobile ? 'bottom' : 'right'}
          sideOffset={isMobile ? 8 : 16}
          trigger={
            <SidebarMenuButton
              className='data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground'
              size='lg'
            >
              <Avatar>
                <AvatarFallback className='text-xs'>{initials}</AvatarFallback>
              </Avatar>
              <div className='grid flex-1 text-left text-sm leading-tight'>
                <span className='truncate font-medium'>{name}</span>
                <span className='text-muted-foreground truncate text-xs'>{email}</span>
              </div>
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export default SidebarUserDropdown
