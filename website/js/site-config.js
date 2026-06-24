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

// ── Email delivery (FormSubmit — free, no account; emails enquiries to you) ──
// Nothing to configure in code. On the FIRST real enquiry, FormSubmit sends a
// one-time "Activate" email to this address — click the link once and every
// enquiry after that lands in this inbox automatically.
const ENQUIRY_NOTIFY_EMAIL = 'phil@axrik.com';
