// ============================================================
// AXRIK Portal — Auth & Notification Helpers
// ============================================================

// ── EmailJS config ───────────────────────────────────────────
// Set these after creating your EmailJS account.
// See SETUP.md for instructions.
const EMAILJS_SERVICE_ID  = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY';

// Template IDs — create these in EmailJS Dashboard
const EMAIL_TEMPLATES = {
  buildUpdate:       'tmpl_build_update',      // Phil → Client: new update posted
  newComment:        'tmpl_new_comment',        // Phil → Client: Phil replied
  clientComment:     'tmpl_client_comment',     // Client → Phil: client messaged
  approvalNeeded:    'tmpl_approval_needed',    // Phil → Client: please approve X
  approvalResponse:  'tmpl_approval_response',  // Client → Phil: approval response
  supportReceived:   'tmpl_support_received',   // Client → Phil: new support request
  invoiceIssued:     'tmpl_invoice_issued',     // Phil → Client: new invoice
  projectLive:       'tmpl_project_live',       // Phil → Client: you're live!
};

// Phil's email — receives notifications when clients act
const PHIL_EMAIL = 'hello@axrik.com';

// ── Send email via EmailJS ───────────────────────────────────
async function sendEmail(templateId, params) {
  if (typeof emailjs === 'undefined') return; // EmailJS not loaded
  if (!EMAILJS_SERVICE_ID || EMAILJS_SERVICE_ID === 'YOUR_EMAILJS_SERVICE_ID') return;

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, templateId, params, EMAILJS_PUBLIC_KEY);
  } catch (err) {
    console.warn('Email notification failed (non-critical):', err);
    // Don't throw — notifications are best-effort
  }
}

// ── Notification helpers ─────────────────────────────────────

// Phil posted a build update → notify client
async function notifyClientBuildUpdate(clientEmail, clientName, projectName, message, stage) {
  await sendEmail(EMAIL_TEMPLATES.buildUpdate, {
    to_email:    clientEmail,
    to_name:     clientName,
    project_name: projectName,
    message,
    stage:       getStageLabel(stage),
    portal_url:  `${window.location.origin}/portal/dashboard.html`,
  });
}

// Phil replied to a comment → notify client
async function notifyClientComment(clientEmail, clientName, projectName, message) {
  await sendEmail(EMAIL_TEMPLATES.newComment, {
    to_email:    clientEmail,
    to_name:     clientName,
    project_name: projectName,
    message,
    portal_url:  `${window.location.origin}/portal/project.html#comments`,
  });
}

// Client posted a comment → notify Phil
async function notifyPhilClientComment(clientName, projectName, message, projectId) {
  await sendEmail(EMAIL_TEMPLATES.clientComment, {
    to_email:    PHIL_EMAIL,
    to_name:     'Phil',
    client_name: clientName,
    project_name: projectName,
    message,
    admin_url:   `${window.location.origin}/portal/admin.html`,
  });
}

// Phil posted an approval → notify client
async function notifyClientApproval(clientEmail, clientName, projectName, approvalTitle, previewUrl) {
  await sendEmail(EMAIL_TEMPLATES.approvalNeeded, {
    to_email:     clientEmail,
    to_name:      clientName,
    project_name: projectName,
    approval_title: approvalTitle,
    preview_url:  previewUrl || '',
    portal_url:   `${window.location.origin}/portal/project.html#approvals`,
  });
}

// Client responded to approval → notify Phil
async function notifyPhilApprovalResponse(clientName, projectName, approvalTitle, status, notes) {
  await sendEmail(EMAIL_TEMPLATES.approvalResponse, {
    to_email:      PHIL_EMAIL,
    to_name:       'Phil',
    client_name:   clientName,
    project_name:  projectName,
    approval_title: approvalTitle,
    status:        status === 'approved' ? '✅ Approved' : '🔄 Changes requested',
    notes:         notes || 'No notes provided.',
    admin_url:     `${window.location.origin}/portal/admin.html`,
  });
}

