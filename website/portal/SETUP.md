# AXRIK Client Portal — Setup Guide

Full setup guide. Allow about 45–60 minutes including EmailJS and Twilio.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon public key** from Settings → API
3. Open `supabase.js` and replace:
   ```js
   const SUPABASE_URL  = 'https://xxxx.supabase.co';
   const SUPABASE_ANON = 'eyJ...';
   ```

---

## 2. Run the database schema

**Step 1 — Base schema** (run first):
Paste `supabase-setup.sql` into Supabase Dashboard → SQL Editor → Run

**Step 2 — Phase 2 tables** (run after):
Paste `supabase-updates.sql` → Run

This creates all tables: `user_profiles`, `projects`, `project_updates`, `documents`, `comments`, `document_requests`, `approvals`, `support_requests`, `invoices`, `stage_ratings`

### Helper RPCs (required)

Run in SQL Editor:

```sql
-- Lets admin look up a user's ID by email (for creating projects)
CREATE OR REPLACE FUNCTION get_user_id_by_email(email_address TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_id UUID;
BEGIN
  IF NOT ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  SELECT id INTO user_id FROM auth.users WHERE email = email_address LIMIT 1;
  RETURN user_id;
END;
$$;

-- Lets admin look up a client's email by ID (for sending notifications)
CREATE OR REPLACE FUNCTION get_user_email_by_id(user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE user_email TEXT;
BEGIN
  IF NOT ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = user_id;
  RETURN user_email;
END;
$$;
```

---

## 3. Create the Storage bucket

1. Supabase Dashboard → Storage → New bucket
2. **Name:** `portal-documents` — **Public:** OFF — **Max size:** 51200 KB

Storage RLS policies (add in Storage → Policies):

```sql
-- Upload
(bucket_id = 'portal-documents') AND (auth.uid() IS NOT NULL)
-- Download
(bucket_id = 'portal-documents') AND (auth.uid() IS NOT NULL)
-- Delete
(bucket_id = 'portal-documents') AND (auth.uid() IS NOT NULL)
```

---

## 4. Create your admin account

1. Supabase Dashboard → Authentication → Users → Invite user → your email
2. Accept the invite, set a password
3. Run in SQL Editor:
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
   WHERE email = 'your@email.com';
   ```
4. Log in at `axrik.com/portal/login.html` → you'll land on `admin.html`

---

## 5. Set up EmailJS (email notifications)

Clients get emailed when you post updates, reply to messages, or send approvals.
You get emailed when clients message you or respond to approvals.

### Create an EmailJS account

1. Go to [emailjs.com](https://www.emailjs.com) — free tier gives 200 emails/month
2. Add an email service (Gmail works fine) — note the **Service ID**
3. Note your **Public Key** from Account → API Keys

### Update auth.js

Open `auth.js` and fill in:
```js
const EMAILJS_SERVICE_ID = 'service_xxxxxxx';
const EMAILJS_PUBLIC_KEY = 'xxxxxxxxxxxx';
const PHIL_EMAIL         = 'hello@axrik.com';
```

### Create email templates in EmailJS Dashboard

Create these 7 templates (Template ID → set in `EMAIL_TEMPLATES` in auth.js):

| Template ID key      | Subject                                | Variables used |
|---------------------|---------------------------------------|----------------|
| `buildUpdate`        | "Update on your {{project_name}} build" | `to_name`, `project_name`, `message`, `stage`, `portal_url` |
| `newComment`         | "New message from AXRIK — {{project_name}}" | `to_name`, `project_name`, `message`, `portal_url` |
| `clientComment`      | "{{client_name}} messaged you — {{project_name}}" | `client_name`, `project_name`, `message`, `admin_url` |
| `approvalNeeded`     | "Please review: {{approval_title}}"   | `to_name`, `project_name`, `approval_title`, `preview_url`, `portal_url` |
| `approvalResponse`   | "{{client_name}} responded to an approval" | `client_name`, `project_name`, `approval_title`, `status`, `notes`, `admin_url` |
| `supportReceived`    | "New support request — {{project_name}}" | `client_name`, `project_name`, `title`, `description`, `admin_url` |
| `invoiceIssued`      | "New invoice: {{invoice_title}}"      | `to_name`, `project_name`, `invoice_title`, `amount`, `due_date`, `portal_url` |

Each template should include the variables above and a link back to the portal.

---

## 6. Set up WhatsApp notifications (Twilio)

For instant WhatsApp messages when a client posts a comment.

1. [Twilio account](https://www.twilio.com) → enable WhatsApp Sandbox
2. Join sandbox from your WhatsApp number
3. Install Supabase CLI and deploy the function:
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
   supabase secrets set TWILIO_AUTH_TOKEN=your_token
   supabase secrets set TWILIO_FROM_NUMBER=whatsapp:+14155238886
   supabase secrets set PHIL_WHATSAPP_NUMBER=whatsapp:+447XXXXXXXXX
   supabase functions deploy notify-comment
   ```

