#!/usr/bin/env node
// ============================================================
// AXRIK Portal — Post a build update from the command line
// Usage: node portal-update.js "Your update message here"
// Optional stage: node portal-update.js "Message" build
// ============================================================

// Secrets live in portal-config.js (git-ignored — never committed).
// Copy portal-config.example.js to portal-config.js and fill in your values.
const { SUPABASE_URL, SERVICE_ROLE_KEY } = require('./portal-config.js');

const message   = process.argv[2];
const stageArg  = process.argv[3] || null;

if (!message) {
  console.error('Usage: node portal-update.js "Your message" [stage]');
  console.error('Stages: discovery | design | build | review | live');
  process.exit(1);
}

const headers = {
  'apikey':        SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

async function getAdminUser() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?role=eq.admin&select=id`, { headers });
  const data = await res.json();
  if (!data.length) throw new Error('No admin user found');
  return data[0].id;
}

async function getProjects() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name,stage`, { headers });
  return res.json();
}

async function postUpdate(projectId, adminId, msg, stage) {
  const body = {
    project_id:    projectId,
    message:       msg,
    stage_at_time: stage,
    posted_by:     adminId
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/project_updates`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body)
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

    // If only one project, use it. Otherwise list and let user pick.
    let project;
    if (projects.length === 1) {
      project = projects[0];
    } else {
      console.log('\nMultiple projects found:');
      projects.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (${p.stage})`));
      // Default to first — add a --project flag later if needed
      project = projects[0];
      console.log(`\nPosting to: ${project.name} (pass --project "name" to choose)`);
    }

    const stage = stageArg || project.stage;
    const result = await postUpdate(project.id, adminId, message, stage);

    if (result.code) {
      console.error('Error:', result.message);
    } else {
      console.log(`✓ Update posted to "${project.name}"`);
      console.log(`  Stage: ${stage}`);
      console.log(`  Message: ${message}`);
    }

  } catch (err) {
    console.error('Failed:', err.message);
  }
})();
