/* DemoShield Blur — In-Page Shadow-DOM HUD, Click-to-Blur Inspector & Local Regex Auto-Mask Engine
 * Non-destructive: never mutates React/Vue component state or input values; 100% restorable on Unblur All.
 * Purely local: zero network requests, zero telemetry.
 */
(function () {
  'use strict';

  // Idempotent guard so repeated chrome.scripting.executeScript calls reuse the live controller
  if (window.__DEMOSHIELD_BLUR__) {
    return;
  }

  const Rules = window.DemoShieldRules;
  if (!Rules) {
    console.warn('[DemoShield Blur] rules.js was not loaded prior to content.js');
    return;
  }

  const STYLE_ID = 'demoshield-page-styles';
  const HUD_HOST_ID = 'demoshield-hud-host';
  const STORAGE_SETTINGS_KEY = 'demoshield_settings_v1';
  const STORAGE_PROFILES_KEY = 'demoshield_origin_profiles_v1';
  const FREE_AUTO_MASK_LIMIT = 5;
  const FREE_ORIGIN_PROFILE_LIMIT = 1;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED',
    'HEAD', 'META', 'LINK', 'TITLE', 'SVG', 'PATH', 'DEFS', 'CANVAS', 'VIDEO', 'AUDIO'
  ]);

  const state = {
    hudVisible: false,
    pickerActive: false,
    mode: 'blur',             // 'blur' | 'redact'
    blurPx: 8,
    redactLabel: '••••••',
    proUnlocked: false,
    activeAutoCats: {
      apiKeys: false,
      emails: false,
      currency: false,
      phonesCards: false
    },
    manualElements: new Set(),
    autoElements: new Set(),
    autoSpans: new Set(),
    hoveredEl: null,
    savedOriginCount: 0,
    lastReplayMs: null,
    statusText: 'Ready · Local only'
  };

  let hudHost = null;
  let hudShadow = null;
  let hoverBox = null;
  let hoverTag = null;
  let dragState = null;

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } else {
        const out = {};
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) {
          try {
            const raw = window.localStorage.getItem('__ds_fallback_' + k);
            if (raw) out[k] = JSON.parse(raw);
          } catch (_) {}
        }
        resolve(out);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, () => resolve());
      } else {
        for (const [k, v] of Object.entries(obj)) {
          try {
            window.localStorage.setItem('__ds_fallback_' + k, JSON.stringify(v));
          } catch (_) {}
        }
        resolve();
      }
    });
  }

  function getOriginKey() {
    try {
      return window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : (window.location.protocol + '//' + (window.location.host || 'local'));
    } catch (_) {
      return 'local';
    }
  }

  function ensurePageStyles() {
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    const px = Math.max(4, Math.min(20, Number(state.blurPx) || 8));
    const safeLabel = String(state.redactLabel || '••••••').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    styleEl.textContent = `
      :root {
        --demoshield-blur-px: ${px}px;
      }
      [data-demoshield-mask="blur"] {
        filter: blur(var(--demoshield-blur-px, 8px)) !important;
        user-select: none !important;
      }
      [data-demoshield-mask="redact"] {
        position: relative !important;
        color: transparent !important;
        text-shadow: none !important;
        user-select: none !important;
        background-color: #0F172A !important;
        border-radius: 5px !important;
        box-shadow: inset 0 0 0 1px #1E293B !important;
      }
      [data-demoshield-mask="redact"] * {
        color: transparent !important;
        text-shadow: none !important;
        visibility: hidden !important;
      }
      [data-demoshield-mask="redact"]::after {
        content: attr(data-demoshield-label);
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: #0F172A !important;
        color: #94A3B8 !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: 0.08em !important;
        border-radius: 5px !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        visibility: visible !important;
        z-index: 2 !important;
      }
      img[data-demoshield-mask="redact"],
      svg[data-demoshield-mask="redact"],
      canvas[data-demoshield-mask="redact"],
      input[data-demoshield-mask="redact"],
      textarea[data-demoshield-mask="redact"] {
        filter: brightness(0.08) contrast(0.2) blur(4px) !important;
      }
      ds-mask[data-demoshield-mask="blur"] {
        display: inline-block !important;
        filter: blur(var(--demoshield-blur-px, 8px)) !important;
        user-select: none !important;
        border-radius: 4px !important;
      }
      ds-mask[data-demoshield-mask="redact"] {
        display: inline-block !important;
        position: relative !important;
        color: transparent !important;
        background: #0F172A !important;
        border-radius: 4px !important;
        padding: 0 5px !important;
        vertical-align: baseline !important;
      }
      ds-mask[data-demoshield-mask="redact"]::after {
        content: "${safeLabel}";
        position: absolute !important;
        inset: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #CBD5E1 !important;
        background: #0F172A !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        font-size: 0.82em !important;
        font-weight: 700 !important;
        letter-spacing: 0.06em !important;
        border-radius: 4px !important;
        pointer-events: none !important;
      }
    `;
  }

  function applyMaskAttr(el, kind) {
    ensurePageStyles();
    el.setAttribute('data-demoshield-mask', state.mode);
    el.setAttribute('data-demoshield-label', state.redactLabel || '••••••');
    if (kind === 'manual') {
      el.setAttribute('data-demoshield-manual', '1');
      state.manualElements.add(el);
    } else if (kind === 'auto-el') {
      el.setAttribute('data-demoshield-auto-el', '1');
      state.autoElements.add(el);
    } else if (kind === 'auto-span') {
      state.autoSpans.add(el);
    }
  }

  function removeManualMask(el) {
    el.removeAttribute('data-demoshield-manual');
    state.manualElements.delete(el);
    if (!el.hasAttribute('data-demoshield-auto-el')) {
      el.removeAttribute('data-demoshield-mask');
      el.removeAttribute('data-demoshield-label');
    }
  }

  function toggleManualMask(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.id === HUD_HOST_ID || (hudHost && hudHost.contains(el))) return false;
    if (el.hasAttribute('data-demoshield-manual')) {
      removeManualMask(el);
      state.statusText = 'Unmasked element';
      updateHudUI();
      return false;
    }
    applyMaskAttr(el, 'manual');
    state.statusText = `Masked <${el.tagName.toLowerCase()}>`;
    updateHudUI();
    return true;
  }

  function refreshAllMaskedModes() {
    ensurePageStyles();
    const label = state.redactLabel || '••••••';
    for (const el of state.manualElements) {
      if (el.isConnected) {
        el.setAttribute('data-demoshield-mask', state.mode);
        el.setAttribute('data-demoshield-label', label);
      }
    }
    for (const el of state.autoElements) {
      if (el.isConnected) {
        el.setAttribute('data-demoshield-mask', state.mode);
        el.setAttribute('data-demoshield-label', label);
      }
    }
    for (const sp of state.autoSpans) {
      if (sp.isConnected) {
        sp.setAttribute('data-demoshield-mask', state.mode);
        sp.setAttribute('data-demoshield-label', label);
      }
    }
  }

  function clearAutoMasks() {
    for (const el of Array.from(state.autoElements)) {
      if (el && el.isConnected) {
        el.removeAttribute('data-demoshield-auto-el');
        el.removeAttribute('data-demoshield-cat');
        if (!el.hasAttribute('data-demoshield-manual')) {
          el.removeAttribute('data-demoshield-mask');
          el.removeAttribute('data-demoshield-label');
        }
      }
    }
    state.autoElements.clear();

    const parentsToNormalize = new Set();
    for (const sp of Array.from(state.autoSpans)) {
      if (sp && sp.isConnected && sp.parentNode) {
        const parent = sp.parentNode;
        const textNode = document.createTextNode(sp.textContent || '');
        parent.replaceChild(textNode, sp);
        parentsToNormalize.add(parent);
      }
    }
    state.autoSpans.clear();
    for (const p of parentsToNormalize) {
      try { p.normalize(); } catch (_) {}
    }
  }

  function unblurAll() {
    clearAutoMasks();
    for (const el of Array.from(state.manualElements)) {
      if (el && el.isConnected) {
        el.removeAttribute('data-demoshield-manual');
        el.removeAttribute('data-demoshield-mask');
        el.removeAttribute('data-demoshield-label');
      }
    }
    state.manualElements.clear();
    state.activeAutoCats = { apiKeys: false, emails: false, currency: false, phonesCards: false };
    state.statusText = 'All masks cleared · DOM restored';
    updateHudUI();
    return getPublicState();
  }

  function isInsideHud(node) {
    if (!node) return false;
    let cur = node.nodeType === 1 ? node : node.parentElement;
    while (cur) {
      if (cur.id === HUD_HOST_ID) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function isLeafSingleTextElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.children.length > 0) return false;
    return true;
  }

  function runAutoMask(categoriesInput) {
    const t0 = performance.now();
    if (Array.isArray(categoriesInput)) {
      state.activeAutoCats = {
        apiKeys: categoriesInput.includes('apiKeys'),
        emails: categoriesInput.includes('emails'),
        currency: categoriesInput.includes('currency'),
        phonesCards: categoriesInput.includes('phonesCards')
      };
    } else if (categoriesInput && typeof categoriesInput === 'object') {
      state.activeAutoCats = {
        apiKeys: Boolean(categoriesInput.apiKeys),
        emails: Boolean(categoriesInput.emails),
        currency: Boolean(categoriesInput.currency),
        phonesCards: Boolean(categoriesInput.phonesCards)
      };
    }
    const enabled = Object.keys(state.activeAutoCats).filter((k) => state.activeAutoCats[k]);

    clearAutoMasks();
    if (!enabled.length) {
      state.statusText = 'Auto-Mask off';
      updateHudUI();
      return { matched: 0, elapsedMs: 0 };
    }

    ensurePageStyles();
    const maxMatches = state.proUnlocked ? Infinity : FREE_AUTO_MASK_LIMIT;
    let matchCount = 0;
    let totalDetected = 0;
    let limitedByFree = false;

    // 1. Scan text inputs/textareas non-destructively (never mutates .value)
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input:not([type]), textarea');
    for (const inp of inputs) {
      if (isInsideHud(inp)) continue;
      const val = inp.value || '';
      if (!val || val.length > 2000) continue;
      const found = Rules.detectMatches(val, enabled);
      if (found.length > 0) {
        totalDetected += found.length;
        if (matchCount < maxMatches) {
          inp.setAttribute('data-demoshield-cat', found[0].category);
          applyMaskAttr(inp, 'auto-el');
          matchCount += 1;
        } else {
          limitedByFree = true;
        }
      }
    }

    // 2. Collect text nodes cleanly before wrapping any mixed prose tokens
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.tagName === 'DS-MASK') return NodeFilter.FILTER_REJECT;
          if (isInsideHud(parent)) return NodeFilter.FILTER_REJECT;
          if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
          const v = node.nodeValue;
          if (!v || v.trim().length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let n;
    while ((n = walker.nextNode())) {
      textNodes.push(n);
    }

    for (const textNode of textNodes) {
      const parent = textNode.parentElement;
      if (!parent || !parent.isConnected) continue;
      if (parent.hasAttribute('data-demoshield-auto-el')) continue;

      const text = textNode.nodeValue || '';
      const matches = Rules.detectMatches(text, enabled);
      if (matches.length === 0) continue;

      totalDetected += matches.length;
      if (matchCount >= maxMatches) {
        limitedByFree = true;
        continue;
      }

      const trimmed = text.trim();
      if (
        isLeafSingleTextElement(parent) &&
        matches.length === 1 &&
        matches[0].text.trim() === trimmed
      ) {
        parent.setAttribute('data-demoshield-cat', matches[0].category);
        applyMaskAttr(parent, 'auto-el');
        matchCount += 1;
        continue;
      }

      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const m of matches) {
        if (matchCount >= maxMatches) {
          limitedByFree = true;
          break;
        }
        if (m.start > cursor) {
          frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
        }
        const span = document.createElement('ds-mask');
        span.textContent = text.slice(m.start, m.end);
        span.setAttribute('data-demoshield-cat', m.category);
        applyMaskAttr(span, 'auto-span');
        frag.appendChild(span);
        cursor = m.end;
        matchCount += 1;
      }
      if (cursor < text.length) {
        frag.appendChild(document.createTextNode(text.slice(cursor)));
      }
      parent.replaceChild(frag, textNode);
    }

    const elapsedMs = Math.max(0.1, Number((performance.now() - t0).toFixed(1)));
    state.statusText = limitedByFree
      ? `Free preview: ${matchCount}/${totalDetected} masked · Pro unlocks all`
      : `Auto-masked ${matchCount} item${matchCount === 1 ? '' : 's'} in ${elapsedMs}ms`;
    updateHudUI();
    return { matched: matchCount, totalDetected, limitedByFree, elapsedMs };
  }

  async function saveOriginProfile() {
    const origin = getOriginKey();
    const selectors = [];
    const seen = new Set();
    for (const el of state.manualElements) {
      if (!el || !el.isConnected) continue;
      const sel = Rules.buildStableSelector(el, document);
      if (sel && !seen.has(sel)) {
        seen.add(sel);
        selectors.push(sel);
      }
    }

    const stored = await storageGet(STORAGE_PROFILES_KEY);
    const profiles = (stored && stored[STORAGE_PROFILES_KEY]) || {};
    const existingOrigins = Object.keys(profiles);
    if (!state.proUnlocked && !profiles[origin] && existingOrigins.length >= FREE_ORIGIN_PROFILE_LIMIT) {
      state.statusText = `Free tier allows ${FREE_ORIGIN_PROFILE_LIMIT} saved site · Pro unlocks unlimited`;
      updateHudUI();
      return { ok: false, origin, limitedByFree: true, error: state.statusText };
    }
    profiles[origin] = {
      origin,
      selectors,
      autoMask: { ...state.activeAutoCats },
      mode: state.mode,
      updatedAt: new Date().toISOString()
    };
    await storageSet({ [STORAGE_PROFILES_KEY]: profiles });
    state.savedOriginCount = selectors.length;
    state.statusText = `Saved ${selectors.length} rule${selectors.length === 1 ? '' : 's'} for ${origin}`;
    updateHudUI();
    return { ok: true, origin, selectorCount: selectors.length };
  }

  async function clearOriginProfile() {
    const origin = getOriginKey();
    const stored = await storageGet(STORAGE_PROFILES_KEY);
    const profiles = (stored && stored[STORAGE_PROFILES_KEY]) || {};
    delete profiles[origin];
    await storageSet({ [STORAGE_PROFILES_KEY]: profiles });
    state.savedOriginCount = 0;
    state.statusText = `Cleared saved profile for ${origin}`;
    updateHudUI();
    return { ok: true, origin };
  }

  async function applyOriginProfile() {
    const t0 = performance.now();
    const origin = getOriginKey();
    const stored = await storageGet([STORAGE_SETTINGS_KEY, STORAGE_PROFILES_KEY]);
    const savedSettings = stored[STORAGE_SETTINGS_KEY] || {};
    if (savedSettings.mode) state.mode = savedSettings.mode;
    if (typeof savedSettings.blurPx === 'number') state.blurPx = savedSettings.blurPx;
    if (typeof savedSettings.redactLabel === 'string' && savedSettings.redactLabel) {
      state.redactLabel = savedSettings.redactLabel;
    }
    if (typeof savedSettings.proUnlocked === 'boolean') {
      state.proUnlocked = savedSettings.proUnlocked;
    }

    const profiles = stored[STORAGE_PROFILES_KEY] || {};
    const profile = profiles[origin];
    if (!profile) {
      state.savedOriginCount = 0;
      return { applied: 0, elapsedMs: 0 };
    }

    if (profile.mode) state.mode = profile.mode;
    let applied = 0;
    if (Array.isArray(profile.selectors)) {
      state.savedOriginCount = profile.selectors.length;
      for (const sel of profile.selectors) {
        try {
          const matches = document.querySelectorAll(sel);
          for (const el of matches) {
            if (!isInsideHud(el)) {
              applyMaskAttr(el, 'manual');
              applied++;
            }
          }
        } catch (_) {}
      }
    }

    if (profile.autoMask) {
      state.activeAutoCats = {
        apiKeys: Boolean(profile.autoMask.apiKeys),
        emails: Boolean(profile.autoMask.emails),
        currency: Boolean(profile.autoMask.currency),
        phonesCards: Boolean(profile.autoMask.phonesCards)
      };
      const anyAuto = Object.values(state.activeAutoCats).some(Boolean);
      if (anyAuto) {
        const res = runAutoMask(state.activeAutoCats);
        applied += res.matched;
      }
    }

    const elapsedMs = Number((performance.now() - t0).toFixed(2));
    state.lastReplayMs = elapsedMs;
    if (applied > 0) {
      state.statusText = `Re-applied ${applied} saved mask${applied === 1 ? '' : 's'} in ${elapsedMs}ms`;
    }
    updateHudUI();
    return { applied, elapsedMs };
  }

  function updateHoverBox(el) {
    if (!hoverBox || !hoverTag) return;
    if (!el || !state.pickerActive || isInsideHud(el) || el === document.body || el === document.documentElement) {
      hoverBox.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hoverBox.style.display = 'none';
      return;
    }
    hoverBox.style.display = 'block';
    hoverBox.style.left = `${Math.max(0, rect.left - 2)}px`;
    hoverBox.style.top = `${Math.max(0, rect.top - 2)}px`;
    hoverBox.style.width = `${rect.width + 4}px`;
    hoverBox.style.height = `${rect.height + 4}px`;

    const isMasked = el.hasAttribute('data-demoshield-manual');
    const tagDesc = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
    hoverTag.textContent = isMasked ? `Click to unblur <${tagDesc}>` : `Click to ${state.mode} <${tagDesc}>`;
  }

  function onPointerMove(e) {
    if (!state.pickerActive) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isInsideHud(target)) {
      state.hoveredEl = null;
      updateHoverBox(null);
      return;
    }
    state.hoveredEl = target;
    updateHoverBox(target);
  }

  function onPointerClick(e) {
    if (!state.pickerActive) return;
    if (isInsideHud(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const target = state.hoveredEl || e.target;
    toggleManualMask(target);
  }

  function onContextMenu(e) {
    if (!state.pickerActive) return;
    if (isInsideHud(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    setPickerActive(false);
    state.statusText = 'Picker paused (right-click)';
    updateHudUI();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && state.pickerActive) {
      e.preventDefault();
      e.stopPropagation();
      setPickerActive(false);
      state.statusText = 'Picker paused (Esc)';
      updateHudUI();
    }
  }

  function setPickerActive(active) {
    state.pickerActive = Boolean(active);
    if (state.pickerActive) {
      document.addEventListener('mousemove', onPointerMove, true);
      document.addEventListener('click', onPointerClick, true);
      document.addEventListener('contextmenu', onContextMenu, true);
      document.addEventListener('keydown', onKeyDown, true);
      document.documentElement.style.cursor = 'crosshair';
      state.statusText = 'Click any element to mask · Esc or right-click to stop';
    } else {
      document.removeEventListener('mousemove', onPointerMove, true);
      document.removeEventListener('click', onPointerClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.documentElement.style.cursor = '';
      state.hoveredEl = null;
      updateHoverBox(null);
    }
    updateHudUI();
  }

  function mountHud() {
    if (hudHost && hudHost.isConnected) return;

    hudHost = document.createElement('div');
    hudHost.id = HUD_HOST_ID;
    hudHost.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    hudShadow = hudHost.attachShadow({ mode: 'open' });

    hudShadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .ds-hover-box {
          position: fixed;
          display: none;
          pointer-events: none;
          border: 2px solid #2563EB;
          background: rgba(37, 99, 235, 0.12);
          border-radius: 6px;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.8);
          transition: all 40ms ease-out;
          z-index: 1;
        }
        .ds-hover-tag {
          position: absolute;
          top: -26px;
          left: 0;
          background: #0F172A;
          color: #F8FAFC;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 5px;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
        }
        .ds-hud {
          position: fixed;
          right: 20px;
          bottom: 20px;
          pointer-events: auto;
          background: #0F172A;
          color: #F8FAFC;
          border: 1px solid #334155;
          border-radius: 14px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.38);
          padding: 10px 12px;
          min-width: 340px;
          max-width: 440px;
          z-index: 2;
        }
        .ds-hud.hidden { display: none; }
        .ds-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 8px;
          margin-bottom: 8px;
          border-bottom: 1px solid #1E293B;
          cursor: move;
          user-select: none;
        }
        .ds-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .ds-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #2563EB;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.28);
        }
        .ds-count {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          background: #1E293B;
          color: #93C5FD;
          padding: 2px 7px;
          border-radius: 999px;
        }
        .ds-close {
          background: transparent;
          border: none;
          color: #94A3B8;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          padding: 2px 5px;
          border-radius: 6px;
        }
        .ds-close:hover { background: #1E293B; color: #FFFFFF; }
        .ds-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 7px;
        }
        .ds-btn {
          appearance: none;
          border: 1px solid #334155;
          background: #1E293B;
          color: #E2E8F0;
          font-size: 11.5px;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: background 120ms, border-color 120ms, color 120ms;
        }
        .ds-btn:hover { background: #273549; border-color: #475569; }
        .ds-btn.primary { background: #2563EB; border-color: #2563EB; color: #FFFFFF; }
        .ds-btn.primary:hover { background: #1D4ED8; }
        .ds-btn.active { background: #1D4ED8; border-color: #60A5FA; color: #FFFFFF; }
        .ds-btn.danger { background: transparent; border-color: #475569; color: #FCA5A5; }
        .ds-btn.danger:hover { background: rgba(220, 38, 38, 0.16); border-color: #EF4444; }
        .ds-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 10.5px;
          color: #94A3B8;
          padding-top: 4px;
        }
      </style>
      <div class="ds-hover-box" id="dsHoverBox"><div class="ds-hover-tag" id="dsHoverTag"></div></div>
      <div class="ds-hud hidden" id="dsHud" role="region" aria-label="DemoShield Blur Controls">
        <div class="ds-top" id="dsDragHandle">
          <div class="ds-brand">
            <span class="ds-dot"></span>
            <span>DemoShield Blur</span>
            <span class="ds-count" id="dsCount">0 masked</span>
          </div>
          <button class="ds-close" id="dsClose" title="Hide HUD (keeps masks active)">&times;</button>
        </div>
        <div class="ds-row">
          <button class="ds-btn primary" id="dsPickBtn">Pick &amp; Blur</button>
          <button class="ds-btn" id="dsModeBtn">Mode: Blur 8px</button>
          <button class="ds-btn" id="dsSaveBtn">Save Site</button>
          <button class="ds-btn danger" id="dsClearBtn">Unblur All</button>
        </div>
        <div class="ds-row">
          <button class="ds-btn" data-cat="apiKeys">Keys</button>
          <button class="ds-btn" data-cat="emails">Emails</button>
          <button class="ds-btn" data-cat="currency">Revenue $</button>
          <button class="ds-btn" data-cat="phonesCards">Phone/Card</button>
          <button class="ds-btn" id="dsMaskAllBtn">Mask All</button>
        </div>
        <div class="ds-status">
          <span id="dsStatus">Ready · Local only</span>
          <span>Alt+Shift+B</span>
        </div>
      </div>
    `;

    (document.documentElement || document.body).appendChild(hudHost);
    hoverBox = hudShadow.getElementById('dsHoverBox');
    hoverTag = hudShadow.getElementById('dsHoverTag');

    hudShadow.getElementById('dsClose').addEventListener('click', () => {
      setPickerActive(false);
      setHudVisible(false);
    });
    hudShadow.getElementById('dsPickBtn').addEventListener('click', () => {
      setPickerActive(!state.pickerActive);
    });
    hudShadow.getElementById('dsModeBtn').addEventListener('click', () => {
      state.mode = state.mode === 'blur' ? 'redact' : 'blur';
      refreshAllMaskedModes();
      persistBasicSettings();
      state.statusText = state.mode === 'blur' ? `Switched to Blur (${state.blurPx}px)` : 'Switched to Solid Redact';
      updateHudUI();
    });
    hudShadow.getElementById('dsSaveBtn').addEventListener('click', () => {
      saveOriginProfile();
    });
    hudShadow.getElementById('dsClearBtn').addEventListener('click', () => {
      setPickerActive(false);
      unblurAll();
    });
    hudShadow.getElementById('dsMaskAllBtn').addEventListener('click', () => {
      const allOn = Object.values(state.activeAutoCats).every(Boolean);
      const next = !allOn;
      state.activeAutoCats = { apiKeys: next, emails: next, currency: next, phonesCards: next };
      runAutoMask(state.activeAutoCats);
    });

    hudShadow.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        state.activeAutoCats[cat] = !state.activeAutoCats[cat];
        runAutoMask(state.activeAutoCats);
      });
    });

    const handle = hudShadow.getElementById('dsDragHandle');
    const hudEl = hudShadow.getElementById('dsHud');
    handle.addEventListener('mousedown', (e) => {
      if (e.target && e.target.id === 'dsClose') return;
      const r = hudEl.getBoundingClientRect();
      dragState = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      const onMove = (ev) => {
        if (!dragState) return;
        const left = Math.max(8, Math.min(window.innerWidth - r.width - 8, ev.clientX - dragState.dx));
        const top = Math.max(8, Math.min(window.innerHeight - r.height - 8, ev.clientY - dragState.dy));
        hudEl.style.left = `${left}px`;
        hudEl.style.top = `${top}px`;
        hudEl.style.right = 'auto';
        hudEl.style.bottom = 'auto';
      };
      const onUp = () => {
        dragState = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function persistBasicSettings() {
    storageGet(STORAGE_SETTINGS_KEY).then((res) => {
      const prev = res[STORAGE_SETTINGS_KEY] || {};
      storageSet({
        [STORAGE_SETTINGS_KEY]: {
          ...prev,
          mode: state.mode,
          blurPx: state.blurPx,
          redactLabel: state.redactLabel,
          proUnlocked: state.proUnlocked
        }
      });
    });
  }

  function getTotalMaskedCount() {
    let count = 0;
    for (const el of state.manualElements) if (el.isConnected) count++;
    for (const el of state.autoElements) if (el.isConnected && !state.manualElements.has(el)) count++;
    for (const sp of state.autoSpans) if (sp.isConnected) count++;
    return count;
  }

  function updateHudUI() {
    if (!hudShadow) return;
    const hudEl = hudShadow.getElementById('dsHud');
    hudEl.classList.toggle('hidden', !state.hudVisible);

    const total = getTotalMaskedCount();
    hudShadow.getElementById('dsCount').textContent = `${total} masked`;
    hudShadow.getElementById('dsStatus').textContent = state.statusText;

    const pickBtn = hudShadow.getElementById('dsPickBtn');
    pickBtn.classList.toggle('active', state.pickerActive);
    pickBtn.textContent = state.pickerActive ? 'Stop Picking (Esc)' : 'Pick & Blur';

    const modeBtn = hudShadow.getElementById('dsModeBtn');
    modeBtn.textContent = state.mode === 'blur' ? `Mode: Blur ${state.blurPx}px` : 'Mode: Solid Redact';

    hudShadow.querySelectorAll('[data-cat]').forEach((btn) => {
      const cat = btn.getAttribute('data-cat');
      btn.classList.toggle('active', Boolean(state.activeAutoCats[cat]));
    });
    const allOn = Object.values(state.activeAutoCats).every(Boolean);
    hudShadow.getElementById('dsMaskAllBtn').classList.toggle('active', allOn);
  }

  function setHudVisible(visible) {
    mountHud();
    state.hudVisible = Boolean(visible);
    updateHudUI();
  }

  function getPublicState() {
    return {
      ok: true,
      origin: getOriginKey(),
      hudVisible: state.hudVisible,
      pickerActive: state.pickerActive,
      mode: state.mode,
      blurPx: state.blurPx,
      redactLabel: state.redactLabel,
      activeAutoCats: { ...state.activeAutoCats },
      maskedCount: getTotalMaskedCount(),
      manualCount: state.manualElements.size,
      autoCount: state.autoElements.size + state.autoSpans.size,
      savedOriginCount: state.savedOriginCount,
      lastReplayMs: state.lastReplayMs,
      statusText: state.statusText
    };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || !msg.type || !msg.type.startsWith('DEMOSHIELD_')) return false;

      (async () => {
        if (msg.type === 'DEMOSHIELD_GET_STATE') {
          if (msg.applySaved && getTotalMaskedCount() === 0) {
            await applyOriginProfile();
          }
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_TOGGLE_HUD') {
          mountHud();
          if (msg.applySaved && getTotalMaskedCount() === 0) {
            await applyOriginProfile();
          }
          setHudVisible(!state.hudVisible);
          if (!state.hudVisible) setPickerActive(false);
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_START_PICKER') {
          mountHud();
          if (getTotalMaskedCount() === 0) await applyOriginProfile();
          setHudVisible(true);
          setPickerActive(true);
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_STOP_PICKER') {
          setPickerActive(false);
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_SET_MODE') {
          state.mode = msg.mode === 'redact' ? 'redact' : 'blur';
          refreshAllMaskedModes();
          persistBasicSettings();
          updateHudUI();
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_UPDATE_SETTINGS') {
          if (typeof msg.proUnlocked === 'boolean') state.proUnlocked = msg.proUnlocked;
          if (typeof msg.blurPx === 'number') state.blurPx = Math.max(4, Math.min(20, msg.blurPx));
          if (typeof msg.redactLabel === 'string' && msg.redactLabel.trim()) {
            state.redactLabel = msg.redactLabel.trim().slice(0, 24);
          }
          if (msg.mode === 'blur' || msg.mode === 'redact') state.mode = msg.mode;
          refreshAllMaskedModes();
          updateHudUI();
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_AUTO_MASK') {
          mountHud();
          if (msg.showHud) setHudVisible(true);
          if (Array.isArray(msg.categories)) {
            state.activeAutoCats = {
              apiKeys: msg.categories.includes('apiKeys'),
              emails: msg.categories.includes('emails'),
              currency: msg.categories.includes('currency'),
              phonesCards: msg.categories.includes('phonesCards')
            };
          } else if (msg.toggleCategory) {
            state.activeAutoCats[msg.toggleCategory] = !state.activeAutoCats[msg.toggleCategory];
          }
          const result = runAutoMask(state.activeAutoCats);
          sendResponse({ ...getPublicState(), autoResult: result });
          return;
        }

        if (msg.type === 'DEMOSHIELD_SAVE_ORIGIN') {
          const saved = await saveOriginProfile();
          sendResponse({ ...getPublicState(), saved });
          return;
        }

        if (msg.type === 'DEMOSHIELD_CLEAR_ORIGIN') {
          await clearOriginProfile();
          sendResponse(getPublicState());
          return;
        }

        if (msg.type === 'DEMOSHIELD_APPLY_ORIGIN') {
          const replay = await applyOriginProfile();
          sendResponse({ ...getPublicState(), replay });
          return;
        }

        if (msg.type === 'DEMOSHIELD_UNBLUR_ALL') {
          setPickerActive(false);
          sendResponse(unblurAll());
          return;
        }

        sendResponse({ ok: false, error: 'Unhandled DemoShield command.' });
      })();

      return true;
    });
  }

  window.__DEMOSHIELD_BLUR__ = {
    mountHud,
    setHudVisible,
    setPickerActive,
    toggleManualMask,
    runAutoMask,
    unblurAll,
    saveOriginProfile,
    applyOriginProfile,
    clearOriginProfile,
    setMode(m) {
      state.mode = m === 'redact' ? 'redact' : 'blur';
      refreshAllMaskedModes();
      updateHudUI();
    },
    setSettings({ blurPx, redactLabel, proUnlocked }) {
      if (typeof proUnlocked === 'boolean') state.proUnlocked = proUnlocked;
      if (typeof blurPx === 'number') state.blurPx = blurPx;
      if (typeof redactLabel === 'string') state.redactLabel = redactLabel;
      refreshAllMaskedModes();
      updateHudUI();
    },
    getState: getPublicState
  };
})();
