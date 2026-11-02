// Builds the website demo: the app for web, on in-memory sample data, plus
// the demo.html page the website embeds (from public/). See src/lib/demo/.
//
//   npm run build:demo        → dist/demo/
//
// Vercel runs the same command (vercel.json). Setting the variable here rather
// than in the npm script keeps it working in cmd, PowerShell and bash alike.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist/demo'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    EXPO_PUBLIC_DEMO: '1',
    // Don't read .env: the demo never talks to Supabase, so there is no reason
    // for the project URL and anon key to be inlined into a public bundle.
    EXPO_NO_DOTENV: '1',
  },
});
process.exit(result.status ?? 1);
