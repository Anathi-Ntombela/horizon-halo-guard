import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { logHaloEvent } from '@/lib/halo'
import { preflightSignIn } from '@/lib/banking.functions'

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
})
type FormValues = z.infer<typeof Schema>

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) throw redirect({ to: '/' })
  },
  component: SignInPage,
})

function SignInPage() {
  const [loading, setLoading] = useState(false)
  const preflight = useServerFn(preflightSignIn)
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(Schema),
  })

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      // 1. Pre-flight rate-limit check.
      const pf = await preflight({ data: { email: values.email } }) as
        { blocked: true; blocked_until: string } | { blocked: false }
      if (pf.blocked) {
        toast.error('Too many failed attempts. Please try again later.')
        setLoading(false)
        return
      }

      // 2. Password sign-in.
      const { data, error } = await supabase.auth.signInWithPassword(values)
      if (error) {
        setLoading(false)
        await logHaloEvent('AUTH_FAILURE', { email: values.email, reason: error.message })
        toast.error(error.message)
        return
      }
      await logHaloEvent('AUTH_SUCCESS', { userId: data.user?.id })

      // 3. MFA gate. If TOTP enrolled but session aal is aal1, force /mfa/verify.
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verifiedTotp = (factors?.totp ?? []).find((f) => f.status === 'verified')
      if (verifiedTotp) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal?.currentLevel !== 'aal2') {
          window.location.assign('/mfa/verify')
          return
        }
      }

      toast.success('Signed in')
      // Full reload so AuthProvider + _app beforeLoad see the freshly persisted session.
      window.location.assign('/')
    } catch (err: any) {
      setLoading(false)
      toast.error(err?.message ?? 'Sign-in failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="text-primary" />
          <h1 className="text-2xl font-bold">HORIZON</h1>
        </div>
        <h2 className="text-xl font-semibold">Sign in</h2>
        <p className="text-sm text-muted-foreground mb-6">Welcome back to secure banking</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {formState.errors.email && <p className="text-xs text-destructive mt-1">{formState.errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register('password')} />
            {formState.errors.password && <p className="text-xs text-destructive mt-1">{formState.errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-sm text-center mt-4 text-muted-foreground">
          No account? <Link to="/sign-up" className="text-primary font-medium">Sign up</Link>
        </p>
        <p className="text-xs text-center mt-2 text-muted-foreground">
          <Link to="/security" className="hover:underline">How we protect your data →</Link>
        </p>
      </Card>
    </div>
  )
}
