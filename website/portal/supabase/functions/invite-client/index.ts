// ============================================================
// AXRIK Portal — Invite / create a client account
// Called by admin.html's New Project form when the client has
// no Supabase account yet, so project creation is one click.
//
// Verifies the caller is an admin, then uses the service role to
// create a CONFIRMED client account (no email sent unless
// send_invite:true). Returns { user_id }.
//
// Deploy: supabase functions deploy invite-client
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
//  are injected automatically — no secrets to set.)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorised' }, 401)

    const { email, full_name, send_invite, redirect_to } = await req.json()
    if (!email) return json({ error: 'Missing email' }, 400)

    const url     = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Verify the caller is an admin (never trust the browser).
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await caller.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorised' }, 401)

    const isAdmin =
      user.user_metadata?.role === 'admin' ||
      user.app_metadata?.role === 'admin'
    if (!isAdmin) {
      const { data: profile } = await caller
        .from('user_profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') return json({ error: 'Admins only' }, 403)
    }

    // 2. Service-role client for the privileged operation.
    const admin = createClient(url, svcKey)

    // Already exists? Return that id (idempotent).
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = list?.users?.find(
      (u) => (u.email || '').toLowerCase() === String(email).toLowerCase(),
    )
    if (existing) return json({ user_id: existing.id, existed: true })

    if (send_invite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name ?? null, role: 'client' },
        redirectTo: redirect_to || undefined,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ user_id: data.user?.id, invited: true })
    }

    // Default: create a confirmed account, no email to the client.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? null, role: 'client' },
    })
    if (error) return json({ error: error.message }, 400)
    return json({ user_id: data.user?.id, created: true })
  } catch (err) {
    console.error('invite-client error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
