import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extDir = path.join(rootDir, 'extension');
const manifestPath = path.join(extDir, 'manifest.json');
const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);

const ALLOWED_PERMISSIONS = ['activeTab', 'storage', 'scripting', 'contextMenus'];
const FORBIDDEN_PERMISSIONS = [
  '<all_urls>',
  'http://*/*',
  'https://*/*',
  '*://*/*',
  'tabs',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'cookies',
  'history',
  'bookmarks',
  'webNavigation',
  'debugger',
  'proxy',
  'clipboardRead'
];

test('MV3 manifest version and Chrome Web Store metadata limits', () => {
  assert.equal(manifest.manifest_version, 3, 'manifest_version must be 3');
  assert.ok(manifest.name && manifest.name.length <= 75, `name exceeds 75 chars (${manifest.name?.length})`);
  assert.ok(manifest.description && manifest.description.length <= 132, `description exceeds 132 chars (${manifest.description?.length})`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'version must be semver');
});

test('Zero-Host-Permission security guarantee: strictly minimal permissions only', () => {
  assert.equal(manifest.host_permissions, undefined, 'FORBIDDEN: host_permissions must NOT exist in manifest.json');
  assert.equal(manifest.optional_host_permissions, undefined, 'FORBIDDEN: optional_host_permissions must NOT exist');
  assert.equal(manifest.optional_permissions, undefined, 'FORBIDDEN: optional_permissions must NOT exist');
  assert.equal(manifest.content_scripts, undefined, 'FORBIDDEN: persistent content_scripts must NOT exist');
  assert.equal(manifest.externally_connectable, undefined, 'FORBIDDEN: externally_connectable must NOT exist');

  assert.ok(Array.isArray(manifest.permissions), 'permissions must be an array');
  for (const perm of manifest.permissions) {
    assert.ok(!FORBIDDEN_PERMISSIONS.includes(perm), `FORBIDDEN permission detected: ${perm}`);
    assert.ok(ALLOWED_PERMISSIONS.includes(perm), `Unexpected extra permission detected: ${perm}`);
  }
  assert.deepEqual(
    [...manifest.permissions].sort(),
    [...ALLOWED_PERMISSIONS].sort(),
    `permissions must be strictly ${ALLOWED_PERMISSIONS.join(', ')}`
  );

  // Raw text scan against any broad URL pattern sneaking into any manifest field
  for (const badPattern of ['<all_urls>', 'http://*/*', 'https://*/*', '*://*/*']) {
    assert.ok(!manifestRaw.includes(badPattern), `FORBIDDEN host pattern "${badPattern}" found in manifest.json`);
  }
});

test('All referenced manifest files, icons, service worker, popup, and commands exist', () => {
  assert.equal(manifest.background?.service_worker, 'background.js');
  assert.equal(manifest.action?.default_popup, 'popup.html');
  assert.ok(manifest.commands?.['toggle-blur-hud'], 'Alt+Shift+B toggle-blur-hud command must be registered');
  assert.equal(manifest.commands['toggle-blur-hud'].suggested_key?.default, 'Alt+Shift+B');

  const requiredFiles = [
    'manifest.json',
    'background.js',
    'content.js',
    'rules.js',
    'popup.html',
    'popup.css',
    'popup.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png'
  ];
  for (const rel of requiredFiles) {
    const full = path.join(extDir, rel);
    assert.ok(fs.existsSync(full), `Missing required extension file: ${rel}`);
    assert.ok(fs.statSync(full).size > 0, `Extension file is empty: ${rel}`);
  }
});

test('Zero telemetry, zero analytics trackers, and zero outbound fetch/XHR calls in extension JS', () => {
  const jsFiles = fs.readdirSync(extDir).filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length >= 4, 'Expected background.js, content.js, rules.js, popup.js');

  const forbiddenTokens = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bnavigator\.sendBeacon\b/,
    /\bWebSocket\b/,
    /google-analytics|googletagmanager|gtag|mixpanel|posthog|sentry|amplitude|segment\.io/i
  ];

  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(extDir, file), 'utf8');
    for (const rx of forbiddenTokens) {
      assert.ok(!rx.test(content), `Forbidden network/telemetry call ${rx} found in extension/${file}`);
    }
  }
});
