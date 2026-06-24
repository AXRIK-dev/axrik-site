# AXRIK — New Client Setup Guide

*A step-by-step process for getting a new client's infrastructure in place before the build starts. Follow this in order every time.*

---

## Overview

Every AXRIK client ends up with:
- A domain they own (registered in their name)
- Cloudflare managing their DNS (free)
- A professional email address forwarding to their existing inbox (free)
- A Netlify account for hosting (free tier)
- A Supabase project for the database and auth (free tier)
- A GitHub repo under your AXRIK account that drives all deployments

You do the build. They own the infrastructure. You never need their login credentials to redeploy.

---

## Before You Start

Ask the client two questions:

1. **Do you already have a domain?**
   - Yes → skip to Step 3 (Cloudflare). They'll need to transfer DNS management to Cloudflare or point their existing nameservers at it.
   - No → start at Step 1.

2. **Do you already have a Netlify account?**
   - Yes → ask to be added as a team member (admin role). Skip Step 4.
   - No → follow Step 4.

---

## Step 1 — Buy the Domain (Client owns this)

**Who does it:** You walk the client through this, or do it on their behalf with their details.

**Where:** [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — at-cost pricing, no markup, no upsell.

1. Go to cloudflare.com and create a free Cloudflare account in the **client's name using their email address**
2. From the dashboard, go to **Domain Registration → Register Domains**
3. Search for the domain name, confirm it's available, and purchase
4. Pay with the client's card — cost is typically £8–12/year
5. The domain now lives in Cloudflare and DNS is already managed there (no extra step needed)

> **If client already has a domain elsewhere (GoDaddy, Namecheap etc):**
> - Option A (preferred): Transfer the domain to Cloudflare Registrar — cleaner long-term
> - Option B: Keep domain where it is, but change the nameservers to Cloudflare's (Cloudflare will give you two nameserver addresses during setup)

---

## Step 2 — Set Up Professional Email (Free)

**Who does it:** You, inside the client's Cloudflare account.

This uses **Cloudflare Email Routing** — completely free. It creates a professional address (e.g. jon@jgfoodsnorthwest.com) that forwards to the client's existing Gmail or inbox. They don't need to learn a new email app.

1. In the client's Cloudflare dashboard, go to the domain → **Email → Email Routing**
2. Click **Get Started**
3. Under **Custom Addresses**, click **Create Address**
4. Set the custom address (e.g. `jon@jgfoodsnorthwest.com`)
5. Set the destination as the client's existing personal email
6. Cloudflare adds the required DNS records automatically
7. The client gets a verification email at their personal address — they click confirm

Done. Any email sent to the professional address lands in their normal inbox.

> **If the client wants a proper separate inbox** (not just forwarding):
> Upgrade to Google Workspace — £5.20/user/month. They get a full Gmail inbox at their domain. Set up the same way but through Google Admin rather than Cloudflare.

---

## Step 3 — Set Up Cloudflare for DNS (If domain not bought through Cloudflare)

*Skip this if you completed Step 1 — Cloudflare is already handling DNS.*

If the client's domain is registered elsewhere:

1. Create a free Cloudflare account at cloudflare.com (in client's name and email)
2. Click **Add a Site**, enter their domain name
3. Select the **Free plan**
4. Cloudflare scans existing DNS records — review and confirm they look right
5. Cloudflare gives you two nameserver addresses (e.g. `alice.ns.cloudflare.com`)
6. Log into wherever the domain is registered and replace the existing nameservers with Cloudflare's two
7. Wait up to 24 hours for propagation (usually under an hour)

---

## Step 4 — Create the Netlify Account (Client owns this)

**Who does it:** Client creates the account. You get added as collaborator.

1. Go to [netlify.com](https://netlify.com) and sign up using the **client's email address**
2. Choose the **Free (Starter) plan**
3. Once the account is created, go to **Team Settings → Members**
4. Invite your AXRIK email as a member with **admin** role
5. You now have full deployment access without needing the client's password

> **Redeployments:** You never need to touch Netlify directly after this. All deployments are driven by GitHub (see Step 6). Every push to the main branch redeploys automatically.

---

## Step 5 — Create the Supabase Project (Client owns this)

**Who does it:** Client creates the account. You get added to the project.

1. Go to [supabase.com](https://supabase.com) and sign up using the **client's email address**
2. Click **New Project**
3. Name the project (e.g. `jg-foods`)
4. Choose a strong database password — save this securely (use a password manager)
5. Select the **EU West** region (closest to UK clients)
6. Once created, go to **Project Settings → Team**
7. Invite your AXRIK email as an admin

> **Note for the build:** The Supabase project URL and anon key (found in Project Settings → API) go into your environment variables on Netlify — never hardcode them in the repo.

---

## Step 6 — Create the GitHub Repo (You own this)

**Who does it:** You, under your AXRIK GitHub account.

1. Go to [github.com](https://github.com) and create a new repository
2. Name it clearly (e.g. `jg-foods`)
3. Set it to **Private**
4. Clone it locally and start building

> The client does not need a GitHub account. The repo lives under AXRIK and you manage it entirely.

---

## Step 7 — Connect GitHub to Netlify (One-time setup)

This is the step that makes all future deployments automatic.

1. Log into the **client's Netlify account** (or use your team member access)
2. Click **Add New Site → Import an Existing Project**
3. Choose **GitHub** and authorise Netlify to access your AXRIK GitHub account
4. Select the client's repo (e.g. `jg-foods`)
5. Set the build settings:
   - Build command: *(leave blank for plain HTML/JS projects)*
   - Publish directory: `/` or wherever your `index.html` lives
6. Click **Deploy Site**

From this point on: push to GitHub main branch → site redeploys automatically. No one needs to touch Netlify.

**Preview deployments:** Any branch you push to GitHub gets its own preview URL automatically. Use this to test new versions before merging to main.

---

## Step 8 — Connect the Domain to Netlify

1. In Netlify, go to **Site Settings → Domain Management**
2. Click **Add Custom Domain** and enter the client's domain (e.g. `jgfoodsnorthwest.com`)
3. Netlify gives you a DNS record to add (usually an A record or CNAME)
4. Go to the client's Cloudflare dashboard → DNS → Add the record Netlify provided
5. Back in Netlify, click **Verify DNS Configuration**
6. Netlify provisions a free SSL certificate automatically via Let's Encrypt (takes a few minutes)

The site is now live at the client's domain with HTTPS.

---

## Step 9 — Add Environment Variables to Netlify

Sensitive values (Supabase URL, anon key, EmailJS keys etc.) go into Netlify as environment variables — never in the code.

1. In Netlify, go to **Site Settings → Environment Variables**
2. Add each key/value pair:
   - `SUPABASE_URL` — from Supabase Project Settings → API
   - `SUPABASE_ANON_KEY` — from Supabase Project Settings → API
   - Any other service keys (EmailJS, Twilio etc.)
3. These are injected at build time and never exposed in the GitHub repo

---

## Summary Checklist

Use this to confirm everything is in place before starting the build.

- [ ] Domain registered in client's name via Cloudflare
- [ ] Professional email set up and forwarding confirmed
- [ ] Cloudflare managing DNS
- [ ] Netlify account created in client's name
- [ ] Your AXRIK email added as Netlify admin
- [ ] Supabase project created in client's name (EU West region)
- [ ] Your AXRIK email added as Supabase admin
- [ ] Database password saved securely
- [ ] GitHub repo created under AXRIK account (private)
- [ ] GitHub repo connected to Netlify (auto-deploy active)
- [ ] Client domain connected to Netlify with SSL confirmed
- [ ] Environment variables added to Netlify

---

## If the Client Already Has a Domain

**Scenario A** — domain is at Cloudflare already: nothing to do, just work with their existing DNS.

**Scenario B** — domain is at GoDaddy, Namecheap etc:
- Preferred: transfer to Cloudflare Registrar (client authorises the transfer, takes 5–7 days)
- Faster: change nameservers at the registrar to point at Cloudflare (takes 1–24 hours)

Either way, once Cloudflare is managing DNS, the rest of the process is identical.

---

## Cost Summary for the Client

| Item | Cost |
|------|------|
| Domain registration | ~£10/year |
| Cloudflare (DNS, email routing, SSL) | Free |
| Netlify hosting | Free (Starter tier) |
| Supabase database | Free (up to 500MB) |
| Email forwarding | Free via Cloudflare |
| Google Workspace (optional — proper inbox) | ~£62/year |
| **Total minimum** | **~£10/year** |

---

## Notes for Future Clients

- This process takes about 30–45 minutes end to end (excluding DNS propagation wait times)
- All accounts are in the client's name — they own everything
- You maintain developer access through team/collaborator invites — no shared passwords needed
- As AXRIK grows, look into Netlify's agency/team plan for managing multiple client sites from one dashboard

---

*Document maintained by AXRIK · Last updated May 2026*
