import type { CSSProperties, ReactElement } from 'react'

import { IconPlaceholder } from '@/registry/icons/icon-placeholder'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider
} from '@/components/ui/sidebar'

import MenuTrigger from '@/components/shadcn-studio/blocks/menu-trigger'
import SearchDialog from '@/components/shadcn-studio/blocks/dialog-search'
import LanguageDropdown from '@/components/shadcn-studio/blocks/dropdown-language'
import ActivityDialog from '@/components/shadcn-studio/blocks/dialog-activity'
import NotificationDropdown from '@/components/shadcn-studio/blocks/dropdown-notification'
import ProfileDropdown from '@/components/shadcn-studio/blocks/dropdown-profile'
import SidebarUserDropdown from '@/components/shadcn-studio/blocks/sidebar-user-dropdown'

import LogoSvg from '@/assets/svg/logo'
import FacebookIcon from '@/assets/svg/facebook-icon'
import InstagramIcon from '@/assets/svg/instagram-icon'
import LinkedinIcon from '@/assets/svg/linkedin-icon'
import TwitterIcon from '@/assets/svg/twitter-icon'

type MenuSubItem = {
  label: string
  href: string
  badge?: string
}

type MenuItem = {
  icon: ReactElement
  label: string
} & (
  | {
      href: string
      badge?: string
      items?: never
    }
  | { href?: never; badge?: never; items: MenuSubItem[] }
)

type RecipientsItem = {
  name: string
  avatarSrc: string
  href: string
}

