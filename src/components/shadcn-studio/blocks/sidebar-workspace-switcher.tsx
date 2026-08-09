'use client'

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { ChevronRightIcon, PlusIcon } from "lucide-react"

type Workspace = {
  name: string
  image: string
  workspace: string
}

const workspaces: Workspace[] = [
  {
    name: 'shadcn/studio',
    image: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-16.png',
    workspace: 'Workspace'
  },
  {
    name: 'FlyonUI',
    image: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-15.png',
    workspace: 'Workspace'
  },
  {
    name: 'ThemeSelection',
    image: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-17.png',
    workspace: 'Workspace'
  },
  {
    name: 'Pixinvent',
    image: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-18.png',
    workspace: 'Workspace'
  }
]

const WorkspaceSwitcher = () => {
  const { isMobile } = useSidebar()
  const [activeWorkspace, setActiveWorkspace] = useState(workspaces[0])

  if (!activeWorkspace) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size='lg'
                className='data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground'
              />
            }
          >
            <img src={activeWorkspace.image} alt={activeWorkspace.name} className='size-8' />
            <div className='flex flex-col items-start'>
              <span className='text-sm font-medium'>{activeWorkspace.name}</span>
              <span className='text-xs font-light'>{activeWorkspace.workspace}</span>
            </div>
            <ChevronRightIcon className='ml-auto size-4 transition-transform duration-200 max-lg:rotate-90 [[data-popup-open]>&]:rotate-270 lg:[[data-popup-open]>&]:rotate-180' />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--anchor-width) min-w-56'
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={isMobile ? 8 : 16}
          >
            {workspaces.map(workspace => (
              <DropdownMenuCheckboxItem
                key={workspace.name}
                className='gap-4 px-4 py-2.5 [&>span]:hidden'
                checked={activeWorkspace.name === workspace.name}
                onCheckedChange={() => setActiveWorkspace(workspace)}
              >
                <img src={workspace.image} alt={workspace.name} className='size-9.5' />
                <div className='flex flex-col items-start'>
                  <span className='text-base font-medium'>{workspace.name}</span>
                  <span className='text-muted-foreground! text-sm'>{workspace.workspace}</span>
                </div>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuItem className='bg-primary/10 text-primary mt-1 justify-center'>
              <span>Add New Workspace</span>
              <PlusIcon className='text-primary' />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export default WorkspaceSwitcher
