// ============================================================
// AXRIK Portal — Supabase Client
// ============================================================

const SUPABASE_URL  = 'https://udwnvezlxdscpvsyuyhe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd252ZXpseGRzY3B2c3l1eWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzMyNzYsImV4cCI6MjA5NTkwOTI3Nn0.NYmKm6MK9j5O40hZUazwHzkKzsQx_6stKHCYDFoZNpo';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
