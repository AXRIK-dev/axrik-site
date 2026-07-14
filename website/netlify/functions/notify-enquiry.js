// ============================================================
// AXRIK — enquiry email alert via Resend
// Called by the website contact form AFTER the enquiry has been
// safely saved to Supabase. Sends a notification to Phil.
//
// Requires one environment variable on the Netlify site:
//   RESEND_API_KEY  — from resend.com → API Keys
// ============================================================

const NOTIFY_TO = 'phil@axrik.com';
const FROM = 'AXRIK Website <enquiries@axrik.com>'; // domain must be verified in Resend

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const name = clean(data.name, 200);
  const business = clean(data.business, 200);
  const email = clean(data.email, 320);
  const message = clean(data.message, 5000);

  if (!name || !email || !message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set on this Netlify site');
    return { statusCode: 500, body: JSON.stringify({ error: 'Email not configured' }) };
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <h2 style="margin:0 0 16px;">New AXRIK enquiry</h2>
    <table cellpadding="6" style="border-collapse:collapse; font-family:sans-serif; font-size:14px;">
      <tr><td style="color:#666;">Name</td><td><b>${esc(name)}</b></td></tr>
      <tr><td style="color:#666;">Business</td><td>${esc(business) || '—'}</td></tr>
      <tr><td style="color:#666;">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
    </table>
    <p style="font-family:sans-serif; font-size:14px; white-space:pre-wrap; border-left:3px solid #007B5F; padding-left:12px;">${esc(message)}</p>
    <p style="font-family:sans-serif; font-size:12px; color:#999;">Also saved in the enquiries table in Supabase.</p>`;

  const send = async (from) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [NOTIFY_TO],
        reply_to: email,
        subject: `New AXRIK enquiry from ${name}${business ? ' (' + business + ')' : ''}`,
        html
      })
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  };

  try {
    // Try the branded sender first; if axrik.com isn't verified in Resend yet,
    // fall back to Resend's built-in sender (delivers to the account owner).
    let result = await send(FROM);
    if (!result.ok) {
      console.warn('Branded send failed, falling back to onboarding sender:', result.status, result.body);
      result = await send('AXRIK Website <onboarding@resend.dev>');
    }
    if (!result.ok) {
      console.error('Resend error', result.status, result.body);
      return { statusCode: 502, body: JSON.stringify({ error: 'Email send failed' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Resend request failed', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Email send failed' }) };
  }
};
