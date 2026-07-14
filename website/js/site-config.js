// ============================================================
// AXRIK public site — Supabase + FormSubmit config
// Single source of truth for the marketing site's backend.
// Same Supabase project as the client portal.
// ============================================================

const SUPABASE_URL  = 'https://udwnvezlxdscpvsyuyhe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd252ZXpseGRzY3B2c3l1eWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzMyNzYsImV4cCI6MjA5NTkwOTI3Nn0.NYmKm6MK9j5O40hZUazwHzkKzsQx_6stKHCYDFoZNpo';

// Supabase client (anon). RLS protects the data — anon key is safe in the browser.
const db = (window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;
window.db = db; // expose for other scripts (main.js)

// ── Email delivery ──────────────────────────────────────────
// Alerts are sent by the Netlify function /netlify/functions/notify-enquiry
// using Resend. Set RESEND_API_KEY in the Netlify site's environment variables.
