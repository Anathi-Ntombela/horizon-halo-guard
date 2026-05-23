import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

interface AuthCtx {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  anyAdminExists: boolean
}
const Ctx = createContext<AuthCtx>({
  session: null, user: null, loading: true,
  isAdmin: false, isSuperAdmin: false, anyAdminExists: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [anyAdminExists, setAnyAdminExists] = useState(true)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s?.user) {
        setTimeout(async () => {
          const [{ data: admin }, { data: sup }, { count }] = await Promise.all([
            supabase.rpc('has_role', { _user_id: s.user.id, _role: 'admin' }),
            supabase.rpc('is_super_admin', { _user_id: s.user.id }),
            supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
          ])
          setIsAdmin(!!admin)
          setIsSuperAdmin(!!sup)
          setAnyAdminExists((count ?? 0) > 0)
        }, 0)
      } else {
        setIsAdmin(false)
        setIsSuperAdmin(false)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, isAdmin, isSuperAdmin, anyAdminExists }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