// Client submitted a support request → notify Phil
async function notifyPhilSupportRequest(clientName, projectName, title, description) {
  await sendEmail(EMAIL_TEMPLATES.supportReceived, {
    to_email:     PHIL_EMAIL,
    to_name:      'Phil',
    client_name:  clientName,
    project_name: projectName,
    title,
    description,
    admin_url:    `${window.location.origin}/portal/admin.html`,
  });
}

// Phil issued an invoice → notify client
async function notifyClientInvoice(clientEmail, clientName, projectName, invoiceTitle, amount, dueDate) {
  await sendEmail(EMAIL_TEMPLATES.invoiceIssued, {
    to_email:     clientEmail,
    to_name:      clientName,
    project_name: projectName,
    invoice_title: invoiceTitle,
    amount:       `£${parseFloat(amount).toFixed(2)}`,
    due_date:     dueDate ? formatDate(dueDate) : 'On receipt',
    portal_url:   `${window.location.origin}/portal/project.html#invoices`,
  });
}

// Project went live → notify client
async function notifyClientProjectLive(clientEmail, clientName, projectName, websiteUrl) {
  await sendEmail(EMAIL_TEMPLATES.projectLive, {
    to_email:     clientEmail,
    to_name:      clientName,
    project_name: projectName,
    website_url:  websiteUrl || '',
    portal_url:   `${window.location.origin}/portal/dashboard.html`,
  });
}

// ── Auth helpers ─────────────────────────────────────────────

async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

async function getUserRole() {
  const user = await getCurrentUser();
  return user?.user_metadata?.role || 'client';
}

async function requireAuth(redirectTo = '/portal/login.html') {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  const role = await getUserRole();
  if (role !== 'admin') {
    window.location.href = '/portal/dashboard.html';
    return null;
  }
  return user;
}

async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await db.auth.signOut();
  window.location.href = '/portal/login.html';
}

// ── Password reset ───────────────────────────────────────────
// Sends the client a "reset your password" email with a link back
// to reset.html, where they choose a new password.
async function requestPasswordReset(email) {
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/portal/reset.html`,
  });
  if (error) throw error;
}

// Called on reset.html once the recovery link has established a session.
async function setNewPassword(password) {
  const { error } = await db.auth.updateUser({ password });
  if (error) throw error;
}

async function getUserProfile(userId) {
  const { data, error } = await db
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// ── UI helpers ───────────────────────────────────────────────

function showToast(message, type = 'info') {
  const existing = document.getElementById('portal-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'portal-toast';
  toast.className = `portal-toast portal-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('portal-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('portal-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fileEmoji(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📑';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
  return '📄';
}

// ── Stage config ─────────────────────────────────────────────
const STAGES = [
  { key: 'discovery', label: 'Discovery', desc: 'Gathering requirements & planning your project.' },
  { key: 'design',    label: 'Design',    desc: 'Creating the look, feel and structure of your site.' },
  { key: 'build',     label: 'Build',     desc: 'Developing your website and features.' },
  { key: 'review',    label: 'Review',    desc: 'Your feedback round — reviewing and refining.' },
  { key: 'live',      label: 'Live',      desc: 'Your website is launched and live.' },
];

function getStageIndex(key) { return STAGES.findIndex(s => s.key === key); }
function getStageLabel(key) { return STAGES.find(s => s.key === key)?.label || key; }

// ── Detect Loom URLs ─────────────────────────────────────────
function extractLoomId(text) {
  const match = text.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function renderMessageWithLoom(text) {
  const loomId = extractLoomId(text);
  const safeText = escHtml(text);
  if (!loomId) return `<span>${safeText}</span>`;
  return `
    <span>${safeText}</span>
    <div style="margin-top:10px;border-radius:10px;overflow:hidden;background:#000;aspect-ratio:16/9;max-width:380px;">
      <iframe src="https://www.loom.com/embed/${loomId}" frameborder="0" allowfullscreen
        style="width:100%;height:100%;border:none;"></iframe>
    </div>`;
}
