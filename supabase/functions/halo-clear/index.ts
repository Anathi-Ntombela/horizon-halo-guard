// Admin-only: clears the HALO event log.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const { data: userData } = await admin.auth.getUser(auth.replace('Bearer ', ''))
  const userId = userData.user?.id
  if (!userId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' })
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await admin.from('halo_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
