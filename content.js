(() => {
  if (window.__cuw_injected) return;
  window.__cuw_injected = true;

  // --- CONSTANTS ---
  const WIDGET_ID = 'claude-usage-widget';
  const CUW_MARKER = 'data-cuw-owned';
  const SIDEBAR_THRESHOLD = 100;    // px — below this, widget is collapsed
  const INIT_POLL_MS = 500;
  const INIT_MAX_ATTEMPTS = 60;     // = 30s of polling
  const HEAL_INTERVAL_MS = 3000;
  const SPA_NAV_DELAY_MS = 800;

  // @sync: background.js, popup.js
  const THRESHOLDS = { low: 50, high: 80 };
  const msg = chrome.i18n.getMessage;

  let currentPct = 0;
  let currentUsage = null;
  let sidebar = null;
  let resizeObserver = null;
  let currentTheme = 'dark';

  // --- EXTENSION CONTEXT GUARD ---
  function isExtensionAlive() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }
  function safeSendMessage(data, cb) {
    if (!isExtensionAlive()) return;
    try { chrome.runtime.sendMessage(data, cb); } catch { /* context invalidated */ }
  }
  function safeStorageGet(key, cb) {
    if (!isExtensionAlive()) return;
    try { chrome.storage.local.get(key, cb); } catch { /* context invalidated */ }
  }
  function safeStorageSet(data) {
    if (!isExtensionAlive()) return;
    try { chrome.storage.local.set(data); } catch { /* context invalidated */ }
  }

  // --- HELPERS ---
  const $ = id => document.getElementById(id);
  const levelClass = pct => pct < THRESHOLDS.low ? 'low' : pct < THRESHOLDS.high ? 'mid' : 'high';
  const levelColorClass = pct => pct < THRESHOLDS.low ? 'cuw-low' : pct < THRESHOLDS.high ? 'cuw-mid' : 'cuw-high';
  const safePct = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; };
  const safeTimestamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(v) ? v : '';

  // @sync: popup.js:continuousColor — same algorithm, keep in sync
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

  // @sync: popup.js:formatReset — compact version for sidebar (popup has verbose version)
  function formatResetShort(isoStr) {
    if (!isoStr) return '';
    try {
      const diff = new Date(isoStr) - Date.now();
      if (diff <= 0) return msg('resetImminent');
      const min = Math.floor(diff / 60_000);
      const h = Math.floor(min / 60);
      const rm = min % 60;
      if (h >= 24) {
        const d = new Date(isoStr);
        const days = [msg('daySun'), msg('dayMon'), msg('dayTue'), msg('dayWed'), msg('dayThu'), msg('dayFri'), msg('daySat')];
        return `${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      if (h > 0) return rm > 0 ? msg('resetShortHM', [h, rm]) : msg('resetShortH', [h]);
      return msg('resetShortMin', [min]);
    } catch { return ''; }
  }

  // --- THEME ---
  function detectTheme() {
    const bg = getComputedStyle(document.body).backgroundColor;
    const r = bg.match(/rgb\((\d+)/);
    return r && parseInt(r[1]) > 128 ? 'light' : 'dark';
  }

  function applyTheme() {
    const theme = detectTheme();
    if (theme === currentTheme) return;
    currentTheme = theme;
    document.documentElement.setAttribute('data-cuw-theme', currentTheme);
    $(WIDGET_ID)?.setAttribute('data-theme', currentTheme);
  }

  // --- FIND SIDEBAR ---
  const findSidebar = () =>
    document.querySelector('[class*="z-sidebar"]') ??
    [...document.querySelectorAll('div[class*="sidebar"]')].find(d => d.offsetWidth > 0) ??
    null;

  function isSidebarReady(sb) {
    if (!sb) return false;
    return /R[eé]cents?/i.test(sb.textContent);
  }

  // --- DOM BUILDER HELPERS (zero innerHTML) ---
  function dom(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'text') el.textContent = v;
        else if (k === 'cls') el.className = v;
        else el.setAttribute(k, v);
      }
    }
    if (children) {
      for (const child of children) el.appendChild(child);
    }
    return el;
  }

  // --- CREATE WIDGET (refacto #1: zero innerHTML) ---
  function createWidget() {
    const existing = $(WIDGET_ID);
    if (existing) return existing;

    currentTheme = detectTheme();

    const widget = dom('div', {
      id: WIDGET_ID,
      [CUW_MARKER]: '',
      role: 'region',
      'aria-label': msg('widgetAria'),
      'aria-describedby': 'cuw-tooltip',
      tabindex: '0',
      'data-theme': currentTheme,
    });
    document.documentElement.setAttribute('data-cuw-theme', currentTheme);

    // Collapsed content
    const collapsed = dom('div', { cls: 'cuw-collapsed-content' }, [
      dom('span', { cls: 'cuw-mini-pct', id: 'cuw-mini-pct', 'aria-hidden': 'true', text: '-' }),
    ]);

    // Expanded content — session row
    const sessionRow = dom('div', { cls: 'cuw-row cuw-row-session' }, [
      dom('span', { cls: 'cuw-label', id: 'cuw-label-session', text: msg('session') }),
      dom('span', { cls: 'cuw-pct', id: 'cuw-pct', text: '-' }),
    ]);
    const sessionTrack = dom('div', {
      cls: 'cuw-track cuw-track-session', role: 'progressbar',
      'aria-labelledby': 'cuw-label-session', 'aria-valuenow': '0',
      'aria-valuemin': '0', 'aria-valuemax': '100', id: 'cuw-bar-session',
    }, [
      dom('div', { cls: 'cuw-fill', id: 'cuw-fill' }),
    ]);
    const sessionReset = dom('div', { cls: 'cuw-reset-session', id: 'cuw-reset-session' });

    // Expanded content — weekly row
    const weeklyRow = dom('div', { cls: 'cuw-row cuw-row-hebdo' }, [
      dom('span', { cls: 'cuw-label', id: 'cuw-label-hebdo', text: msg('weekly') }),
      dom('span', { cls: 'cuw-pct', id: 'cuw-pct-hebdo', text: '-' }),
    ]);
    const weeklyTrack = dom('div', {
      cls: 'cuw-track cuw-track-hebdo', role: 'progressbar',
      'aria-labelledby': 'cuw-label-hebdo', 'aria-valuenow': '0',
      'aria-valuemin': '0', 'aria-valuemax': '100', id: 'cuw-bar-hebdo',
    }, [
      dom('div', { cls: 'cuw-fill', id: 'cuw-fill-hebdo' }),
    ]);
    const weeklyReset = dom('div', { cls: 'cuw-reset-hebdo', id: 'cuw-reset-hebdo' });

    const expanded = dom('div', { cls: 'cuw-expanded-content' }, [
      sessionRow, sessionTrack, sessionReset,
      weeklyRow, weeklyTrack, weeklyReset,
    ]);

    widget.append(collapsed, expanded);

    // Click → open usage (Little Arc on Arc, new tab on Chrome)
    // If already on usage page, shake to indicate "you're already here"
    widget.addEventListener('click', () => {
      if (location.pathname.startsWith('/settings/usage')) {
        widget.classList.add('cuw-shake');
        widget.addEventListener('animationend', () => widget.classList.remove('cuw-shake'), { once: true });
        return;
      }
      const isArc = !!getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-background');
      safeSendMessage({ type: 'open_usage', isArc });
    });

    // Tooltip
    ensureTooltip();
    widget.addEventListener('mouseenter', () => {
      if (!widget.classList.contains('cuw-collapsed')) return;
      const tooltip = $('cuw-tooltip');
      if (!tooltip) return;
      const rect = widget.getBoundingClientRect();
      tooltip.style.left = `${rect.right + 10}px`;
      tooltip.style.top = `${rect.top + rect.height / 2}px`;
      tooltip.classList.add('cuw-tooltip-visible');
    });
    widget.addEventListener('mouseleave', () => {
      $('cuw-tooltip')?.classList.remove('cuw-tooltip-visible');
    });

    return widget;
  }

  function ensureTooltip() {
    const existing = $('cuw-tooltip');
    if (existing && existing.hasAttribute(CUW_MARKER)) return;
    if (existing) existing.remove();
    const tip = dom('div', { id: 'cuw-tooltip', cls: 'cuw-tooltip', role: 'tooltip', [CUW_MARKER]: '' });
    document.body.appendChild(tip);
  }

  // --- INJECTION ---
  function findInsertionPoint(sb) {
    const links = [...sb.querySelectorAll('a')];
    let target = links.find(a => a.textContent.trim() === 'Code');
    if (!target) target = links.find(a => /^Code\b/.test(a.textContent.trim()));
    if (!target) {
      const recentsIdx = links.findIndex(a => /^R[eé]cents?$/i.test(a.textContent.trim()));
      if (recentsIdx > 0) target = links[recentsIdx - 1];
    }
    if (!target && links.length >= 8) target = links[7];
    if (!target) return null;
    const parent = target.parentElement;
    return parent?.parentElement?.tagName === 'LI' ? parent.parentElement : parent;
  }

  function injectWidget() {
    const existing = $(WIDGET_ID);
    if (existing && existing.hasAttribute(CUW_MARKER)) return true;
    if (existing && !existing.hasAttribute(CUW_MARKER)) existing.remove();

    sidebar = findSidebar();
    if (!sidebar || !isSidebarReady(sidebar)) return false;

    const widget = createWidget();
    const anchor = findInsertionPoint(sidebar);
    if (anchor) {
      anchor.parentNode.insertBefore(widget, anchor.nextSibling);
    } else {
      sidebar.appendChild(widget);
    }

    updateMode();
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => updateMode());
    resizeObserver.observe(sidebar);
    return true;
  }

  // --- MODE ---
  function updateMode() {
    const widget = $(WIDGET_ID);
    if (!widget || !sidebar) return;
    widget.className = sidebar.offsetWidth < SIDEBAR_THRESHOLD
      ? `cuw-collapsed ${levelColorClass(currentPct)}`
      : 'cuw-expanded';
  }

  // --- UPDATE ---
  function updateWidget(pct, usage) {
    pct = safePct(pct);
    currentPct = pct;
    if (usage) currentUsage = usage;
    const level = levelClass(pct);

    // Session
    const pctEl = $('cuw-pct');
    const fillEl = $('cuw-fill');
    const barEl = $('cuw-bar-session');
    if (pctEl) { pctEl.textContent = `${pct}%`; pctEl.className = `cuw-pct ${level}`; }
    if (fillEl) {
      fillEl.className = `cuw-fill ${level}`;
      fillEl.style.backgroundColor = continuousColor(pct);
      requestAnimationFrame(() => { fillEl.style.width = `${pct}%`; });
    }
    if (barEl) barEl.setAttribute('aria-valuenow', String(pct));

    // Collapsed
    const miniEl = $('cuw-mini-pct');
    if (miniEl) miniEl.textContent = pct >= 100 ? '\u270B' : pct;

    // Weekly
    if (currentUsage?.seven_day) {
      const hp = safePct(currentUsage.seven_day.utilization);
      const hl = levelClass(hp);
      const hPct = $('cuw-pct-hebdo');
      const hFill = $('cuw-fill-hebdo');
      const hBar = $('cuw-bar-hebdo');
      if (hPct) { hPct.textContent = `${hp}%`; hPct.className = `cuw-pct ${hl}`; }
      if (hFill) {
        hFill.className = `cuw-fill ${hl}`;
        hFill.style.backgroundColor = continuousColor(hp);
        requestAnimationFrame(() => { hFill.style.width = `${hp}%`; });
      }
      if (hBar) hBar.setAttribute('aria-valuenow', String(hp));
    }

    // Reset times
    const rSession = $('cuw-reset-session');
    if (rSession && currentUsage?.five_hour?.resets_at) {
      rSession.textContent = `${msg('resetPrefix')} ${formatResetShort(safeTimestamp(currentUsage.five_hour.resets_at))}`;
    }
    const rHebdo = $('cuw-reset-hebdo');
    if (rHebdo && currentUsage?.seven_day?.resets_at) {
      rHebdo.textContent = `${msg('resetPrefix')} ${formatResetShort(safeTimestamp(currentUsage.seven_day.resets_at))}`;
    }

    // Tooltip
    const tooltipEl = $('cuw-tooltip');
    if (tooltipEl) tooltipEl.replaceChildren(buildTooltipContent(pct, currentUsage));

    updateMode();
  }

  function buildTooltipContent(pct, usage) {
    const frag = document.createDocumentFragment();
    const line = (label, value) => {
      const row = dom('div', { cls: 'cuw-tt-line' }, [
        dom('span', { cls: 'cuw-tt-label', text: label }),
        dom('span', { cls: 'cuw-tt-val', text: value }),
      ]);
      return row;
    };
    const reset = (isoStr) => dom('div', { cls: 'cuw-tt-reset', text: `${msg('resetPrefix')} ${formatResetShort(safeTimestamp(isoStr))}` });
    const sep = () => dom('div', { cls: 'cuw-tt-sep' });

    frag.append(line(msg('session'), `${safePct(pct)}%`));
    if (usage?.five_hour?.resets_at) frag.append(reset(usage.five_hour.resets_at));
    if (usage?.seven_day) {
      frag.append(sep());
      frag.append(line(msg('weekly'), `${safePct(usage.seven_day.utilization)}%`));
      if (usage.seven_day.resets_at) frag.append(reset(usage.seven_day.resets_at));
    }
    return frag;
  }

  // --- FREE PLAN ---
  function showFreePlanWidget() {
    const miniEl = $('cuw-mini-pct');
    if (miniEl) { miniEl.textContent = '~'; miniEl.style.fontSize = '13px'; }

    const pctEl = $('cuw-pct');
    if (pctEl) { pctEl.textContent = ''; pctEl.className = 'cuw-pct'; }
    const fillEl = $('cuw-fill');
    if (fillEl) fillEl.style.width = '0%';
    const labelEl = $('cuw-label-session');
    if (labelEl) labelEl.textContent = msg('freePlanWidget');
    const resetEl = $('cuw-reset-session');
    if (resetEl) resetEl.textContent = '';

    for (const id of ['cuw-pct-hebdo', 'cuw-label-hebdo', 'cuw-reset-hebdo']) {
      const el = $(id);
      if (el) el.textContent = '';
    }
    const hFill = $('cuw-fill-hebdo');
    if (hFill) hFill.style.width = '0%';

    currentPct = 0;
    updateMode();
  }

  // --- FETCH ---
  function fetchInitial() {
    safeStorageGet('claudeData', ({ claudeData }) => {
      if (claudeData?.usage?.five_hour) {
        updateWidget(claudeData.usage.five_hour.utilization ?? 0, claudeData.usage);
      } else if (claudeData?.usage && !claudeData.usage.five_hour) {
        showFreePlanWidget();
      } else {
        safeSendMessage({ type: 'force_refresh' });
      }
    });
  }

  // --- STORAGE LISTENER ---
  chrome.storage.onChanged.addListener(changes => {
    const data = changes.claudeData?.newValue;
    if (data?.usage?.five_hour) {
      injectWidget();
      updateWidget(data.usage.five_hour.utilization ?? 0, data.usage);
    } else if (data?.usage && !data.usage.five_hour) {
      injectWidget();
      showFreePlanWidget();
    }

    const health = changes.claudeHealth?.newValue;
    if (health) {
      health.status === 'ok' ? removeHealthBanner() : showHealthBanner(health.status);
    }
  });

  // --- HEALTH BANNER ---
  const BANNER_ID = 'cuw-health-banner';
  const HEALTH_BANNER_KEYS = {
    api_schema_changed: 'healthApiChanged',
    api_unreachable: 'healthApiUnreachable',
    sidebar_not_found: 'healthSidebarNotFound',
    widget_lost: 'healthWidgetLost',
  };

  function showHealthBanner(status) {
    removeHealthBanner();
    const key = HEALTH_BANNER_KEYS[status];
    const text = key ? msg(key) : status;
    if (!text) return;

    const banner = dom('div', { id: BANNER_ID, role: 'alert', [CUW_MARKER]: '' }, [
      dom('span', { text: `\u26A0\uFE0F ${text}` }),
    ]);
    const close = dom('button', { 'aria-label': msg('closeBtnAria'), text: '\u2715' });
    close.addEventListener('click', () => banner.remove());
    banner.appendChild(close);
    document.body.appendChild(banner);
  }

  function removeHealthBanner() {
    const existing = $(BANNER_ID);
    if (existing && existing.hasAttribute(CUW_MARKER)) existing.remove();
  }

  // --- INIT ---
  let attempts = 0;
  const initInterval = setInterval(() => {
    if (!isExtensionAlive()) { clearInterval(initInterval); return; }
    if (++attempts > INIT_MAX_ATTEMPTS) {
      clearInterval(initInterval);
      safeStorageSet({
        claudeHealth: {
          status: 'sidebar_not_found',
          detail: `findSidebar=${!!findSidebar()} isSidebarReady=${findSidebar() ? isSidebarReady(findSidebar()) : false}`,
          updated_at: new Date().toISOString(),
        }
      });
      return;
    }
    if (injectWidget()) {
      clearInterval(initInterval);
      fetchInitial();
      startSelfHeal();
    }
  }, INIT_POLL_MS);

  // --- SELF-HEAL (persistent, entire page lifetime) ---
  function startSelfHeal() {
    setInterval(() => {
      if (!isExtensionAlive()) return;
      if (!$(WIDGET_ID)) {
        if (injectWidget()) fetchInitial();
      }
    }, HEAL_INTERVAL_MS);
  }

  // --- SPA NAV (with retry) ---
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(() => {
      if (!$(WIDGET_ID) && injectWidget()) fetchInitial();
    }, SPA_NAV_DELAY_MS);
    setTimeout(() => {
      if (!$(WIDGET_ID) && injectWidget()) fetchInitial();
    }, SPA_NAV_DELAY_MS * 3);
  }).observe(document.body, { childList: true });

  // --- THEME OBSERVER ---
  const themeObs = new MutationObserver(() => applyTheme());
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] });
  themeObs.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

  // --- CHECK HEALTH ON LOAD ---
  safeStorageGet('claudeHealth', ({ claudeHealth }) => {
    if (claudeHealth && claudeHealth.status !== 'ok') {
      showHealthBanner(claudeHealth.status);
    }
  });

})();