---

## 7. Deploy to Netlify

Push to GitHub — Netlify auto-deploys. Portal is live at `axrik.com/portal/login.html`.

Clean URL redirects (add to `netlify.toml` at site root):
```toml
[[redirects]]
  from = "/portal"
  to   = "/portal/login.html"
  status = 200
```

---

## 8. Day-to-day workflow

### New client
1. Supabase → Authentication → Invite user → their email (they set a password)
2. Admin panel → "New project" → enter their email + details
3. Their portal is live immediately

### As you build
From `admin.html` → click the project kanban card, then:

| Tab | What to do |
|-----|-----------|
| **Overview** | Change stage, post build updates (paste Loom URL to embed video), update preview URL, internal notes |
| **File requests** | Add a checklist of files you need — client sees to-do items with upload buttons |
| **Approvals** | Post designs/pages for sign-off — client approves or requests changes, you get notified |
| **Files** | View & download everything the client has uploaded |
| **Messages** | Full message thread — reply directly, client gets emailed |
| **Invoices** | Create invoices, mark as paid — client sees them in their portal |
| **Support** | View and manage post-launch change requests |

### Stage updates trigger
- Moving to **Review**: client should have had approval requests posted
- Moving to **Live**: confetti celebration on client's dashboard + referral prompt shown
- Between stages: client is prompted for a satisfaction rating (😞 to 🤩)

---

## Feature summary

| Feature | Client | Admin |
|---------|--------|-------|
| Build progress (kanban stages) | ✅ See current stage + progress bar | ✅ Drag/update stage |
| Build updates feed | ✅ Timestamped timeline | ✅ Post updates + Loom video embeds |
| "What we need from you" banner | ✅ Shows outstanding actions | — |
| File upload | ✅ Drag & drop, labelled | ✅ Download client files |
| Document request checklist | ✅ Tick off with upload buttons | ✅ Create file requests |
| Approvals | ✅ Approve or request changes | ✅ Post items for sign-off |
| Messages | ✅ Chat thread | ✅ Reply, email notification |
| WhatsApp notification | — | ✅ Instant ping on new message |
| Email notifications | ✅ On update/message/invoice | ✅ On comment/approval response |
| Invoice tracker | ✅ View outstanding + paid | ✅ Create, mark paid |
| Post-launch support requests | ✅ Submit changes (live stage only) | ✅ Manage, update status |
| Satisfaction ratings | ✅ Emoji rating after each stage | ✅ View ratings in Overview |
| Live celebration | ✅ Confetti + website link + referral | — |
| Referral prompt | ✅ Pre-filled email + copy link | — |
| Preview URL | ✅ Click to see Netlify preview | ✅ Set preview URL |
| Loom video embeds | ✅ Auto-embeds in update feed | ✅ Paste Loom URL in update |

---

## File structure

```
website/portal/
├── login.html                  — Login page
├── dashboard.html              — Client dashboard
├── project.html                — Full project page (tabbed)
├── admin.html                  — Admin panel (tabbed project modal)
├── supabase.js                 — Supabase client (update credentials)
├── auth.js                     — Auth + EmailJS notification helpers
├── portal.css                  — Portal styles
├── supabase-setup.sql          — Base schema (run first)
├── supabase-updates.sql        — Phase 2 tables (run second)
├── SETUP.md                    — This file
└── supabase/functions/
    └── notify-comment/
        └── index.ts            — Twilio WhatsApp Edge Function
```
