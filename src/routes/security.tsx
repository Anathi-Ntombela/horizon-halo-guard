import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  Shield, Lock, Activity, Scale, MailWarning, ArrowLeft, CalendarClock,
} from 'lucide-react'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const Route = createFileRoute('/security')({
  component: SecurityPage,
})

function SectionCard({
  icon: Icon, title, children,
}: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="text-primary mt-1">•</span>
      <span>{children}</span>
    </li>
  )
}

function SecurityPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session))
  }, [])

  const reviewMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to={authed ? '/' : '/sign-in'}
                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-4" /> {authed ? 'Back to app' : 'Back to sign in'}
          </Link>
        </div>

        <header className="text-center space-y-2">
          <Shield className="size-10 text-primary mx-auto" />
          <h1 className="text-3xl font-bold">Security at HORIZON</h1>
          <p className="text-sm text-muted-foreground">
            How HORIZON and HALO keep your money and your data safe.
          </p>
        </header>

        <SectionCard icon={Lock} title="How we protect your data">
          <ul className="space-y-2">
            <Bullet>256-bit AES encryption at rest (Lovable Cloud infrastructure)</Bullet>
            <Bullet>TLS 1.2+ encryption in transit on all connections</Bullet>
            <Bullet>Passwords hashed with bcrypt — never stored or logged in plaintext</Bullet>
            <Bullet>Sessions delivered as HttpOnly, Secure cookies — inaccessible to JavaScript</Bullet>
            <Bullet>Multi-factor authentication required for all administrator accounts</Bullet>
          </ul>
        </SectionCard>

        <SectionCard icon={Activity} title="How HALO monitors for threats">
          <ul className="space-y-2">
            <Bullet>Real-time event monitoring across all banking actions</Bullet>
            <Bullet>Honeypot decoy endpoints that detect active probing instantly</Bullet>
            <Bullet>Brute force detection with automatic account blocking</Bullet>
            <Bullet>Anomalous transfer detection on high-value or unusual payments</Bullet>
            <Bullet>Social engineering pattern detection on suspicious transfer behaviour</Bullet>
            <Bullet>Admin alerts dispatched within seconds of any critical event</Bullet>
          </ul>
        </SectionCard>

        <SectionCard icon={Scale} title="Regulatory compliance">
          <ul className="space-y-2">
            <Bullet>Protection of Personal Information Act (POPIA) — Act 4 of 2013</Bullet>
            <Bullet>Cybercrimes Act — Act 19 of 2020</Bullet>
            <Bullet>South African Reserve Bank (SARB) Prudential Standards</Bullet>
          </ul>
        </SectionCard>

        <SectionCard icon={MailWarning} title="Report a security concern">
          <Alert>
            <MailWarning className="size-4" />
            <AlertTitle>Responsible disclosure</AlertTitle>
            <AlertDescription>
              If you believe you have identified a security vulnerability in HORIZON,
              contact our security team at <strong>security@horizonbank.co.za</strong>.
            </AlertDescription>
          </Alert>
        </SectionCard>

        <SectionCard icon={CalendarClock} title="Last security review">
          <p className="text-sm">{reviewMonth}</p>
        </SectionCard>
      </div>
    </div>
  )
}
