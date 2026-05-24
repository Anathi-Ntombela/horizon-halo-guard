import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logHaloEvent } from '@/lib/halo'

export const Route = createFileRoute('/mfa/verify')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/sign-in' })
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') throw redirect({ to: '/' })
  },
  component: MfaVerifyPage,
})

function MfaVerifyPage() {
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState<string>('')
  const [verifying, setVerifying] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [emailHint, setEmailHint] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = (factors?.totp ?? []).find((f) => f.status === 'verified')
      if (totp) setFactorId(totp.id)
      const { data: sess } = await supabase.auth.getSession()
      setEmailHint(sess.session?.user.email ?? '')
    })()
  }, [])

  useEffect(() => {
    if (code.length === 6 && factorId && !verifying) verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const verify = async () => {
    if (!factorId) return
    setVerifying(true)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr) throw cErr
      const { error } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code,
      })
      if (error) {
        setAttempt((a) => a + 1)
        await logHaloEvent('MFA_FAILURE', {
          factorId, attempt: attempt + 1, email: emailHint,
        }, 'high')
        throw error
      }
      await logHaloEvent('MFA_VERIFIED', { factorId }, 'low')
      window.location.assign('/')
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid code')
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="text-primary" />
          <h1 className="text-2xl font-bold">HORIZON</h1>
        </div>
        <h2 className="text-xl font-semibold">Verify it's you</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Enter the 6-digit code from your authenticator app.
        </p>

        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          autoFocus
          disabled={verifying}
        />
        <p className="text-xs text-muted-foreground mt-2">
          {verifying ? 'Verifying…' : 'Open your authenticator app to get your code'}
        </p>

        <p className="text-xs text-center mt-6 text-muted-foreground">
          <Link to="/security" className="hover:underline">Security overview →</Link>
        </p>
      </Card>
    </div>
  )
}
