-- ============================================================
-- AXRIK Client Portal — Phase 2 Schema Updates
-- Run this AFTER supabase-setup.sql
-- ============================================================

-- ── 1. Document Requests ─────────────────────────────────────
-- Phil posts a checklist of files he needs from the client.
-- Client sees these as to-do items on their project page.

CREATE TABLE IF NOT EXISTS document_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  label        TEXT NOT NULL,                    -- "Your logo (PNG or SVG)"
  description  TEXT,                             -- optional extra detail
  is_completed BOOLEAN DEFAULT false,
  document_id  UUID REFERENCES documents(id),   -- linked when client uploads
  created_by   UUID REFERENCES auth.users(id) NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read doc requests"
  ON document_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = document_requests.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

CREATE POLICY "Admins manage doc requests"
  ON document_requests FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Clients can mark a request as completed (when they upload the file)
CREATE POLICY "Clients complete own project requests"
  ON document_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = document_requests.project_id AND p.client_id = auth.uid()
    )
  );


-- ── 2. Approvals ─────────────────────────────────────────────
-- Phil posts a design/page/asset for client sign-off.
-- Client clicks Approve or Request Changes.

CREATE TABLE IF NOT EXISTS approvals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL,                 -- "Homepage design"
  description     TEXT,                          -- what to look at / what feedback is needed
  preview_url     TEXT,                          -- Netlify preview, Figma link, etc.
  screenshot_url  TEXT,                          -- optional image to display inline
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','changes_requested')),
  client_notes    TEXT,                          -- client's feedback when requesting changes
  created_by      UUID REFERENCES auth.users(id) NOT NULL,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read approvals"
  ON approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = approvals.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

CREATE POLICY "Admins create/delete approvals"
  ON approvals FOR INSERT
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins delete approvals"
  ON approvals FOR DELETE
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Clients respond to approvals (update status + client_notes)
CREATE POLICY "Clients respond to approvals"
  ON approvals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = approvals.project_id AND p.client_id = auth.uid()
    )
  );

CREATE TRIGGER set_approvals_updated_at
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 3. Support Requests ──────────────────────────────────────
-- Post-launch: client submits small change requests through the portal.

CREATE TABLE IF NOT EXISTS support_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  priority     TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status       TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','done','wont_do')),
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read support requests"
  ON support_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = support_requests.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

CREATE POLICY "Clients submit support requests"
  ON support_requests FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = support_requests.project_id AND p.client_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage support requests"
  ON support_requests FOR UPDATE
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE TRIGGER set_support_requests_updated_at
  BEFORE UPDATE ON support_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 4. Invoices ──────────────────────────────────────────────
-- Phil creates invoices; clients see them in their portal.

CREATE TABLE IF NOT EXISTS invoices (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,          -- "Initial deposit", "Final payment"
  amount       NUMERIC(10,2) NOT NULL,
  description  TEXT,
  status       TEXT DEFAULT 'unpaid' CHECK (status IN ('draft','unpaid','paid','overdue')),
  due_date     DATE,
  paid_at      DATE,
  invoice_url  TEXT,                   -- link to actual invoice PDF if you have one
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members read invoices"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = invoices.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
    AND status != 'draft'  -- clients only see non-draft invoices
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Admins manage invoices"
  ON invoices FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 5. Stage Ratings ─────────────────────────────────────────
-- Client rates their satisfaction after each stage completes.
-- One rating per stage per project.

CREATE TABLE IF NOT EXISTS stage_ratings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  stage       TEXT NOT NULL,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_by  UUID REFERENCES auth.users(id) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (project_id, stage)
);

ALTER TABLE stage_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all ratings"
  ON stage_ratings FOR SELECT
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "Clients manage own ratings"
  ON stage_ratings FOR ALL
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = stage_ratings.project_id AND p.client_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = stage_ratings.project_id AND p.client_id = auth.uid()
    )
  );


-- ── 6. Add preview_url to projects ───────────────────────────
-- Netlify preview URL shown to client before go-live

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS preview_url TEXT;


-- ── 7. Update admin_project_summary view ─────────────────────
CREATE OR REPLACE VIEW admin_project_summary AS
SELECT
  p.id,
  p.name,
  p.stage,
  p.website_url,
  p.preview_url,
  p.created_at,
  p.updated_at,
  up.full_name         AS client_name,
  up.business_name,
  up.phone             AS client_phone,
  u.email              AS client_email,
  (SELECT COUNT(*) FROM comments c        WHERE c.project_id = p.id AND c.is_read = false)       AS unread_comments,
  (SELECT COUNT(*) FROM documents d       WHERE d.project_id = p.id)                             AS document_count,
  (SELECT COUNT(*) FROM approvals a       WHERE a.project_id = p.id AND a.status = 'pending')    AS pending_approvals,
  (SELECT COUNT(*) FROM document_requests dr WHERE dr.project_id = p.id AND dr.is_completed = false) AS outstanding_requests,
  (SELECT COUNT(*) FROM support_requests sr WHERE sr.project_id = p.id AND sr.status = 'open')   AS open_support,
  (SELECT COUNT(*) FROM invoices i        WHERE i.project_id = p.id AND i.status = 'unpaid')     AS unpaid_invoices,
  (SELECT MAX(created_at) FROM project_updates pu WHERE pu.project_id = p.id)                    AS last_update
FROM projects p
JOIN auth.users u ON u.id = p.client_id
LEFT JOIN user_profiles up ON up.id = p.client_id;
