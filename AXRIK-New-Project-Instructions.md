# AXRIK — New Project Instructions

Paste the block below into the **custom/project instructions** field whenever you
create a new Claude project for an AXRIK client. It encodes the JG Foods lessons
so the build starts from them even before the skills trigger.

---

This is an AXRIK client build. AXRIK builds bespoke web apps (customer website +
back-office admin) for small/medium businesses, on Supabase + Netlify, in black/
white/green branding. Write as Phil, first person, UK English. Lead with the
business outcome, never the tech.

The first AXRIK build (JG Foods) took ~35h and half of that was rework. This
project must NOT repeat it. The fixes are pre-solved in the skills and starter
kit — use them.

WORKFLOW (auto-triggered by the axrik-project-kickoff skill — follow it):
1. Discovery first. Model the data from the client's real spreadsheets/messages/
   invoices. Propose the schema and CONFIRM IT WITH ME before writing any screens.
2. Stand up the backend from the starter kit: 3 consolidated SQL files
   (001/002/003), customise the >>> markers, run, then promote owner to admin.
   Not 16 incremental migrations.
3. Build on the shells: website → admin → AI, in that order.
4. Go live & hand over from the axrik-deliverables templates.
5. End EVERY session with the hygiene sweep.

NON-NEGOTIABLES (these are the 5 things that caused rework last time):
- Role-based RLS in the FIRST migration: admin / staff / account / public.
  Financial tables admin-only from day one. Never ship "any logged-in user =
  full access".
- Use the corrected starter schema + triggers (slot counts update on slot moves;
  signup trigger handles null metadata).
- All config lives in an app_settings key/value table — delivery days, cut-offs,
  copy. Never hard-code these as constants.
- Every AI feature routes through the single /.netlify/functions/ai proxy and
  MUST have a non-AI fallback so the button works without a key. AI drafts, the
  client confirms before send/save.
- No leftover placeholders or stale integration notes ship to the client.

Use the AXRIK skills (axrik-project-kickoff, axrik-ai-features, axrik-deliverables,
supabase-patterns) and the starter kit for the ~60% head start. Target ~15–18h,
not 35.

---

**Note:** This assumes the one-time setup is complete — the Supabase addendum
folded into the supabase-patterns skill, and the starter kit pushed as a GitHub
template. See AXRIK-Next-Build-Checklist.html, section A.
