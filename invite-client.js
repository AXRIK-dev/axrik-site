#!/usr/bin/env node
// ============================================================
// AXRIK Portal — Create/invite a client's Supabase account
// Usage:
//   node invite-client.js <email> "<Business or full name>"
//   node invite-client.js info@evanscommercialfinance.co.uk "Evans Commercial Finance"
//
// Creates a CONFIRMED auth account (role=client) so the portal's
// New Project form can find it. No email is sent to the client
// unless you pass --invite (then a Supabase invite email goes out).
//
// Secrets live in portal-config.js (git-ignored — never committed).
// ============================================================

const { SUPABASE_URL, SERVICE_ROLE_KEY } = require('./portal-config.js');

const args     = process.argv.slice(2);
const sendInv  = args.includes('--invite');
const rest     = args.filter(a => a !== '--invite');
const email    = rest[0];
const fullName = rest[1] || null;

if (!email) {
  console.error('Usage: node invite-client.js <email> "<name>" [--invite]');
  process.exit(1);
}

const headers = {
  apikey:          SERVICE_ROLE_KEY,
  Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type':  'application/json',
};

async function findByEmail(addr) {
  // Admin list is paginated; scan pages until found or exhausted.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) break;
    const data  = await res.json();
    const users = data.users || data;
    if (!users.length) break;
    const hit = users.find(u => (u.email || '').toLowerCase() === addr.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

(async () => {
  try {
    const existing = await findByEmail(email);
    if (existing) {
      console.log(`✓ Account already exists for ${email}`);
      console.log(`  user_id: ${existing.id}`);
      if (sendInv) {
        // Existing user: send a "set your password" (recovery) email so they can log in.
        const rec = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
          method: 'POST', headers, body: JSON.stringify({ email }),
        });
        if (rec.ok) console.log(`  ✉  Set-password email sent to ${email} — they click the link, choose a password, then log in at axrik.com/portal/login.html`);
        else console.log(`  (Could not send set-password email: ${(await rec.text()).slice(0,160)})`);
      } else {
        console.log('  → Create the project in the portal now.');
        console.log('  → To let them log in, re-run with --invite (emails a set-password link).');
      }
      return;
    }

    if (sendInv) {
      // Sends a Supabase invite email so the client sets their own password.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ email, data: { full_name: fullName, role: 'client' } }),
      });
      const data = await res.json();
      if (!res.ok) { console.error('Error:', data.msg || data.error || JSON.stringify(data)); process.exit(1); }
      console.log(`✓ Invite email sent to ${email}`);
      console.log(`  user_id: ${data.id}`);
      return;
    }

    // Default: create a confirmed account, no email to the client.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: 'client' },
      }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('Error:', data.msg || data.error || JSON.stringify(data)); process.exit(1); }

    console.log(`✓ Client account created for ${email}`);
    console.log(`  user_id: ${data.id}`);
    console.log('  → Create the project in the portal now.');
    console.log('  → When ready to give them login access, run again with --invite,');
    console.log('    or send a password reset from the Supabase dashboard.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
