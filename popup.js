const contentEl = document.getElementById('content');
const refreshBtn = document.getElementById('refreshBtn');
const openBtn = document.getElementById('openBtn');
const msg = chrome.i18n.getMessage;

// --- i18n: apply translations to static HTML elements ---
document.getElementById('popupTitle').textContent = msg('popupTitle');
document.title = msg('popupTitle');
refreshBtn.title = msg('popupRefreshTitle');
refreshBtn.setAttribute('aria-label', msg('popupRefreshAria'));
openBtn.title = msg('popupOpenTitle');
openBtn.setAttribute('aria-label', msg('popupOpenAria'));

let countdownInterval = null;
let resetTimestamps = {};

// --- SECURITY HELPERS ---
const safePct = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; };
const safeTimestamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(v) ? v : '';
const ALLOWED_PLAN_CLASSES = new Set(['pro', 'free', 'team']);
const safePlanClass = v => ALLOWED_PLAN_CLASSES.has(v) ? v : 'free';

// @sync: background.js, content.js
const THRESHOLDS = { low: 50, high: 80 };

// --- DOM HELPERS ---
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function showLoading() {
  const wrap = el('div', 'loading');
  wrap.append(el('div', 'spinner'), document.createTextNode(msg('loading')));
  contentEl.replaceChildren(wrap);
}

// --- BUTTONS ---
refreshBtn.addEventListener('click', () => triggerRefresh(true));

// Refacto #5: openBtn uses same open_usage message as widget (Arc/Chrome aware)
openBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open_usage', isArc: false });
  // Popup always opens a new tab — Arc detection only applies to widget click
  // (popup doesn't have access to page CSS variables)
});

// --- INIT ---
showLoading();
chrome.storage.local.get('claudeData', ({ claudeData }) => {
  if (claudeData?.usage) {
    render(claudeData);
    triggerRefresh(false);
  } else {
    triggerRefresh(true);
  }
});

// --- REFRESH ---
function triggerRefresh(withLoading) {
  refreshBtn.classList.add('is-loading');
  if (withLoading) showLoading();

  chrome.runtime.sendMessage({ type: 'force_refresh' }, response => {
    refreshBtn.classList.remove('is-loading');
    if (chrome.runtime.lastError) { showError(); return; }
    if (response?.ok && response.data?.usage) {
      render(response.data);
    } else if (response?.ok) {
      showNoData();
    } else {
      showError();
    }
  });
}

// --- RENDER ---
function render({ usage, plan = { label: 'Free', class: 'free' } }) {
  resetTimestamps = {};
  const frag = document.createDocumentFragment();

  // Plan badge
  const planRow = el('div', 'plan-row');
  planRow.append(el('span', `plan-badge ${safePlanClass(plan.class)}`, `\u25CF ${msg('planPrefix', [plan.label])}`));
  frag.append(planRow);

  // Free plan: no session data — early return
  if (!usage.five_hour) {
    const notice = el('div', 'no-data');
    notice.append(el('p', null, msg('freePlanPopup')));
    frag.append(notice);
    frag.append(buildFooter());
    contentEl.replaceChildren(frag);
    checkHealth();
    return;
  }

  // Refacto #4: removed redundant `if (usage.five_hour)` — guaranteed by early return above

  // Summary
  const s = makeLevel(usage.five_hour.utilization ?? 0);
  const h = makeLevel(usage.seven_day?.utilization ?? 0);
  resetTimestamps.five_hour = safeTimestamp(usage.five_hour.resets_at);
  if (usage.seven_day) resetTimestamps.seven_day = safeTimestamp(usage.seven_day.resets_at);

  const section = el('div', 'usage-section');
  section.append(el('h2', null, msg('summary')));
  const card = el('div', 'usage-card');
  card.append(...usageRowDom(msg('session'), s));
  const cd1 = el('div', 'usage-detail', `${msg('resetPrefix')} ${formatReset(resetTimestamps.five_hour)}`);
  cd1.id = 'countdown-five_hour';
  card.append(cd1, el('div', 'usage-card-spacer'));
  card.append(...usageRowDom(msg('weekly'), h));
  const cd2 = el('div', 'usage-detail', `${msg('resetPrefix')} ${formatReset(resetTimestamps.seven_day)}`);
  cd2.id = 'countdown-seven_day';
  card.append(cd2);
  section.append(card);
  frag.append(section);

  // Specific limits
  const specificDefs = [
    ['seven_day_sonnet', msg('sonnetOnly')],
    ['seven_day_opus', msg('opusOnly')],
    ['seven_day_oauth_apps', msg('oauthApps')],
    ['seven_day_cowork', msg('cowork')],
  ];
  const specifics = specificDefs
    .filter(([k]) => usage[k])
    .map(([k, name]) => ({ key: k, name, ...makeLevel(usage[k].utilization ?? 0), reset_at: safeTimestamp(usage[k].resets_at) }));

  if (specifics.length) {
    const section = el('div', 'usage-section');
    section.append(el('h2', null, msg('specificLimits')));
    for (const item of specifics) {
      resetTimestamps[item.key] = item.reset_at;
      const card = el('div', 'usage-card');
      card.append(...usageRowDom(item.name, item));
      const cd = el('div', 'usage-detail', `${msg('resetPrefix')} ${formatReset(item.reset_at)}`);
      cd.id = `countdown-${item.key}`;
      card.append(cd);
      section.append(card);
    }
    frag.append(section);
  }

  // Extra usage
  if (usage.extra_usage?.is_enabled) {
    const raw = usage.extra_usage.used_credits ?? 0;
    const credits = typeof raw === 'number' ? raw.toFixed(2) : String(raw);
    const section = el('div', 'usage-section');
    section.append(el('h2', null, msg('extraUsage')));
    const card = el('div', 'usage-card');
    const header = el('div', 'usage-card-header');
    header.append(el('span', 'model-name', msg('credits')));
    header.append(el('span', 'usage-pct mid', credits));
    card.append(header);
    if (usage.extra_usage.monthly_limit) {
      card.append(el('div', 'usage-detail', msg('limit', [usage.extra_usage.monthly_limit])));
    }
    section.append(card);
    frag.append(section);
  }

  // Footer
  frag.append(buildFooter());

  contentEl.replaceChildren(frag);
  animateBars();
  startCountdown();
  checkHealth();
}

