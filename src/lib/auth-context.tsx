import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

interface AuthCtx {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
}
const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true, isAdmin: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Listener FIRST, then getSession
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s?.user) {
        // defer secondary call
        setTimeout(async () => {
          const { data } = await supabase.rpc('has_role', { _user_id: s.user.id, _role: 'admin' })
          setIsAdmin(!!data)
        }, 0)
      } else {
        setIsAdmin(false)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, isAdmin }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
