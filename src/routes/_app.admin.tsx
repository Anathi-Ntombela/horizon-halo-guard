import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Shield, ShieldOff, UserCog } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/lib/auth-context'
import { adminListUsers, adminSetRole, bootstrapAdmin } from '@/lib/banking.functions'

export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) throw redirect({ to: '/sign-in' })
    const { data: isSuper } = await supabase.rpc('is_super_admin', { _user_id: sess.session.user.id })
    if (isSuper) return
    // Allow access when no admin exists yet — user can claim the super-admin slot.
    const { count } = await supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count ?? 0) > 0) throw redirect({ to: '/' })
  },
  component: AdminPage,
})

function AdminPage() {
  const qc = useQueryClient()
  const { isSuperAdmin: isAdmin } = useAuth()
  const nav = useNavigate()
  const list = useServerFn(adminListUsers)
  const setRole = useServerFn(adminSetRole)
  const bootstrap = useServerFn(bootstrapAdmin)

  const usersQ = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => list(),
    enabled: isAdmin,
  })

  const mut = useMutation({
    mutationFn: (v: { target_user_id: string; grant: boolean }) =>
      setRole({ data: { target_user_id: v.target_user_id, role: 'admin', grant: v.grant } }),
    onSuccess: (_d, v) => {
      toast.success(v.grant ? 'Admin role granted' : 'Admin role revoked')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  })

  const claim = useMutation({
    mutationFn: () => bootstrap(),
    onSuccess: async (r) => {
      if (r.promoted) {
        toast.success('You are now the HORIZON administrator')
        // refresh auth context isAdmin flag
        await supabase.auth.refreshSession()
        nav({ to: '/admin', replace: true })
        window.location.reload()
      } else {
        toast.error('Admin already exists — ask them to grant you the role')
      }
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not claim admin'),
  })

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <Card className="p-8 text-center space-y-4">
          <Shield className="size-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Claim admin role</h1>
          <p className="text-sm text-muted-foreground">
            No admin has been set up for this HORIZON instance yet. As the first
            administrator you'll receive HALO security alerts by email and gain
            access to the HALO Security console.
          </p>
          <Button onClick={() => claim.mutate()} disabled={claim.isPending} size="lg">
            {claim.isPending ? 'Claiming…' : 'Make me the first admin'}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCog className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Admin console</h1>
          <p className="text-sm text-muted-foreground">Manage user roles. Admins can clear HALO logs and receive critical alerts by email.</p>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(usersQ.data ?? []).map((u: any) => {
              const userIsAdmin = u.roles.includes('admin')
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.first_name} {u.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {u.roles.length === 0
                      ? <Badge variant="outline">user</Badge>
                      : u.roles.map((r: string) => (
                          <Badge key={r} className="mr-1" variant={r === 'admin' ? 'default' : 'secondary'}>{r}</Badge>
                        ))}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={userIsAdmin ? 'outline' : 'default'}
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ target_user_id: u.id, grant: !userIsAdmin })}
                    >
                      {userIsAdmin
                        ? <><ShieldOff className="size-3.5 mr-1" /> Revoke admin</>
                        : <><Shield className="size-3.5 mr-1" /> Make admin</>}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {usersQ.isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {usersQ.data?.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No users yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
