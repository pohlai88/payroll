import type { ReactElement } from 'react'

import { IconPlaceholder } from '@/registry/icons/icon-placeholder'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Card } from '@/components/ui/card'
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
  SidebarProvider,
  SidebarTrigger
} from '@/components/ui/sidebar'

import SearchDialog from '@/components/shadcn-studio/blocks/dialog-search'
import ShareDropdown from '@/components/shadcn-studio/blocks/dropdown-share'
import LanguageDropdown from '@/components/shadcn-studio/blocks/dropdown-language'
import ActivityDialog from '@/components/shadcn-studio/blocks/dialog-activity'
import NotificationDropdown from '@/components/shadcn-studio/blocks/dropdown-notification'
import ProfileDropdown from '@/components/shadcn-studio/blocks/dropdown-profile'
import WorkspaceSwitcher from '@/components/shadcn-studio/blocks/sidebar-workspace-switcher'
import FinanceCard from '@/components/shadcn-studio/blocks/chart-finance'
import StatisticsCard, { type StatisticsCardProps } from '@/components/shadcn-studio/blocks/statistics-card-03'
import StatisticsImpressionCard from '@/components/shadcn-studio/blocks/statistics-impression-card'
import StatisticsTotalRevenueCard from '@/components/shadcn-studio/blocks/statistics-total-revenue-card'
import TotalVisitorsCard from '@/components/shadcn-studio/blocks/chart-total-visitors'
import TopProductsCard from '@/components/shadcn-studio/blocks/widget-top-products'
import UserDatatable, { type Item } from '@/components/shadcn-studio/blocks/datatable-user'

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

const menuItems: MenuItem[] = [
  {
    icon: (
      <IconPlaceholder
        lucide='GaugeIcon'
        tabler='IconBrandSpeedtest'
        hugeicons='DashboardSpeed01Icon'
        phosphor='GaugeIcon'
        remixicon='RiDashboard3Line'
      />
    ),
    label: 'Dashboard',
    href: '#'
  }
]

const pagesItems: MenuItem[] = [
  {
    icon: (
      <IconPlaceholder
        lucide='SquareCheckBigIcon'
        tabler='IconCheckbox'
        hugeicons='CheckmarkSquare04Icon'
        phosphor='CheckSquareIcon'
        remixicon='RiCheckboxLine'
      />
    ),
    label: 'Backlog',
    href: '#'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='LayoutListIcon'
        tabler='IconListDetails'
        hugeicons='ParagraphBulletsPoint01Icon'
        phosphor='ListBulletsIcon'
        remixicon='RiListCheck2'
      />
    ),
    label: 'Iterations',
    href: '#'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='CrownIcon'
        tabler='IconCrown'
        hugeicons='CrownIcon'
        phosphor='CrownIcon'
        remixicon='RiVipCrownLine'
      />
    ),
    label: 'Milestones',
    href: '#'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='BugIcon'
        tabler='IconBug'
        hugeicons='Bug01Icon'
        phosphor='BugIcon'
        remixicon='RiBugLine'
      />
    ),
    label: 'Bug Tracker',
    href: '#'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='FoldersIcon'
        tabler='IconFolders'
        hugeicons='FoldersIcon'
        phosphor='FoldersIcon'
        remixicon='RiFoldersLine'
      />
    ),
    label: 'Design Assets',
    items: [
      { label: 'Components', href: '#' },
      { label: 'Icons', href: '#' },
      { label: 'Illustrations', href: '#' }
    ]
  },
  {
    icon: (
      <IconPlaceholder
        lucide='StickyNoteIcon'
        tabler='IconNote'
        hugeicons='StickyNote03Icon'
        phosphor='NoteBlankIcon'
        remixicon='RiStickyNoteLine'
      />
    ),
    label: 'Release Notes',
    href: '#'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='CalendarIcon'
        tabler='IconCalendar'
        hugeicons='Calendar04Icon'
        phosphor='CalendarBlankIcon'
        remixicon='RiCalendarLine'
      />
    ),
    label: 'Campaign Calendar',
    href: '#',
    badge: '3'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='ChartLineIcon'
        tabler='IconChartLine'
        hugeicons='Chart03Icon'
        phosphor='ChartLineIcon'
        remixicon='RiLineChartLine'
      />
    ),
    label: 'Ad Performance',
    items: [
      { label: 'Campaigns', href: '#' },
      { label: 'Ad Groups', href: '#' },
      { label: 'Ads', href: '#', badge: '7' },
      { label: 'Keywords', href: '#' }
    ]
  }
]

