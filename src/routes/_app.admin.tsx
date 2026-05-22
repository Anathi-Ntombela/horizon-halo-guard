import { createFileRoute, redirect } from '@tanstack/react-router'
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
import { adminListUsers, adminSetRole } from '@/lib/banking.functions'

export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) throw redirect({ to: '/sign-in' })
    const { data: ok } = await supabase.rpc('has_role', {
      _user_id: sess.session.user.id, _role: 'admin',
    })
    if (!ok) throw redirect({ to: '/' })
  },
  component: AdminPage,
})

function AdminPage() {
  const qc = useQueryClient()
  const list = useServerFn(adminListUsers)
  const setRole = useServerFn(adminSetRole)

  const usersQ = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => list(),
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCog className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Admin console</h1>
          <p className="text-sm text-muted-foreground">Manage user roles. Admins can clear HALO logs and receive critical alerts.</p>
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
              const isAdmin = u.roles.includes('admin')
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
                      variant={isAdmin ? 'outline' : 'default'}
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ target_user_id: u.id, grant: !isAdmin })}
                    >
                      {isAdmin
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
