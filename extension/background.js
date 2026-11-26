/* DemoShield Blur — MV3 Service Worker
 * Zero host_permissions! Injects rules.js + content.js strictly on explicit user gesture
 * (toolbar popup action, Alt+Shift+B command, or right-click context menu) via activeTab + scripting.
 */

const MENU_ROOT = 'demoshield-root';
const MENU_TOGGLE_HUD = 'demoshield-toggle-hud';
const MENU_START_PICKER = 'demoshield-start-picker';
const MENU_AUTO_MASK = 'demoshield-auto-mask';
const MENU_UNBLUR_ALL = 'demoshield-unblur-all';

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url) ||
    /^https?:\/\/chromewebstore\.google\.com\//i.test(url) ||
    /^https?:\/\/chrome\.google\.com\/webstore\//i.test(url);
}

function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT,
      title: 'DemoShield Blur',
      contexts: ['page', 'selection', 'image', 'link', 'editable']
    });
    chrome.contextMenus.create({
      id: MENU_START_PICKER,
      parentId: MENU_ROOT,
      title: 'Click-to-Blur Element (Picker)',
      contexts: ['page', 'selection', 'image', 'link', 'editable']
    });
    chrome.contextMenus.create({
      id: MENU_AUTO_MASK,
      parentId: MENU_ROOT,
      title: 'Auto-Mask Secrets, Emails & Revenue ($)',
      contexts: ['page', 'selection', 'image', 'link', 'editable']
    });
    chrome.contextMenus.create({
      id: MENU_TOGGLE_HUD,
      parentId: MENU_ROOT,
      title: 'Toggle Floating HUD (Alt+Shift+B)',
      contexts: ['page', 'selection', 'image', 'link', 'editable']
    });
    chrome.contextMenus.create({
      id: MENU_UNBLUR_ALL,
      parentId: MENU_ROOT,
      title: 'Unblur All on Page',
      contexts: ['page', 'selection', 'image', 'link', 'editable']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

async function ensureInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['rules.js', 'content.js']
  });
}

async function sendToTab(tabId, message, tabUrl) {
  if (tabUrl && isRestrictedUrl(tabUrl)) {
    return {
      ok: false,
      error: 'Chrome restricts extensions on browser internal pages and the Web Store. Try any normal website.'
    };
  }
  try {
    await ensureInjected(tabId);
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response || { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'Unable to attach to this tab.'
    };
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-blur-hud') return;
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  await sendToTab(tab.id, { type: 'DEMOSHIELD_TOGGLE_HUD', applySaved: true }, tab.url);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === MENU_TOGGLE_HUD) {
    await sendToTab(tab.id, { type: 'DEMOSHIELD_TOGGLE_HUD', applySaved: true }, tab.url);
  } else if (info.menuItemId === MENU_START_PICKER) {
    await sendToTab(tab.id, { type: 'DEMOSHIELD_START_PICKER' }, tab.url);
  } else if (info.menuItemId === MENU_AUTO_MASK) {
    await sendToTab(tab.id, {
      type: 'DEMOSHIELD_AUTO_MASK',
      categories: ['apiKeys', 'emails', 'currency', 'phonesCards'],
      showHud: true
    }, tab.url);
  } else if (info.menuItemId === MENU_UNBLUR_ALL) {
    await sendToTab(tab.id, { type: 'DEMOSHIELD_UNBLUR_ALL' }, tab.url);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type || !msg.type.startsWith('BG_')) return false;

  (async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      sendResponse({ ok: false, error: 'No active tab found.' });
      return;
    }

    if (msg.type === 'BG_DISPATCH_TO_ACTIVE') {
      const result = await sendToTab(tab.id, msg.payload, tab.url);
      sendResponse(result);
      return;
    }

    sendResponse({ ok: false, error: 'Unknown background action.' });
  })();

  return true;
});
