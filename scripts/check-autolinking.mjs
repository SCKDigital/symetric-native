// Fails if the app imports a package whose native code autolinking leaves out.
//
// package.json's expo.autolinking.exclude drops native modules nothing in the
// app reaches, to keep the binary small. The JS half of an excluded package
// still bundles fine, so importing one later doesn't fail the build: it fails
// on the phone, at startup, with "Cannot find native module". 1.6.0 shipped
// exactly that, when the Privacy/Terms links started using expo-web-browser
// after it had been excluded as unused.
//
// Runs on EAS before every build (eas-build-pre-install in package.json), and
// locally with `node scripts/check-autolinking.mjs`. Needs no node_modules.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const al = pkg.expo?.autolinking ?? {};
const excluded = new Set([
  ...(al.exclude ?? []),
  ...(al.android?.exclude ?? []),
  ...(al.ios?.exclude ?? []),
]);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !/\.web\.[jt]sx?$/.test(name)) yield p;
  }
}

const problems = [];
for (const file of files(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (excluded.has(name)) problems.push(`${relative(root, file)} imports ${spec}`);
  }
}

if (problems.length) {
  console.error('These packages are excluded from autolinking in package.json, so their');
  console.error('native code is not in the build and the app would crash at startup:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nRemove the package from expo.autolinking.exclude, or stop importing it.');
  process.exit(1);
}
console.log(`autolinking check: no imports of excluded packages (${[...excluded].join(', ') || 'none'})`);
