import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
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

const Schema = z.object({
  first_name: z.string().min(1).max(60),
  last_name: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  ssn_last4: z.string().regex(/^\d{4}$/, '4 digits'),
  address: z.string().min(1).max(120),
  city: z.string().min(1).max(60),
  state: z.string().min(2).max(2),
  postal_code: z.string().min(4).max(10),
})
type FormValues = z.infer<typeof Schema>

export const Route = createFileRoute('/sign-up')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) throw redirect({ to: '/' })
  },
  component: SignUpPage,
})

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}

function SignUpPage() {
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(Schema) })

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          first_name: values.first_name,
          last_name: values.last_name,
          dob: values.dob,
          ssn_last4: values.ssn_last4,
          address: values.address,
          city: values.city,
          state: values.state,
          postal_code: values.postal_code,
        },
      },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    await logHaloEvent('SESSION_CREATED', { userId: data.user?.id })
    toast.success('Account created')
    nav({ to: '/' })
  }

  const e = formState.errors
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <Card className="w-full max-w-2xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="text-primary" />
          <h1 className="text-2xl font-bold">HORIZON</h1>
        </div>
        <h2 className="text-xl font-semibold">Create your account</h2>
        <p className="text-sm text-muted-foreground mb-6">Banking secured by HALO</p>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First name" error={e.first_name?.message}><Input {...register('first_name')} /></Field>
          <Field label="Last name"  error={e.last_name?.message}><Input {...register('last_name')} /></Field>
          <Field label="Email"      error={e.email?.message}><Input type="email" {...register('email')} /></Field>
          <Field label="Password"   error={e.password?.message}><Input type="password" {...register('password')} /></Field>
          <Field label="Date of birth" error={e.dob?.message}><Input type="date" {...register('dob')} /></Field>
          <Field label="SSN (last 4)"  error={e.ssn_last4?.message}><Input maxLength={4} {...register('ssn_last4')} /></Field>
          <div className="md:col-span-2"><Field label="Address" error={e.address?.message}><Input {...register('address')} /></Field></div>
          <Field label="City" error={e.city?.message}><Input {...register('city')} /></Field>
          <Field label="State (2)" error={e.state?.message}><Input maxLength={2} {...register('state')} /></Field>
          <Field label="Postal code" error={e.postal_code?.message}><Input {...register('postal_code')} /></Field>
          <div className="md:col-span-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </div>
        </form>
        <p className="text-sm text-center mt-4 text-muted-foreground">
          Have an account? <Link to="/sign-in" className="text-primary font-medium">Sign in</Link>
        </p>
      </Card>
    </div>
  )
}
