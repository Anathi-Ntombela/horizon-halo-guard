import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  Home, Landmark, History, Send, Shield, LogOut, Menu, X, UserCog,
} from 'lucide-react'

import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/sign-in' })
  },
  component: AppLayout,
})

type NavItem = { to: string; label: string; icon: any; show: (a: { isAdmin: boolean; isSuperAdmin: boolean; anyAdminExists: boolean }) => boolean }
const NAV: NavItem[] = [
  { to: '/',                   label: 'Home',            icon: Home,     show: () => true },
  { to: '/my-banks',           label: 'My Banks',        icon: Landmark, show: () => true },
  { to: '/transaction-history',label: 'Transactions',    icon: History,  show: () => true },
  { to: '/payment-transfer',   label: 'Payment Transfer',icon: Send,     show: () => true },
  { to: '/halo',               label: 'HALO Security',   icon: Shield,   show: (a) => a.isAdmin },
  { to: '/admin',              label: 'Admin',           icon: UserCog,  show: (a) => a.isSuperAdmin || !a.anyAdminExists },
]

function AppLayout() {
  const { user, isAdmin, isSuperAdmin, anyAdminExists } = useAuth()
  const nav = useNavigate()
  const { location } = useRouterState()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const signOut = async () => {
    await supabase.auth.signOut()
    nav({ to: '/sign-in' })
  }

  const sidebar = (
    <aside className="bg-primary text-primary-foreground w-64 flex-shrink-0 flex flex-col h-full">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-white/10">
        <Shield className="size-6" />
        <span className="text-lg font-bold tracking-tight">HORIZON</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.filter(n => n.show({ isAdmin, isSuperAdmin, anyAdminExists })).map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to
          return (
            <Link key={to} to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
              )}>
              <Icon className="size-4" /> {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-3 mb-2 text-xs text-white/60 truncate">
          {user?.email} {isAdmin && <span className="ml-1 text-emerald-300">• admin</span>}
        </div>
        <Button variant="ghost" onClick={signOut}
          className="w-full justify-start text-white/80 hover:text-white hover:bg-white/10">
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden md:flex">{sidebar}</div>

      <div className={cn(
        'md:hidden fixed inset-0 z-40 transition',
        mobileOpen ? 'visible' : 'invisible pointer-events-none',
      )}>
        <div className={cn('absolute inset-0 bg-black/40 transition-opacity', mobileOpen ? 'opacity-100' : 'opacity-0')}
             onClick={() => setMobileOpen(false)} />
        <div className={cn('absolute inset-y-0 left-0 transition-transform', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
          {sidebar}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><Shield className="size-5" /><span className="font-bold">HORIZON</span></div>
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/10"
            onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X /> : <Menu />}
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
