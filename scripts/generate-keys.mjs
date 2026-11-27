#!/usr/bin/env node
/* DemoShield Blur — Offline Pro License Key Batch Generator
 * Generates N unique DSPRO-XXXX-XXXX-CCCC keys verified by extension/rules.js.
 * Outputs to gitignored private/pro-keys-<N>.csv (LemonSqueezy/Gumroad ready) & .txt.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { generateProKey, verifyProKey } = require('../extension/rules.js');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const countArg = Number(process.argv[2] || 500);
const count = Number.isFinite(countArg) && countArg > 0 ? Math.min(10000, Math.floor(countArg)) : 500;

function randomSeed8() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] & 31];
  }
  return out;
}

const keys = new Set();
while (keys.size < count) {
  const key = generateProKey(randomSeed8());
  if (!verifyProKey(key)) {
    throw new Error(`Self-verification failed for generated key: ${key}`);
  }
  keys.add(key);
}

const list = Array.from(keys);
const privateDir = path.join(rootDir, 'private');
fs.mkdirSync(privateDir, { recursive: true });

const csvPath = path.join(privateDir, `pro-keys-${count}.csv`);
const txtPath = path.join(privateDir, `pro-keys-${count}.txt`);

fs.writeFileSync(csvPath, 'license_key\n' + list.join('\n') + '\n', 'utf8');
fs.writeFileSync(txtPath, list.join('\n') + '\n', 'utf8');

console.log(`[PASS] Generated & verified ${list.length} unique offline Pro keys:`);
console.log(`       - ${csvPath}`);
console.log(`       - ${txtPath}`);
console.log(`       Sample key #1: ${list[0]}`);