const shareData = [
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png',
    name: 'John Garrett',
    email: 'john@example.com',
    role: 'admin'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png',
    name: 'Laura Perez',
    email: 'laura@example.com',
    role: 'can-view'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    name: 'Shane Adkins',
    email: 'shane@example.com',
    role: 'admin'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    name: 'Clara Brady',
    email: 'clara@example.com',
    role: 'can-edit'
  }
]

const morePeople = [
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png',
    name: 'Daisy Mitchell'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-9.png',
    name: 'Stephen Adams'
  }
]

// Statistics card data
const StatisticsCardData: StatisticsCardProps[] = [
  {
    icon: (
      <IconPlaceholder
        lucide='ShoppingCartIcon'
        tabler='IconShoppingCart'
        hugeicons='ShoppingCart01Icon'
        phosphor='ShoppingCartSimpleIcon'
        remixicon='RiShoppingCartLine'
      />
    ),
    title: 'Total Orders',
    value: '155K',
    trend: 'up',
    changePercentage: '+22%',
    badgeContent: 'Last 4 months',
    iconClassName: 'bg-chart-2/10 text-chart-2'
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
    title: 'Total Profit',
    value: '$89.34k',
    trend: 'down',
    changePercentage: '-16%',
    badgeContent: 'Last One year',
    iconClassName: 'bg-chart-3/10 text-chart-3'
  }
]

// Visitor data
const visitorData = [
  {
    product: 'Desktop',
    percentage: 17,
    amount: 23.8,
    trend: 'up',
    heightClass: 'h-[17%]',
    color: 'bg-chart-1'
  },
  {
    product: 'Tablet',
    percentage: 65,
    amount: 13.604,
    trend: 'down',
    heightClass: 'h-[65%]',
    color: 'bg-chart-1/20'
  },
  {
    product: 'Mobile',
    percentage: 18,
    amount: 47.146,
    trend: 'up',
    heightClass: 'h-[18%]',
    color: 'bg-chart-1/50'
  }
]

// Product by sales data
const productsBySalesData = [
  {
    icon: (
      <IconPlaceholder
        lucide='SmartphoneIcon'
        tabler='IconDeviceMobile'
        hugeicons='SmartPhone01Icon'
        phosphor='DeviceMobileCameraIcon'
        remixicon='RiSmartphoneLine'
      />
    ),
    productName: 'Samsung galaxy S25',
    productBrand: 'Samsung',
    sales: '$32,203',
    iconClassName: 'bg-chart-1/10 text-chart-1'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='LaptopIcon'
        tabler='IconDeviceLaptop'
        hugeicons='LaptopIcon'
        phosphor='LaptopIcon'
        remixicon='RiMacbookLine'
      />
    ),
    productName: 'Apple MacBook Pro',
    productBrand: 'Apple',
    sales: '$1,299',
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='HeadphonesIcon'
        tabler='IconHeadphones'
        hugeicons='HeadphonesIcon'
        phosphor='HeadphonesIcon'
        remixicon='RiHeadphoneLine'
      />
    ),
    productName: 'Sony WH-1000XM4',
    productBrand: 'Sony',
    sales: '$348',
    iconClassName: 'bg-chart-5/10 text-chart-5'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='LaptopMinimalIcon'
        tabler='IconDeviceLaptop'
        hugeicons='LaptopIcon'
        phosphor='LaptopIcon'
        remixicon='RiMacbookLine'
      />
    ),
    productName: 'Dell XPS 13',
    productBrand: 'Dell',
    sales: '$999'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='WatchIcon'
        tabler='IconDeviceWatch'
        hugeicons='Watch01Icon'
        phosphor='WatchIcon'
        remixicon='RiTimer2Line'
      />
    ),
    productName: 'Smart band 4',
    productBrand: 'Xiaomi',
    sales: '$749',
    iconClassName: 'bg-chart-3/10 text-chart-3'
  }
]

