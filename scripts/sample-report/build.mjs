// Bundles generate-aisha.ts with the app's real modules, swapping in stand-ins
// for the four things that cannot run under Node: the Supabase client, the
// device key-value store, the print call and React Native itself. Then runs
// it and prints the HTML to a landscape PDF in headless Chrome.
//
//   node scripts/sample-report/build.mjs [out.pdf]
//
// Default output is the marketing site's sample report.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const tmp = join(root, '.tmp-sample-report');
mkdirSync(tmp, { recursive: true });

// esbuild is not one of the app's dependencies, and this script is not worth
// adding one for. It lives in the scratch folder instead, installed once.
if (!existsSync(join(tmp, 'node_modules', 'esbuild'))) {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--prefix', tmp, '--no-save', '--no-package-lock', 'esbuild@0.24.2'],
    { stdio: 'inherit', shell: process.platform === 'win32' });
}
const { build } = createRequire(join(tmp, 'noop.js'))('esbuild');

const outPdf = resolve(process.argv[2] ?? join(root, '../mositric-marketing/public/symetric-sample-report.pdf'));

const stubs = {
  '@/lib/supabase': join(here, 'fake-supabase.ts'),
  '@react-native-async-storage/async-storage': 'export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };',
  'expo-print': 'export async function printToFileAsync({ html }) { globalThis.__reportHtml = html; return { uri: "memory://report.pdf" }; }',
  'react-native': 'export const Platform = { OS: "ios", select: o => o.ios ?? o.default }; export const AppState = { addEventListener: () => ({ remove() {} }) };',
};

const stubPlugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const stub = stubs[args.path];
      if (stub === undefined) return null;
      return stub.endsWith('.ts') ? { path: stub } : { path: args.path, namespace: 'stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
  },
};

const bundle = join(tmp, 'generate-aisha.cjs');
await build({
  entryPoints: [join(here, 'generate-aisha.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
  alias: { '@': join(root, 'src') },
  define: { __DEV__: 'false' },
  plugins: [stubPlugin],
  logLevel: 'warning',
});

// The website demo's starting state is written by the same run, so the demo
// and this PDF can never disagree. Commit it alongside any change here.
const html = join(tmp, 'aisha-report.html');
const demoTables = join(root, 'src', 'lib', 'demo', 'aisha-tables.json');
execFileSync(process.execPath, [bundle, html, demoTables], { stdio: 'inherit' });

// The app's report has no <title>, so Chrome would name the PDF after this
// scratch file, and that is what a browser tab shows when the site serves it.
const doc = readFileSync(html, 'utf8');
if (!/<title>/i.test(doc)) {
  writeFileSync(html, doc.replace(/<head>/i, '<head><title>Symetric sample report</title>'));
}

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
if (!chrome) throw new Error('No Chrome or Edge found to print the PDF with');

mkdirSync(dirname(outPdf), { recursive: true });
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${outPdf}`, pathToFileURL(html).href,
], { stdio: 'ignore' });
writeFileSync(join(tmp, 'last-output.txt'), outPdf);
console.log(`\nwrote ${outPdf}`);
