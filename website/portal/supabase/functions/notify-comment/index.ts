// ============================================================
// AXRIK Portal — WhatsApp Notification Edge Function
// Sends Phil a WhatsApp message via Twilio when a client
// posts a comment in the portal.
//
// Deploy: supabase functions deploy notify-comment
// Set secrets:
//   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxx
//   supabase secrets set TWILIO_AUTH_TOKEN=your_token
//   supabase secrets set TWILIO_FROM_NUMBER=whatsapp:+14155238886
//   supabase secrets set PHIL_WHATSAPP_NUMBER=whatsapp:+44XXXXXXXXXX
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { project_id, project_name, message } = await req.json()

    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get caller's name from their profile
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name, business_name')
      .eq('id', user?.id)
      .single()

    const clientName = profile?.business_name || profile?.full_name || user?.email || 'A client'

    // Build WhatsApp message
    const whatsappBody = `🔔 *New message on AXRIK Portal*\n\n*Client:* ${clientName}\n*Project:* ${project_name || 'Unknown'}\n\n"${message}"\n\nReply at: axrik.com/portal/admin.html`

    // Send via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')!    // e.g. whatsapp:+14155238886
    const toNumber   = Deno.env.get('PHIL_WHATSAPP_NUMBER')!  // e.g. whatsapp:+447XXXXXXXXX

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To:   toNumber,
          Body: whatsappBody,
        }),
      }
    )

    if (!twilioResponse.ok) {
      const errorBody = await twilioResponse.text()
      console.error('Twilio error:', errorBody)
      // Don't fail the whole request — notification is best-effort
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('notify-comment error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