function buildFooter() {
  const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const footer = el('div', 'footer');
  footer.append(el('span', 'updated', msg('updatedAt', [time])));
  const right = el('div', 'footer-right');
  const report = el('a', 'report-link', msg('reportIssue'));
  report.href = 'https://github.com/theochab/claude-sidebar-monitor/issues';
  report.target = '_blank';
  report.rel = 'noopener';
  right.append(report);
  right.append(el('span', 'credit', msg('credit')));
  footer.append(right);
  return footer;
}

// --- USAGE ROW ---
function makeLevel(pct) {
  const p = safePct(pct);
  return { pct: p, level: p < THRESHOLDS.low ? 'low' : p < THRESHOLDS.high ? 'mid' : 'high' };
}

function usageRowDom(label, { pct, level }) {
  const header = el('div', 'usage-card-header');
  header.append(el('span', 'model-name', label));
  header.append(el('span', `usage-pct ${level}`, `${pct} %`));
  const track = el('div', 'progress-track');
  const fill = el('div', `progress-fill ${level}`);
  fill.dataset.width = pct;
  fill.style.backgroundColor = continuousColor(pct);
  track.append(fill);
  return [header, track];
}

// @sync: content.js:continuousColor — same algorithm, keep in sync
function continuousColor(pct) {
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const rgb = (r, g, b) => `rgb(${r},${g},${b})`;
  const greenEnd = THRESHOLDS.low * 0.6;
  const orangeEnd = THRESHOLDS.high;
  const mid = (greenEnd + orangeEnd) / 2;
  if (pct <= greenEnd) return 'rgb(107,203,119)';
  if (pct <= mid) {
    const t = (pct - greenEnd) / (mid - greenEnd);
    return rgb(lerp(107, 232, t), lerp(203, 163, t), lerp(119, 23, t));
  }
  if (pct <= orangeEnd) {
    const t = (pct - mid) / (orangeEnd - mid);
    return rgb(lerp(232, 255, t), lerp(163, 107, t), lerp(23, 107, t));
  }
  return 'rgb(255,107,107)';
}

function animateBars() {
  requestAnimationFrame(() => {
    for (const bar of document.querySelectorAll('.progress-fill[data-width]')) {
      bar.style.width = `${bar.dataset.width}%`;
    }
  });
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    let expired = false;
    for (const [key, resetAt] of Object.entries(resetTimestamps)) {
      const node = document.getElementById(`countdown-${key}`);
      if (!node || !resetAt) continue;
      node.textContent = `${msg('resetPrefix')} ${formatReset(resetAt)}`;
      if (new Date(resetAt) - Date.now() <= 0) expired = true;
    }
    if (expired) { clearInterval(countdownInterval); triggerRefresh(false); }
  }, 60_000);
}

// --- HEALTH ---
const HEALTH_POPUP_KEYS = {
  api_schema_changed: 'healthPopupApiChanged',
  api_unreachable: 'healthPopupApiUnreachable',
  sidebar_not_found: 'healthPopupSidebarNotFound',
  widget_lost: 'healthPopupWidgetLost',
};

function checkHealth() {
  chrome.storage.local.get('claudeHealth', ({ claudeHealth }) => {
    if (!claudeHealth || claudeHealth.status === 'ok') return;
    const key = HEALTH_POPUP_KEYS[claudeHealth.status];
    const text = key ? msg(key) : msg('healthPopupUnknown', [claudeHealth.status]);
    const banner = el('div', 'health-warning');
    banner.append(el('span', 'health-icon', '\u26A0\uFE0F'));
    banner.append(el('span', null, text));
    const header = document.querySelector('.header');
    if (header?.nextSibling) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    } else {
      contentEl.prepend(banner);
    }
  });
}

// --- ERROR STATES ---
function showError() {
  const wrap = el('div', 'error-state');
  wrap.append(el('div', 'icon', '\u26A0\uFE0F'));
  wrap.append(el('p', null, msg('errorTitle')));
  const link = el('a', null, msg('errorRetry'));
  link.href = '#';
  link.addEventListener('click', e => { e.preventDefault(); triggerRefresh(true); });
  wrap.append(link);
  contentEl.replaceChildren(wrap);
  checkHealth();
}

function showNoData() {
  const wrap = el('div', 'no-data');
  wrap.append(el('p', null, msg('noData')));
  wrap.append(el('p', 'hint', msg('noDataHint')));
  contentEl.replaceChildren(wrap);
  checkHealth();
}

// @sync: content.js:formatResetShort — verbose version for popup
function formatReset(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = new Date(isoStr) - Date.now();
    if (diff <= 0) return msg('resetImminentLong');
    const min = Math.floor(diff / 60_000);
    const h = Math.floor(min / 60);
    const rm = min % 60;
    if (h >= 24) {
      const d = new Date(isoStr);
      const days = [msg('daySun'), msg('dayMon'), msg('dayTue'), msg('dayWed'), msg('dayThu'), msg('dayFri'), msg('daySat')];
      return `${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (h > 0) return rm > 0 ? msg('resetInHM', [h, rm]) : msg('resetInH', [h]);
    return msg('resetInMin', [min]);
  } catch { return ''; }
}