// Products by volume data
const productsByVolumeData = [
  {
    icon: (
      <IconPlaceholder
        lucide='LaptopIcon'
        tabler='IconDeviceLaptop'
        hugeicons='LaptopIcon'
        phosphor='LaptopIcon'
        remixicon='RiMacbookLine'
      />
    ),
    productName: 'Dell XPS 13',
    productBrand: 'Dell',
    volume: '200k',
    changePercentage: 5,
    iconClassName: 'bg-chart-1/10 text-chart-1'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='TabletIcon'
        tabler='IconDeviceTablet'
        hugeicons='Tablet01Icon'
        phosphor='DeviceTabletCameraIcon'
        remixicon='RiTabletLine'
      />
    ),
    productName: 'Apple iPad',
    productBrand: 'Apple',
    volume: '80K',
    changePercentage: 10,
    iconClassName: 'bg-chart-2/10 text-chart-2'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='Gamepad2Icon'
        tabler='IconDeviceGamepad2'
        hugeicons='GameController03Icon'
        phosphor='GameControllerIcon'
        remixicon='RiGamepadLine'
      />
    ),
    productName: 'Sony PlayStation 5',
    productBrand: 'Sony',
    volume: '30k',
    changePercentage: -20,
    iconClassName: 'bg-chart-5/10 text-chart-5'
  },
  {
    icon: (
      <IconPlaceholder
        lucide='MonitorIcon'
        tabler='IconDeviceDesktop'
        hugeicons='ComputerIcon'
        phosphor='MonitorIcon'
        remixicon='RiComputerLine'
      />
    ),
    productName: 'IMac pro',
    productBrand: 'Apple',
    volume: '15k',
    changePercentage: 12
  },
  {
    icon: (
      <IconPlaceholder
        lucide='SmartphoneIcon'
        tabler='IconDeviceMobile'
        hugeicons='SmartPhone01Icon'
        phosphor='DeviceMobileCameraIcon'
        remixicon='RiSmartphoneLine'
      />
    ),
    productName: 'Samsung galaxy S25',
    productBrand: 'Samsung',
    volume: '12.4k',
    changePercentage: -15,
    iconClassName: 'bg-chart-3/10 text-chart-3'
  }
]

