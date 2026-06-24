-- ============================================================
-- AXRIK Client Portal — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ── Trigger: auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── 1. User Profiles ─────────────────────────────────────────
-- Extends auth.users with portal-specific data.
-- role: 'admin' (Phil) | 'client'

CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name     TEXT,
  business_name TEXT,
  phone         TEXT,
  role          TEXT DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users read their own profile; admins read all
CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Users update their own profile; admins update any
CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- System inserts (via trigger)
CREATE POLICY "System insert profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();


-- ── 2. Projects ──────────────────────────────────────────────
-- One project per client (or multiple — linked by client_id).
-- stage: discovery → design → build → review → live

CREATE TABLE IF NOT EXISTS projects (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID REFERENCES auth.users(id) NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  stage         TEXT DEFAULT 'discovery'
                  CHECK (stage IN ('discovery','design','build','review','live')),
  website_url   TEXT,          -- populated once live
  notes         TEXT,          -- internal notes (admin only)
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Clients see their own projects
CREATE POLICY "Clients read own projects"
  ON projects FOR SELECT
  USING (
    auth.uid() = client_id
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Only admins create/update/delete projects
CREATE POLICY "Admins manage projects"
  ON projects FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 3. Project Updates ───────────────────────────────────────
-- Phil posts status updates visible to the client on their project page.

CREATE TABLE IF NOT EXISTS project_updates (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  message       TEXT NOT NULL,
  stage_at_time TEXT,          -- snapshot of stage when update was posted
  posted_by     UUID REFERENCES auth.users(id) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

-- Clients read updates for their own projects; admins read all
CREATE POLICY "Users read project updates"
  ON project_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_updates.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

-- Only admins post updates
CREATE POLICY "Admins post updates"
  ON project_updates FOR INSERT
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins delete updates"
  ON project_updates FOR DELETE
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');


-- ── 4. Documents ─────────────────────────────────────────────
-- Files uploaded by clients (logos, images, spreadsheets, etc.)
-- Actual files live in Supabase Storage bucket: 'portal-documents'

CREATE TABLE IF NOT EXISTS documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  uploaded_by   UUID REFERENCES auth.users(id) NOT NULL,
  file_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL,   -- storage path: {project_id}/{uuid}/{filename}
  file_type     TEXT,            -- MIME type
  file_size     BIGINT,          -- bytes
  label         TEXT,            -- optional: 'Logo', 'Menu', 'Product photo', etc.
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Clients read/insert documents for their own projects
CREATE POLICY "Clients read own project docs"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

CREATE POLICY "Clients upload to own project"
  ON documents FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = documents.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

-- Clients delete own uploads; admins delete any
CREATE POLICY "Users delete own docs"
  ON documents FOR DELETE
  USING (
    auth.uid() = uploaded_by
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );


-- ── 5. Comments ──────────────────────────────────────────────
-- Per-project comment thread between client and Phil.

CREATE TABLE IF NOT EXISTS comments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID REFERENCES auth.users(id) NOT NULL,
  message       TEXT NOT NULL,
  is_read       BOOLEAN DEFAULT false,  -- used to badge unread on admin side
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Both client and admin can read/insert comments on a project
CREATE POLICY "Project members read comments"
  ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = comments.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

CREATE POLICY "Project members post comments"
  ON comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = comments.project_id
        AND (p.client_id = auth.uid() OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
    )
  );

-- Admin can mark comments as read
CREATE POLICY "Admins update comments"
  ON comments FOR UPDATE
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');


-- ── Storage Bucket ───────────────────────────────────────────
-- Run this separately in Supabase Dashboard > Storage, OR via API.
-- Bucket name: portal-documents
-- Settings: Private (not public), 50MB file size limit
--
-- Storage RLS policies (add in Dashboard > Storage > Policies):
--
-- Allow authenticated users to upload to their project folder:
-- CREATE POLICY "Clients upload"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'portal-documents' AND auth.uid() IS NOT NULL);
--
-- Allow users to read files in their project's folder:
-- CREATE POLICY "Clients read own files"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'portal-documents' AND auth.uid() IS NOT NULL);
--
-- Allow users to delete their own uploads:
-- CREATE POLICY "Users delete own files"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'portal-documents' AND auth.uid() IS NOT NULL);


-- ── Useful Views ─────────────────────────────────────────────
-- Admin summary view: projects with client name and unread comment count

CREATE OR REPLACE VIEW admin_project_summary AS
SELECT
  p.id,
  p.name,
  p.stage,
  p.website_url,
  p.created_at,
  p.updated_at,
  up.full_name  AS client_name,
  up.business_name,
  up.phone      AS client_phone,
  u.email       AS client_email,
  (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id AND c.is_read = false) AS unread_comments,
  (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS document_count,
  (SELECT MAX(created_at) FROM project_updates pu WHERE pu.project_id = p.id) AS last_update
FROM projects p
JOIN auth.users u ON u.id = p.client_id
LEFT JOIN user_profiles up ON up.id = p.client_id;
