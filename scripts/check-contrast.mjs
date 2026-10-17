// Contrast guard. Run: npm run check:contrast (also runs as part of `npm run build`).
//  1. Reads the colour tokens from src/styles/globals.css (@theme block).
//  2. Checks the colour pairings the site relies on against WCAG 2.1 (text 4.5:1, UI 3:1).
//  3. Scans src/ for patterns that are known to fail, and for fragile ones (warnings only).
// Lines marked `contrast-ok`, `aria-hidden` or `pointer-events-none` are treated as decorative and skipped.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const css = readFileSync(join(root, 'src/styles/globals.css'), 'utf8');
const theme = css.slice(css.indexOf('@theme'), css.indexOf('--font-display'));

const raw = {};
for (const m of theme.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) raw[m[1]] = m[2].trim();
const resolve = (name, depth = 0) => {
  const v = raw[name];
  if (!v || depth > 6) return null;
  const ref = v.match(/^var\(--color-([\w-]+)\)/);
  return ref ? resolve(ref[1], depth + 1) : v;
};

const lum = (hex) => {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token, minimum ratio, where it is used]
const PAIRS = [
  ['dark', 'background', 4.5, 'body text'],
  ['dark', 'background-warm', 4.5, 'text on warm sections'],
  ['dark-muted', 'background', 4.5, 'secondary text'],
  ['dark-muted', 'background-warm', 4.5, 'secondary text on warm sections'],
  ['dark-muted', 'white', 4.5, 'secondary text on cards'],
  ['primary', 'background', 4.5, 'links and headings'],
  ['primary', 'white', 4.5, 'links on cards'],
  ['white', 'primary', 4.5, 'primary button'],
  ['white', 'primary-dark', 4.5, 'primary button hover'],
  ['white', 'amber-700', 4.5, 'secondary button'],
  ['white', 'amber-800', 4.5, 'secondary button hover'],
  ['white', 'gold-700', 4.5, 'gold tags and toast tile'],
  ['gold-700', 'cream', 4.5, 'gold text on cream'],
  ['gold-700', 'background', 4.5, 'gold text on page'],
  ['gold-deep', 'cream', 4.5, 'gold-deep text'],
  ['neutral-600', 'background', 4.5, 'muted captions'],
  ['cream', 'footer', 4.5, 'footer text'],
  ['gold-300', 'neutral-900', 4.5, 'games: gold on dark'],
  ['peach', 'neutral-900', 4.5, 'games: peach on dark'],
  ['success-fg', 'success-bg', 4.5, 'success message'],
  ['danger-fg', 'danger-bg', 4.5, 'error message'],
  ['warning-fg', 'warning-bg', 4.5, 'warning message'],
  ['info-fg', 'info-bg', 4.5, 'info message'],
  ['danger-fg', 'white', 4.5, 'error text on white'],
  ['primary-650', 'background-warm', 4.5, 'terracotta text on warm sections (see globals.css rule)'],
  ['primary-650', 'background', 4.5, 'terracotta text, deeper shade'],
  ['primary', 'background', 3, 'UI borders and icons'],
  ['gold-700', 'background', 3, 'gold borders and icons'],
];

// Known near-misses. Reported but never fail the build; fine for large or bold text (3:1).
const ADVISORY = [];

let failed = 0;
console.log('Contrast check: token pairings');
for (const [fg, bg, min, use] of PAIRS) {
  const f = resolve(fg) ?? (fg === 'white' ? '#FFFFFF' : null);
  const b = resolve(bg) ?? (bg === 'white' ? '#FFFFFF' : null);
  if (!f || !b) { console.log(`  MISSING  ${fg} on ${bg} (token not found)`); failed++; continue; }
  const r = ratio(f, b);
  if (r < min) { failed++; console.log(`  FAIL  ${r.toFixed(2)} < ${min}  ${fg} (${f}) on ${bg} (${b})  [${use}]`); }
}
if (!failed) console.log(`  all ${PAIRS.length} pairings pass`);
for (const [fg, bg, min, use] of ADVISORY) {
  const r = ratio(resolve(fg), resolve(bg));
  if (r < min) console.log(`  NOTE  ${r.toFixed(2)} < ${min}  ${fg} on ${bg}  [${use}]`);
}

// --- source scan ---
const RULES = {
  fail: [
    [/(?<![-\w:/])text-gold(?![-\w/])/, 'text-gold is 2.4:1 on light backgrounds. Use text-gold-700 (light bg) or text-gold-300 (dark bg).'],
    [/(?<![-\w:/])bg-secondary(?![-\w/])[^`'"]*\btext-white\b|\btext-white\b[^`'"]*(?<![-\w:/])bg-secondary(?![-\w/])/, 'White on bg-secondary is 2.8:1. Use bg-amber-700.'],
    [/(?<![-\w:/])bg-gold(?![-\w/])[^`'"]*\btext-white\b|\btext-white\b[^`'"]*(?<![-\w:/])bg-gold(?![-\w/])/, 'White on bg-gold is 2.5:1. Use bg-gold-700.'],
    [/(?:group-)?focus(?:-visible)?:ring-primary\/\d+/, 'Translucent focus rings are about 2:1. Use a solid ring (focus-visible:ring-primary) so keyboard focus is visible.'],
    [/(?<![-\w:/])text-primary\/\d+/, 'Faded primary text never reaches 4.5:1. Use text-primary (hover: text-primary-dark).'],
  ],
  warn: [
    [/(?<![-\w:/])text-dark-muted\/(?:[1-6]\d?|7[0-4])(?!\d)/, 'text-dark-muted below /75 is under 4.5:1 for text (fine for decoration or disabled).'],
    [/(?<![-\w:/])text-dark\/(?:[1-6]\d?)(?!\d)/, 'text-dark below /70 is under 4.5:1 for text.'],
    [/(?<![-\w:/])text-cream\/(?:[1-4]\d)(?!\d)/, 'text-cream below /50 is under 4.5:1 on dark backgrounds.'],
    [/(?<![-\w:/])text-(?:red|green|amber)-(?:500|600|700)(?![-\w])/, 'Raw status colour. Prefer text-danger-fg, text-success-fg or text-warning-fg.'],
  ],
};

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(n)) files.push(p);
  }
})(join(root, 'src'));

const warnings = new Map();
let scanFails = 0;
console.log('\nContrast check: source scan');
for (const f of files) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/contrast-ok|aria-hidden|pointer-events-none/.test(line)) return;
    for (const [re, msg] of RULES.fail) {
      if (re.test(line)) { scanFails++; console.log(`  FAIL  ${relative(root, f)}:${i + 1}  ${msg}`); }
    }
    for (const [re, msg] of RULES.warn) {
      if (re.test(line)) warnings.set(msg, (warnings.get(msg) ?? 0) + 1);
    }
  });
}
if (!scanFails) console.log('  no known-bad patterns');
if (warnings.size) {
  console.log('\n  Warnings (do not fail the build; review when touching these files):');
  for (const [msg, n] of warnings) console.log(`   ${String(n).padStart(4)}  ${msg}`);
}

if (failed + scanFails) {
  console.error(`\nContrast check failed (${failed + scanFails} problem${failed + scanFails > 1 ? 's' : ''}).`);
  process.exit(1);
}
console.log('\nContrast check passed.');