// User data for datatable
const userData: Item[] = [
  {
    id: '1',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png',
    fallback: 'JA',
    user: 'Jack Alfredo',
    email: 'jack.alfredo@shadcnstudio.com',
    role: 'maintainer',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'active'
  },
  {
    id: '2',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png',
    fallback: 'SM',
    user: 'Sarah Mitchell',
    email: 'sarah.mitchell@company.com',
    role: 'admin',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'active'
  },
  {
    id: '3',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    fallback: 'RC',
    user: 'Robert Chen',
    email: 'robert.chen@startup.io',
    role: 'editor',
    plan: 'team',
    billing: 'manual-paypal',
    status: 'pending'
  },
  {
    id: '4',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png',
    fallback: 'EW',
    user: 'Emily Wilson',
    email: 'emily.wilson@freelance.com',
    role: 'author',
    plan: 'basic',
    billing: 'manual-cash',
    status: 'inactive'
  },
  {
    id: '5',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
    fallback: 'DG',
    user: 'David Garcia',
    email: 'david.garcia@agency.net',
    role: 'subscriber',
    plan: 'company',
    billing: 'auto-debit',
    status: 'active'
  },
  {
    id: '6',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    fallback: 'LT',
    user: 'Lisa Thompson',
    email: 'lisa.thompson@design.co',
    role: 'editor',
    plan: 'team',
    billing: 'manual-paypal',
    status: 'active'
  },
  {
    id: '7',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png',
    fallback: 'MA',
    user: 'Michael Anderson',
    email: 'michael.anderson@tech.com',
    role: 'maintainer',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'pending'
  },
  {
    id: '8',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png',
    fallback: 'JR',
    user: 'Jessica Rodriguez',
    email: 'jessica.rodriguez@startup.com',
    role: 'author',
    plan: 'basic',
    billing: 'manual-cash',
    status: 'active'
  },
  {
    id: '9',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-9.png',
    fallback: 'CB',
    user: 'Christopher Brown',
    email: 'chris.brown@corporate.org',
    role: 'admin',
    plan: 'company',
    billing: 'auto-debit',
    status: 'inactive'
  },
  {
    id: '10',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-10.png',
    fallback: 'AD',
    user: 'Amanda Davis',
    email: 'amanda.davis@marketing.io',
    role: 'subscriber',
    plan: 'basic',
    billing: 'manual-paypal',
    status: 'active'
  },
  {
    id: '11',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-11.png',
    fallback: 'JJ',
    user: 'James Johnson',
    email: 'james.johnson@development.com',
    role: 'maintainer',
    plan: 'team',
    billing: 'auto-debit',
    status: 'pending'
  },
  {
    id: '12',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-12.png',
    fallback: 'MW',
    user: 'Maria Williams',
    email: 'maria.williams@creative.net',
    role: 'editor',
    plan: 'company',
    billing: 'manual-cash',
    status: 'active'
  },
  {
    id: '13',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-13.png',
    fallback: 'RT',
    user: 'Ryan Taylor',
    email: 'ryan.taylor@studio.com',
    role: 'author',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'inactive'
  },
  {
    id: '14',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-14.png',
    fallback: 'NK',
    user: 'Nicole Kim',
    email: 'nicole.kim@digital.agency',
    role: 'subscriber',
    plan: 'team',
    billing: 'manual-paypal',
    status: 'active'
  },
  {
    id: '15',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-15.png',
    fallback: 'AL',
    user: 'Andrew Lee',
    email: 'andrew.lee@consulting.biz',
    role: 'admin',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'pending'
  },
  {
    id: '16',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-16.png',
    fallback: 'SM',
    user: 'Stephanie Martinez',
    email: 'stephanie.martinez@media.com',
    role: 'editor',
    plan: 'basic',
    billing: 'manual-cash',
    status: 'active'
  },
  {
    id: '17',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-17.png',
    fallback: 'KW',
    user: 'Kevin White',
    email: 'kevin.white@innovation.co',
    role: 'maintainer',
    plan: 'company',
    billing: 'auto-debit',
    status: 'inactive'
  },
  {
    id: '18',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-18.png',
    fallback: 'RH',
    user: 'Rachel Harris',
    email: 'rachel.harris@solutions.org',
    role: 'author',
    plan: 'team',
    billing: 'manual-paypal',
    status: 'active'
  },
  {
    id: '19',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-19.png',
    fallback: 'BT',
    user: 'Brian Turner',
    email: 'brian.turner@platform.io',
    role: 'subscriber',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'pending'
  },
  {
    id: '20',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-20.png',
    fallback: 'CM',
    user: 'Catherine Moore',
    email: 'catherine.moore@ventures.com',
    role: 'admin',
    plan: 'basic',
    billing: 'manual-cash',
    status: 'active'
  },
  {
    id: '21',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png',
    fallback: 'TN',
    user: 'Thomas Nelson',
    email: 'thomas.nelson@design.studio',
    role: 'editor',
    plan: 'enterprise',
    billing: 'auto-debit',
    status: 'active'
  },
  {
    id: '22',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png',
    fallback: 'SP',
    user: 'Sophie Parker',
    email: 'sophie.parker@freelance.pro',
    role: 'author',
    plan: 'team',
    billing: 'manual-paypal',
    status: 'inactive'
  },
  {
    id: '23',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    fallback: 'AR',
    user: 'Alexander Reed',
    email: 'alex.reed@innovation.labs',
    role: 'maintainer',
    plan: 'company',
    billing: 'manual-cash',
    status: 'pending'
  },
  {
    id: '24',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png',
    fallback: 'MG',
    user: 'Maya Gonzalez',
    email: 'maya.gonzalez@creative.agency',
    role: 'subscriber',
    plan: 'basic',
    billing: 'auto-debit',
    status: 'active'
  },
  {
    id: '25',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
    fallback: 'JS',
    user: 'Jordan Smith',
    email: 'jordan.smith@tech.solutions',
    role: 'admin',
    plan: 'enterprise',
    billing: 'manual-paypal',
    status: 'pending'
  }
]

