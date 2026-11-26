/* DemoShield Blur — Pure Local Regex Detectors, Stable CSS Selector Builder & Offline License Key Verifier
 * 100% local, zero network calls, zero telemetry.
 * Works both when injected as a classic script in MV3 tabs (globalThis.DemoShieldRules)
 * and when imported in Node unit tests (CommonJS module.exports).
 */
(function (rootScope) {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    mode: 'blur',             // 'blur' | 'redact'
    blurPx: 8,                // 4..20
    redactLabel: '••••••',    // '••••••' | 'REDACTED' | custom (Pro)
    proKey: '',
    proUnlocked: false,
    autoMaskDefaults: {
      apiKeys: true,
      emails: true,
      currency: true,
      phonesCards: false
    }
  });

  const CATEGORY_META = Object.freeze({
    apiKeys: { label: 'API Keys & Secrets', short: 'Keys', priority: 1, placeholder: 'sk_••••••••••••' },
    emails: { label: 'Emails', short: 'Emails', priority: 2, placeholder: '••••@••••.•••' },
    phonesCards: { label: 'Phones & Cards', short: 'Phone/Card', priority: 3, placeholder: '•••• •••• ••••' },
    currency: { label: 'Revenue & Currency', short: 'Revenue $', priority: 4, placeholder: '$••,•••' }
  });

  // Luhn checksum validation for 13-19 digit payment cards (prevents false positives on random order/tracking IDs)
  function isValidLuhn(digits) {
    if (!/^\d{13,19}$/.test(digits)) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (shouldDouble) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  // Pattern registry per category (compiled fresh per scan to avoid sticky lastIndex bugs)
  function getCategoryRegexes(category) {
    switch (category) {
      case 'apiKeys':
        return [
          // Stripe live/test secret, publishable, restricted, webhook secrets
          /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g,
          /\bwhsec_[A-Za-z0-9]{16,}\b/g,
          // OpenAI / Anthropic project & API keys
          /\bsk-(?:proj-|ant-api\d*-)?[A-Za-z0-9_-]{20,}\b/g,
          // GitHub personal/OAuth/fine-grained tokens
          /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
          /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
          // AWS Access Key IDs
          /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
          // Google API keys
          /\bAIza[0-9A-Za-z_-]{30,}\b/g,
          // Slack tokens
          /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
          // Bearer tokens & JWTs
          /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g,
          /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
        ];
      case 'emails':
        return [
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g
        ];
      case 'currency':
        return [
          // Symbol-prefixed currency: $12,345.67, -$320.50, +$48.2K, €9,820, £1,499.00, ¥120,000
          /(?:^|(?<=[\s(\[:,=+]))[+-]?(?:US\$|CA\$|AU\$|[$€£¥₹])\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s?[KMBkmb])?(?![A-Za-z0-9_])/g,
          // ISO code prefixed: USD 12,400.00, EUR 9,820
          /\b(?:USD|EUR|GBP|CAD|AUD)\s+\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:[KMBkmb])?\b/g
        ];
      case 'phonesCards':
        return [
          // Payment card numbers (grouped by spaces or hyphens, 13-19 digits, validated by Luhn)
          /\b(?:\d{4}[-\s]){3}\d{3,4}\b/g,
          /\b\d{4}[-\s]\d{6}[-\s]\d{5}\b/g,
          // US SSN
          /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
          // International & North American phone numbers
          /(?:^|(?<=[\s(\[:,]))(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g,
          /(?:^|(?<=[\s(\[:,]))\+\d{1,3}[\s.-]\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g
        ];
      default:
        return [];
    }
  }

  function validateMatch(category, rawText) {
    if (!rawText || !rawText.trim()) return false;
    if (category === 'phonesCards') {
      const digitsOnly = rawText.replace(/\D/g, '');
      // If it looks like a 13-19 digit card number (not starting with + and not SSN 9 digits)
      if (!rawText.startsWith('+') && digitsOnly.length >= 13 && digitsOnly.length <= 19) {
        return isValidLuhn(digitsOnly);
      }
    }
    return true;
  }

  /**
   * Detect all sensitive text spans in `text` for the enabled categories.
   * Returns sorted, strictly non-overlapping matches: [{ start, end, text, category }]
   */
  function detectMatches(text, enabledCategories) {
    if (typeof text !== 'string' || text.length === 0) return [];
    const cats = Array.isArray(enabledCategories)
      ? enabledCategories
      : Object.keys(enabledCategories || {}).filter((k) => Boolean(enabledCategories[k]));
    if (cats.length === 0) return [];

    const ordered = [...cats].sort((a, b) => {
      const pa = (CATEGORY_META[a] && CATEGORY_META[a].priority) || 99;
      const pb = (CATEGORY_META[b] && CATEGORY_META[b].priority) || 99;
      return pa - pb;
    });

    const candidates = [];
    for (const cat of ordered) {
      const regexes = getCategoryRegexes(cat);
      for (const rx of regexes) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(text)) !== null) {
          const val = m[0];
          if (!val) {
            rx.lastIndex++;
            continue;
          }
          if (!validateMatch(cat, val)) continue;
          candidates.push({
            start: m.index,
            end: m.index + val.length,
            text: val,
            category: cat,
            priority: (CATEGORY_META[cat] && CATEGORY_META[cat].priority) || 99
          });
        }
      }
    }

    if (candidates.length === 0) return [];

    // Sort by priority (higher trust category first), then longer span, then earlier index
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const lenDiff = (b.end - b.start) - (a.end - a.start);
      if (lenDiff !== 0) return lenDiff;
      return a.start - b.start;
    });

    const accepted = [];
    for (const cand of candidates) {
      let overlaps = false;
      for (const acc of accepted) {
        if (cand.start < acc.end && cand.end > acc.start) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        accepted.push({
          start: cand.start,
          end: cand.end,
          text: cand.text,
          category: cand.category
        });
      }
    }

    accepted.sort((a, b) => a.start - b.start);
    return accepted;
  }

  function cssEscapeIdent(str) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(str);
    }
    return String(str).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function isStableId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.length > 64) return false;
    // Reject obvious auto-generated numeric/UUID/React-like volatile IDs
    if (/^\d+$/.test(id)) return false;
    if (/^:r[0-9a-z]+:$/i.test(id)) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return false;
    if (/\d{5,}/.test(id)) return false;
    return true;
  }

  function isStableClass(cls) {
    if (!cls || typeof cls !== 'string') return false;
    if (cls.startsWith('demoshield-')) return false;
    if (cls.length > 48) return false;
    // Skip Tailwind arbitrary value classes with brackets/colons or CSS-in-JS hash suffixes
    if (/[\[\]:\/!]/.test(cls)) return false;
    if (/^(css|sc|emotion)-[a-z0-9]{5,}$/i.test(cls)) return false;
    return true;
  }

  function isUniqueSelector(selector, doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return false;
    try {
      return doc.querySelectorAll(selector).length === 1;
    } catch (_) {
      return false;
    }
  }

  /**
   * Build a deterministic, resilient CSS selector for `el` inside `doc`.
   * Prioritizes stable #id, [data-testid], [data-cy], [aria-label], then shortest unique path.
   */
  function buildStableSelector(el, doc) {
    if (!el || !el.tagName) return '';
    const documentRef = doc || el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const tag = el.tagName.toLowerCase();

    if (tag === 'html' || tag === 'body') return tag;

    if (isStableId(el.id)) {
      const idSel = '#' + cssEscapeIdent(el.id);
      if (!documentRef || isUniqueSelector(idSel, documentRef)) return idSel;
    }

    const stableAttrs = ['data-testid', 'data-cy', 'data-qa', 'data-field', 'name', 'aria-label'];
    for (const attr of stableAttrs) {
      const val = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : (el.attributes && el.attributes[attr]);
      if (val && typeof val === 'string' && val.length <= 80 && !/[\r\n"\\]/.test(val)) {
        const attrSel = `${tag}[${attr}="${val}"]`;
        if (!documentRef || isUniqueSelector(attrSel, documentRef)) return attrSel;
      }
    }

    const parts = [];
    let current = el;
    let depth = 0;

    while (current && current.tagName && depth < 8) {
      const cTag = current.tagName.toLowerCase();
      if (cTag === 'html' || cTag === 'body') {
        parts.unshift(cTag);
        break;
      }

      if (isStableId(current.id)) {
        parts.unshift('#' + cssEscapeIdent(current.id));
        const candidate = parts.join(' > ');
        if (!documentRef || isUniqueSelector(candidate, documentRef)) return candidate;
        break;
      }

      const rawClasses = Array.isArray(current.classList)
        ? current.classList
        : (current.classList ? Array.from(current.classList) : String(current.className || '').trim().split(/\s+/).filter(Boolean));
      const goodClasses = rawClasses.filter(isStableClass).slice(0, 2);

      let segment = cTag;
      if (goodClasses.length > 0) {
        segment += '.' + goodClasses.map(cssEscapeIdent).join('.');
      }

      // Disambiguate among same-tag siblings using :nth-of-type
      const parent = current.parentElement;
      if (parent && parent.children) {
        const siblings = Array.from(parent.children).filter(
          (sib) => sib.tagName && sib.tagName.toLowerCase() === cTag
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          if (idx > 0) segment += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(segment);
      const candidate = parts.join(' > ');
      if (documentRef && isUniqueSelector(candidate, documentRef)) {
        return candidate;
      }

      current = parent;
      depth++;
    }

    return parts.join(' > ');
  }

  // --- Offline Pro License Key (DSPRO-XXXX-XXXX-CCCC, zero phone-home!) ---
  const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const KEY_SALT = 'DEMOSHIELD_BLUR_V1_OFFLINE_2026';

  function computeChecksum4(payload8) {
    let h = 2166136261 >>> 0; // FNV-1a 32-bit
    const input = KEY_SALT + ':' + payload8.toUpperCase();
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += KEY_ALPHABET[(h >>> (i * 5)) & 31];
    }
    return out;
  }

  function generateProKey(seed8) {
    const clean = String(seed8 || '')
      .toUpperCase()
      .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
    if (clean.length !== 8) {
      throw new Error('Seed must contain exactly 8 valid Crockford-like characters.');
    }
    const check = computeChecksum4(clean);
    return `DSPRO-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${check}`;
  }

  function verifyProKey(rawKey) {
    if (typeof rawKey !== 'string') return false;
    const normalized = rawKey.trim().toUpperCase();
    const m = /^DSPRO-([23456789A-HJ-NP-Z]{4})-([23456789A-HJ-NP-Z]{4})-([23456789A-HJ-NP-Z]{4})$/.exec(normalized);
    if (!m) return false;
    const payload = m[1] + m[2];
    const expected = computeChecksum4(payload);
    return m[3] === expected;
  }

  const api = {
    DEFAULT_SETTINGS,
    CATEGORY_META,
    isValidLuhn,
    detectMatches,
    buildStableSelector,
    generateProKey,
    verifyProKey
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (rootScope) {
    rootScope.DemoShieldRules = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);