const API_BASE = 'https://claude.ai/api';
const USAGE_URL = 'https://claude.ai/settings/usage';

// --- DESIGN SYSTEM (mirrors CSS variables, for Canvas rendering) ---
const COLORS = {
  green:  '#2E7D32',
  orange: '#A86207',
  red:    '#C62828',
  red100: '#D32F2F',
  error:  '#666666',
  white:  '#FFFFFF',
};

// Shared thresholds — @sync: content.js, popup.js
const THRESHOLDS = { low: 50, high: 80 };

function statusColor(pct) {
  if (pct < THRESHOLDS.low) return COLORS.green;
  if (pct < THRESHOLDS.high) return COLORS.orange;
  return COLORS.red;
}

// --- INIT ---
chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.alarms.create('refresh', { periodInMinutes: 2 });
  fetchIfClaudeOpen();
  // Onboarding: only on first install, not on updates — slight delay to not feel abrupt
  if (reason === 'install') {
    setTimeout(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }, 1500);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const existing = await chrome.alarms.get('refresh');
  if (!existing) chrome.alarms.create('refresh', { periodInMinutes: 2 });
  fetchIfClaudeOpen();
});

// --- ALARM ---
chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === 'refresh') fetchIfClaudeOpen();
});

// --- ONLY FETCH IF A CLAUDE TAB IS OPEN ---
async function fetchIfClaudeOpen() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length > 0) fetchAndUpdate();
  } catch {
    fetchAndUpdate(); // fallback if tabs.query fails
  }
}

// --- MESSAGES (security: validate sender, hardcode URLs) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

  if (msg.type === 'refresh_icon') {
    chrome.storage.local.get('claudeData', ({ claudeData }) => {
      if (claudeData?.usage?.five_hour) {
        drawIconWithPct(claudeData.usage.five_hour.utilization ?? 0);
      }
    });
  }

  if (msg.type === 'open_usage') {
    if (msg.isArc) {
      chrome.windows.create({ url: USAGE_URL, type: 'popup', width: 520, height: 640 });
    } else {
      chrome.tabs.create({ url: USAGE_URL });
    }
  }

  if (msg.type === 'force_refresh') {
    fetchAndUpdate()
      .then(() => chrome.storage.local.get('claudeData'))
      .then(({ claudeData }) => sendResponse({ ok: true, data: claudeData }))
      .catch(() => sendResponse({ ok: false }));
    return true; // keep message channel open for async response
  }
});

// --- HEALTH MONITORING ---
let consecutiveApiFailures = 0;

// Refacto #2: distinguish null (HTTP error) from schema mismatch
function validateUsageSchema(usage) {
  if (usage === null) return 'http_error';
  if (!usage || typeof usage !== 'object') return 'empty_response';
  // five_hour may be absent on free plans — not an error
  if (usage.five_hour && typeof usage.five_hour.utilization !== 'number') return 'invalid_utilization_type';
  if (usage.seven_day && typeof usage.seven_day.utilization !== 'number') return 'invalid_weekly_type';
  return null;
}

function updateHealth(status, detail = '') {
  chrome.storage.local.set({
    claudeHealth: { status, detail, updated_at: new Date().toISOString() }
  });
  if (status !== 'ok') {
    drawIcon('!', COLORS.error);
  }
}

// Privacy: org UUID/name intentionally NOT stored — only usage + plan
function storeData(usage, org, rateLimits) {
  chrome.storage.local.set({
    claudeData: {
      usage,
      plan: detectPlan(org, rateLimits),
      updated_at: new Date().toISOString(),
    }
  });
}

// --- MAIN FETCH ---
async function fetchAndUpdate() {
  try {
    const orgResp = await fetch(`${API_BASE}/organizations`);
    if (!orgResp.ok) throw new Error('auth');

    const orgs = await orgResp.json();
    if (!orgs?.length) throw new Error('no_org');

    const org = orgs[0];
    const [usage, rateLimits] = await Promise.all([
      safeFetch(`${API_BASE}/organizations/${org.uuid}/usage`),
      safeFetch(`${API_BASE}/organizations/${org.uuid}/rate_limits`),
    ]);

    const schemaError = validateUsageSchema(usage);
    if (schemaError) {
      consecutiveApiFailures++;
      if (consecutiveApiFailures >= 3) {
        // Refacto #2: correct health status based on error type
        const status = schemaError === 'http_error' ? 'api_unreachable' : 'api_schema_changed';
        updateHealth(status, schemaError);
      }
      // Still store whatever we got (may be null for free plan detection)
      if (usage) storeData(usage, org, rateLimits);
      resetIcon();
      return;
    }

    // Healthy
    consecutiveApiFailures = 0;
    updateHealth('ok');
    storeData(usage, org, rateLimits);

    chrome.action.setBadgeText({ text: '' });
    usage?.five_hour ? drawIconWithPct(usage.five_hour.utilization ?? 0) : resetIcon();
  } catch (err) {
    consecutiveApiFailures++;
    if (consecutiveApiFailures >= 3) {
      updateHealth('api_unreachable', err.message ?? 'unknown');
    }
    drawIcon('?', COLORS.error);
  }
}

async function safeFetch(url) {
  const r = await fetch(url);
  return r.ok ? r.json() : null; // null = HTTP error (not schema error)
}

// --- ICON RENDERING ---
function drawIconWithPct(pct) {
  if (pct >= 100) return drawIcon('\u270B', COLORS.red100, 0.6);
  drawIcon(String(pct), statusColor(pct));
}

function drawIcon(text, bgColor, fontScale) {
  const sizes = [16, 32, 48];
  const imageData = {};
  const scale = fontScale ?? (text.length <= 1 ? 0.78 : text.length <= 2 ? 0.68 : 0.52);

  for (const size of sizes) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    const r = Math.round(size * 0.2);
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.fillStyle = bgColor;
    ctx.fill();

    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(size * scale)}px sans-serif`;
    ctx.fillText(text, size / 2, size / 2 + Math.round(size * 0.05));

    imageData[size] = ctx.getImageData(0, 0, size, size);
  }

  chrome.action.setIcon({ imageData });
}

function resetIcon() {
  chrome.action.setIcon({
    path: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' }
  });
}

// --- PLAN DETECTION ---
function detectPlan(org, rateLimits) {
  const tier = rateLimits?.rate_limit_tier?.toLowerCase() ?? '';
  const bt = (org.billing_type ?? '').toLowerCase();
  const src = tier || bt;

  if (src.includes('max')) return { label: 'Max', class: 'pro' };
  if (src.includes('pro') || src.includes('individual_pro')) return { label: 'Pro', class: 'pro' };
  if (src.includes('team')) return { label: 'Team', class: 'team' };
  if (src.includes('enterprise')) return { label: 'Enterprise', class: 'team' };
  return { label: 'Free', class: 'free' };
}

// --- HEALTH ICON (react to content.js health updates) ---
chrome.storage.onChanged.addListener(changes => {
  const health = changes.claudeHealth?.newValue;
  if (health && health.status !== 'ok') {
    drawIcon('!', COLORS.error);
  }
});