const SidebarGroupedMenuItems = ({ data, groupLabel }: { data: MenuItem[]; groupLabel?: string }) => {
  return (
    <SidebarGroup>
      {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {data.map(item =>
            item.items ? (
              <Collapsible className='group/collapsible' key={item.label}>
                <SidebarMenuItem>
                  <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.label} />}>
                    {item.icon}
                    <span>{item.label}</span>
                    <IconPlaceholder
                      lucide='ChevronRightIcon'
                      tabler='IconChevronRight'
                      hugeicons='ArrowRight01Icon'
                      phosphor='CaretRightIcon'
                      remixicon='RiArrowRightSLine'
                      className='ml-auto transition-transform duration-200 group-data-panel-open/menu-button:rotate-90'
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
                <SidebarMenuButton tooltip={item.label} render={<a href={item.href} />}>
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
  )
}

const DashboardShell = () => {
  return (
    <div className='flex min-h-dvh w-full'>
      <SidebarProvider>
        <Sidebar collapsible='icon'>
          <SidebarHeader>
            <WorkspaceSwitcher />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroupedMenuItems data={menuItems} />
            <SidebarGroupedMenuItems data={pagesItems} groupLabel='Useful Pages' />
          </SidebarContent>
          <SidebarFooter className='gap-4 p-3 transition-[padding] duration-200 [[data-state=collapsed]_&]:p-2'>
            <div className='flex flex-col gap-4 overflow-hidden rounded-lg border p-4 [[data-state=collapsed]_&]:hidden'>
              <p className='truncate text-xl font-semibold'>Upgrade Your Plan</p>
              <p className='line-clamp-3 text-sm'>
                Your trial plan ends in 12 days. Upgrade your plan and unlock full potential!
              </p>
              <Progress value={50} className='**:data-[slot=progress-track]:h-1.5' />
              <Button className='truncate'>See All Plans</Button>
            </div>
            <Button className='bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40'>
              <span className='truncate [[data-state=collapsed]_&]:hidden'>Add new workspace</span>
              <IconPlaceholder
                lucide='PlusIcon'
                tabler='IconPlus'
                hugeicons='PlusSignIcon'
                phosphor='PlusIcon'
                remixicon='RiAddLine'
              />
            </Button>
          </SidebarFooter>
        </Sidebar>
        <div className='flex flex-1 flex-col'>
          <header className='before:bg-background/60 sticky top-0 z-50 before:absolute before:inset-0 before:mask-[linear-gradient(var(--card),var(--card)_18%,transparent_100%)] before:backdrop-blur-md'>
            <div className='bg-card relative z-51 mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-308 items-center justify-between rounded-xl border px-6 py-2 shadow-sm sm:w-[calc(100%-3rem)]'>
              <div className='flex items-center gap-1.5 sm:gap-4'>
                <SidebarTrigger className='[&_svg]:size-5!' />
                <Separator orientation='vertical' className='hidden h-4! data-vertical:self-center sm:block' />
                <SearchDialog
                  className='w-full max-w-72'
                  trigger={
                    <>
                      <Button
                        variant='ghost'
                        className='text-muted-foreground! w-full justify-start bg-transparent! px-1 py-0 font-normal active:not-aria-[haspopup]:translate-y-0 max-lg:hidden'
                      >
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
                      <Button variant='ghost' size='icon-lg' className='lg:hidden'>
                        <IconPlaceholder
                          lucide='SearchIcon'
                          tabler='IconSearch'
                          hugeicons='SearchIcon'
                          phosphor='MagnifyingGlassIcon'
                          remixicon='RiSearchLine'
                        />
                        <span className='sr-only'>Search</span>
                      </Button>
                    </>
                  }
                />
              </div>
              <div className='flex items-center gap-1.5'>
                <ShareDropdown
                  data={shareData}
                  morePeople={morePeople}
                  trigger={
                    <Button variant='ghost' size='icon-lg'>
                      <IconPlaceholder
                        lucide='Share2Icon'
                        tabler='IconShare'
                        hugeicons='Share08Icon'
                        phosphor='ShareNetworkIcon'
                        remixicon='RiShare2Line'
                      />
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
            <div className='grid grid-cols-6 gap-6'>
              <FinanceCard className='col-span-full xl:col-span-4' />

              <div className='col-span-full grid grid-cols-2 gap-6 lg:col-span-3 xl:col-span-2'>
                {StatisticsCardData.map((card, index) => (
                  <StatisticsCard
                    key={index}
                    icon={card.icon}
                    title={card.title}
                    value={card.value}
                    trend={card.trend}
                    changePercentage={card.changePercentage}
                    badgeContent={card.badgeContent}
                    iconClassName={card.iconClassName}
                  />
                ))}

                <StatisticsTotalRevenueCard />

                <StatisticsImpressionCard />
              </div>

              <TotalVisitorsCard
                title='Total visitors'
                totalVisitors='23.02K'
                percentage={-6}
                visitorData={visitorData}
                className='col-span-full lg:col-span-3 xl:col-span-2'
              />

              <TopProductsCard
                salesTitle='Top Products by Sales'
                volumeTitle='Top Products by Volume'
                productsBySalesData={productsBySalesData}
                productsByVolumeData={productsByVolumeData}
                className='col-span-full xl:col-span-4'
              />

              <Card className='col-span-full py-0 shadow-none'>
                <UserDatatable data={userData} />
              </Card>
            </div>
          </main>
          <footer>
            <div className='text-muted-foreground mx-auto flex size-full max-w-7xl items-center justify-between gap-3 px-4 py-3 max-sm:flex-col sm:gap-6 sm:px-6'>
              <p className='text-sm text-balance max-sm:text-center'>
                {`©${new Date().getFullYear()}`}{' '}
                <a href='#' className='text-primary'>
                  shadcn/studio
                </a>
                , Made for better web design
              </p>
              <div className='text-muted-foreground *:hover:text-primary flex items-center gap-5'>
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

export default DashboardShell
