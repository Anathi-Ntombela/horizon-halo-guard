import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Shield, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logHaloEvent } from '@/lib/halo'

export const Route = createFileRoute('/mfa/setup')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/sign-in' })
  },
  component: MfaSetupPage,
})

function MfaSetupPage() {
  const nav = useNavigate()
  const [qr, setQr] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [enrolling, setEnrolling] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Clean up any unverified factors so enroll doesn't fail.
        const { data: existing } = await supabase.auth.mfa.listFactors()
        for (const f of existing?.totp ?? []) {
          if (f.status !== 'verified') {
            await supabase.auth.mfa.unenroll({ factorId: f.id })
          }
        }
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `HORIZON ${new Date().toISOString().slice(0, 10)}`,
        })
        if (cancelled) return
        if (error) throw error
        setFactorId(data.id)
        setQr(data.totp.qr_code)
        setSecret(data.totp.secret)
      } catch (err: any) {
        toast.error(err?.message ?? 'Could not start MFA enrollment')
      } finally {
        if (!cancelled) setEnrolling(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (code.length === 6 && factorId && !verifying) verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const verify = async () => {
    if (!factorId) return
    setVerifying(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) throw error
      await logHaloEvent('MFA_ENROLLED', { factorId }, 'low')
      toast.success('Multi-factor authentication enabled')
      nav({ to: '/' })
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid code — try again')
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
        <h2 className="text-xl font-semibold">Set up multi-factor authentication</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Scan this code with Google Authenticator, 1Password, Authy, or any TOTP app.
        </p>

        {enrolling && <p className="text-sm">Generating your secret…</p>}

        {qr && (
          <div className="space-y-4">
            <div className="flex justify-center bg-white p-4 rounded border">
              <img src={qr} alt="MFA QR code" className="w-44 h-44" />
            </div>
            <div className="text-xs text-muted-foreground">
              Can't scan? Enter this secret manually:
              <div className="mt-1 font-mono text-[11px] bg-slate-100 p-2 rounded break-all select-all">
                {secret}
              </div>
            </div>
            <div>
              <Label htmlFor="code">Enter the 6-digit code from your app</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={verifying}
                autoFocus
              />
              {verifying && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Verifying…
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-center mt-6 text-muted-foreground">
          <Link to="/security" className="hover:underline">Why MFA matters →</Link>
        </p>
      </Card>
    </div>
  )
}