const pagesItems: MenuItem[] = [
  {
    icon: (
      <IconPlaceholder
        lucide='HomeIcon'
        tabler='IconHome'
        hugeicons='Home03Icon'
        phosphor='HouseIcon'
        remixicon='RiHome4Line'
      />
    ),
    label: 'Home',
    href: '#'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='WalletIcon'
        tabler='IconWallet'
        hugeicons='WalletIcon'
        phosphor='WalletIcon'
        remixicon='RiWalletLine'
      />
    ),
    label: 'Wallet Management',
    items: [
      { label: 'Account Overview', href: '#' },
      { label: 'Available Funds', href: '#' },
      { label: 'Transaction History', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='ArrowRightLeftIcon'
        tabler='IconArrowsRightLeft'
        hugeicons='ArrowLeftRightIcon'
        phosphor='ArrowsLeftRightIcon'
        remixicon='RiArrowLeftRightLine'
      />
    ),
    label: 'Money Transfers',
    items: [
      { label: 'Transfer Overview', href: '#' },
      { label: 'Transfer Methods', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='CirclePlusIcon'
        tabler='IconCirclePlus'
        hugeicons='AddCircleIcon'
        phosphor='PlusCircleIcon'
        remixicon='RiAddCircleLine'
      />
    ),
    label: 'Deposit Funds',
    items: [
      { label: 'Deposit Amount', href: '#' },
      { label: 'Payment Method', href: '#' },
      { label: 'Confirmation', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='ArrowDownLeftIcon'
        tabler='IconArrowDownLeft'
        hugeicons='ArrowDownLeft01Icon'
        phosphor='ArrowDownLeftIcon'
        remixicon='RiArrowLeftDownLongLine'
      />
    ),
    label: 'Request Funds',
    items: [
      { label: 'Request Details', href: '#' },
      { label: 'Amount to Request', href: '#' },
      { label: 'Share Request', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='DollarSignIcon'
        tabler='IconCurrencyDollar'
        hugeicons='Dollar02Icon'
        phosphor='CurrencyDollarIcon'
        remixicon='RiMoneyDollarCircleLine'
      />
    ),
    label: 'Payment Requests',
    items: [
      { label: 'Request Overview', href: '#' },
      { label: 'Payment Details', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='PackageIcon'
        tabler='IconPackage'
        hugeicons='PackageIcon'
        phosphor='PackageIcon'
        remixicon='RiBox3Line'
      />
    ),
    label: 'Order Management',
    items: [
      { label: 'Order Overview', href: '#' },
      { label: 'Add New Order', href: '#' },
      { label: 'View Orders', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='UsersIcon'
        tabler='IconUsers'
        hugeicons='UserMultiple03Icon'
        phosphor='UsersIcon'
        remixicon='RiGroupLine'
      />
    ),
    label: 'User Management',
    items: [
      { label: 'Users Overview', href: '#' },
      { label: 'Active Users', href: '#' }
    ]
  }
]

const recipientsItems: RecipientsItem[] = [
  {
    name: 'Liam Anderson',
    avatarSrc: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    href: '#'
  },
  {
    name: 'Emma Smith',
    avatarSrc: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png',
    href: '#'
  },
  {
    name: 'Ethan Bennett',
    avatarSrc: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
    href: '#'
  },
  {
    name: 'Olivia Morgan',
    avatarSrc: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    href: '#'
  },
  {
    name: 'Noah Carter',
    avatarSrc: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png',
    href: '#'
  },
  {
    name: 'Ava Thompson',
    avatarSrc: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png',
    href: '#'
  }
]

const ApplicationShell = () => {
  return (
    <div className='bg-muted before:bg-primary relative flex min-h-dvh w-full before:fixed before:inset-x-0 before:top-0 before:h-105'>
      <SidebarProvider
        style={
          {
            '--sidebar': 'var(--card)',
            '--sidebar-width': '17.5rem',
            '--sidebar-width-icon': '3.375rem'
          } as CSSProperties
        }
      >
        <Sidebar
          variant='floating'
          collapsible='icon'
          className='p-6 pr-0 *:data-[slot=sidebar-inner]:group-data-[variant=floating]:rounded-xl'
        >
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size='lg' className='gap-2.5 bg-transparent! [&>svg]:size-8' render={<a href='#' />}>
                  <LogoSvg className='[&_rect]:fill-sidebar [&_rect:first-child]:fill-primary' />
                  <span className='text-xl font-semibold'>Payment</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Pages</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pagesItems.map(item =>
                    item.items ? (
                      <Collapsible className='group/collapsible' key={item.label}>
                        <SidebarMenuItem>
                          <CollapsibleTrigger render={<SidebarMenuButton />}>
                            {item.icon}
                            <span>{item.label}</span>
                            <IconPlaceholder
                              lucide='ChevronRightIcon'
                              tabler='IconChevronRight'
                              hugeicons='ArrowRight01Icon'
                              phosphor='CaretRightIcon'
                              remixicon='RiArrowRightSLine'
                              className='ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90'
                            />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.items.map(subItem => (
                                <SidebarMenuSubItem key={subItem.label}>
                                  <SidebarMenuSubButton className='justify-between' render={<a href={subItem.href} />}>
                                    {subItem.label}
                                    {subItem.badge && (
                                      <span className='bg-primary/10 flex h-5 min-w-5 items-center justify-center rounded-full text-xs'>
                                        {subItem.badge}
                                      </span>
                                    )}
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    ) : (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton render={<a href={item.href} />}>
                          {item.icon}
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {item.badge && (
                          <SidebarMenuBadge className='bg-primary/10 top-1/2! right-2 -translate-y-1/2! rounded-full'>
                            {item.badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    )
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Recipients</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recipientsItems.map(recipient => (
                    <SidebarMenuItem key={recipient.name}>
                      <SidebarMenuButton render={<a href={recipient.href} />}>
                        <Avatar className='size-6 transition-[width,height] duration-200 [[data-state=collapsed]_&]:size-4'>
                          <AvatarImage src={recipient.avatarSrc} alt={recipient.name} />
                          <AvatarFallback>
                            {recipient.name
                              .split(' ')
                              .map(n => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>{recipient.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarUserDropdown />
          </SidebarFooter>
        </Sidebar>
        <div className='z-1 flex flex-1 flex-col py-6'>
          <header className='text-primary-foreground'>
            <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 sm:px-6'>
              <div className='flex items-center gap-4'>
                <MenuTrigger
                  variant='outline'
                  className='bg-primary-foreground! border-primary-foreground! text-primary! shadow-none'
                />
                <div className='hidden sm:flex sm:flex-col sm:items-start'>
                  <p className='text-lg font-semibold'>Hey, John</p>
                  <p className='text-primary-foreground/50 md:max-lg:hidden'>Welcome back to dashboard</p>
                </div>
              </div>
              <SearchDialog
                className='hidden w-full max-w-72 xl:block'
                trigger={
                  <Button className='bg-secondary/20 text-muted hover:bg-secondary/20 aria-expanded:bg-secondary aria-expanded:text-muted w-full justify-start font-normal active:not-aria-[haspopup]:translate-y-0'>
                    <IconPlaceholder
                      lucide='SearchIcon'
                      tabler='IconSearch'
                      hugeicons='SearchIcon'
                      phosphor='MagnifyingGlassIcon'
                      remixicon='RiSearchLine'
                      className='size-4'
                    />
                    <span>Type to search...</span>
                  </Button>
                }
              />
              <div className='flex items-center gap-1.5'>
                <SearchDialog
                  className='block xl:hidden'
                  trigger={
                    <Button variant='ghost' size='icon-lg'>
                      <IconPlaceholder
                        lucide='SearchIcon'
                        tabler='IconSearch'
                        hugeicons='SearchIcon'
                        phosphor='MagnifyingGlassIcon'
                        remixicon='RiSearchLine'
                      />
                      <span className='sr-only'>Search</span>
                    </Button>
                  }
                />
                <LanguageDropdown
                  trigger={
                    <Button variant='ghost' size='icon-lg'>
                      <IconPlaceholder
                        lucide='LanguagesIcon'
                        tabler='IconLanguage'
                        hugeicons='LanguageCircleIcon'
                        phosphor='TranslateIcon'
                        remixicon='RiTranslate2'
                      />
                    </Button>
                  }
                />
                <ActivityDialog
                  trigger={
                    <Button variant='ghost' size='icon-lg'>
                      <IconPlaceholder
                        lucide='ActivityIcon'
                        tabler='IconActivity'
                        hugeicons='WaveTriangleIcon'
                        phosphor='Pulse'
                        remixicon='RiPulseLine'
                      />
                    </Button>
                  }
                />
                <NotificationDropdown
                  trigger={
                    <Button variant='ghost' size='icon-lg' className='relative'>
                      <IconPlaceholder
                        lucide='BellIcon'
                        tabler='IconBell'
                        hugeicons='Notification01Icon'
                        phosphor='BellIcon'
                        remixicon='RiNotificationLine'
                      />
                      <span className='bg-destructive absolute top-[14%] right-[23%] size-2 rounded-full' />
                    </Button>
                  }
                />
                <ProfileDropdown
                  trigger={
                    <Button variant='ghost' size='icon-lg'>
                      <Avatar className='size-[inherit] rounded-[inherit] after:rounded-[inherit]'>
                        <AvatarImage
                          src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png'
                          className='rounded-[inherit]'
                        />
                        <AvatarFallback className='rounded-[inherit]'>JD</AvatarFallback>
                      </Avatar>
                    </Button>
                  }
                />
              </div>
            </div>
          </header>
          <main className='mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6'>
            <div className='mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3'>
              <Card className='h-32'>
                <CardContent className='h-full'>
                  <div className='h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]' />
                </CardContent>
              </Card>
              <Card className='h-32'>
                <CardContent className='h-full'>
                  <div className='h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]' />
                </CardContent>
              </Card>
              <Card className='h-32'>
                <CardContent className='h-full'>
                  <div className='h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]' />
                </CardContent>
              </Card>
            </div>
            <Card className='h-250'>
              <CardContent className='h-full'>
                <div className='h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]' />
              </CardContent>
            </Card>
          </main>
          <footer>
            <div className='text-muted-foreground mx-auto flex size-full max-w-7xl items-center justify-between gap-3 px-4 max-sm:flex-col sm:gap-6 sm:px-6'>
              <p className='text-sm text-balance max-sm:text-center'>
                {`©${new Date().getFullYear()}`}{' '}
                <a href='#' className='text-primary'>
                  shadcn/studio
                </a>
                , Made for better web design
              </p>
              <div className='flex items-center gap-5'>
                <a href='#'>
                  <FacebookIcon className='size-4' />
                </a>
                <a href='#'>
                  <InstagramIcon className='size-4' />
                </a>
                <a href='#'>
                  <LinkedinIcon className='size-4' />
                </a>
                <a href='#'>
                  <TwitterIcon className='size-4' />
                </a>
              </div>
            </div>
          </footer>
        </div>
      </SidebarProvider>
    </div>
  )
}

export default ApplicationShell
