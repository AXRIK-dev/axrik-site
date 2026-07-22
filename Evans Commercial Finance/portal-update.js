#!/usr/bin/env node
// ============================================================
// AXRIK Portal — Post a build update from the command line
//
// Usage:
//   node portal-update.js "Your update message" [stage]
//   node portal-update.js "Message" build --project "Evans Commercial Finance"
//
// Which portal project the update lands on is resolved in this order:
//   1. --project "<name>"         (flag; matches project name, case-insensitive)
//   2. PORTAL_PROJECT env var     (name or project id)
//   3. ./.axrik-portal.json       ({ "project": "<name>" } or { "project_id": "<uuid>" })
//   4. If exactly one project exists, use it.
//   5. Otherwise: list projects and exit (never guesses).
//
// Drop a .axrik-portal.json in each Claude/Claude Code build
// workspace so every update from that project routes correctly.
//
// Stages: discovery | design | build | review | live
// Secrets live in portal-config.js (git-ignored — never committed).
// ============================================================

const fs = require('fs');
const path = require('path');
const { SUPABASE_URL, SERVICE_ROLE_KEY } = require('./portal-config.js');

// ── Parse args ────────────────────────────────────────────────
const argv = process.argv.slice(2);
let projectSel = null;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--project' || argv[i] === '-p') { projectSel = argv[++i]; }
  else positional.push(argv[i]);
}
const message  = positional[0];
const stageArg = positional[1] || null;

if (!message) {
  console.error('Usage: node portal-update.js "Your message" [stage] [--project "name"]');
  console.error('Stages: discovery | design | build | review | live');
  process.exit(1);
}

// Resolve the target selector from flag > env > local config file.
if (!projectSel) projectSel = process.env.PORTAL_PROJECT || null;
let cfgIdSel = null;
if (!projectSel) {
  const cfgPath = path.join(process.cwd(), '.axrik-portal.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      projectSel = cfg.project || null;
      cfgIdSel   = cfg.project_id || null;
    } catch { /* ignore malformed config */ }
  }
}

const headers = {
  apikey:          SERVICE_ROLE_KEY,
  Authorization:   `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type':  'application/json',
  Prefer:          'return=representation',
};

async function getAdminUser() {
  // Preferred: an admin row in user_profiles.
  const res  = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?role=eq.admin&select=id`, { headers });
  const data = await res.json();
  if (Array.isArray(data) && data.length) return data[0].id;

  // Fallback: find the admin via auth metadata (role can live there, not in the profile row).
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!r.ok) break;
    const body  = await r.json();
    const users = body.users || body;
    if (!users.length) break;
    const admin = users.find(u =>
      u.user_metadata?.role === 'admin' || u.app_metadata?.role === 'admin');
    if (admin) return admin.id;
    if (users.length < 200) break;
  }
  throw new Error('No admin user found (no user_profiles row with role=admin, and no auth user with metadata role=admin).');
}

async function getProjects() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name,stage`, { headers });
  return res.json();
}

function pickProject(projects) {
  const uuidSel = cfgIdSel || (projectSel && /^[0-9a-f-]{36}$/i.test(projectSel) ? projectSel : null);
  if (uuidSel) {
    const byId = projects.find(p => p.id === uuidSel);
    if (byId) return byId;
    throw new Error(`No project with id ${uuidSel}`);
  }
  if (projectSel) {
    const needle = projectSel.toLowerCase();
    const matches = projects.filter(p => p.name.toLowerCase().includes(needle));
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new Error(`No project matching "${projectSel}"`);
    throw new Error(`"${projectSel}" is ambiguous: ${matches.map(m => m.name).join(', ')}`);
  }
  if (projects.length === 1) return projects[0];
  const list = projects.map(p => `  • ${p.name} (${p.stage})`).join('\n');
  throw new Error(
    `Multiple projects exist — choose one with --project "name" or a .axrik-portal.json:\n${list}`,
  );
}

async function postUpdate(projectId, adminId, msg, stage) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/project_updates`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ project_id: projectId, message: msg, stage_at_time: stage, posted_by: adminId }),
  });
  return res.json();
}

(async () => {
  try {
    const [adminId, projects] = await Promise.all([getAdminUser(), getProjects()]);
    if (!projects.length) {
      console.log('No projects found. Create a project in the admin panel first.');
      process.exit(0);
    }

    const project = pickProject(projects);
    const stage   = stageArg || project.stage;
    const result  = await postUpdate(project.id, adminId, message, stage);

    if (result.code) {
      console.error('Error:', result.message);
      process.exit(1);
    }
    console.log(`✓ Update posted to "${project.name}"`);
    console.log(`  Stage:   ${stage}`);
    console.log(`  Message: ${message}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
