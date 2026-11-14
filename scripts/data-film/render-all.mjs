// Renders every film to out/<id>.mp4.
import { execFileSync } from 'node:child_process';

const films = ['NinetyDays', 'Wednesdays', 'Notes', 'Pairs', 'Month', 'Number', 'Paper'];
const kebab = (s) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
for (const id of films) {
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${kebab(id)}.mp4`], { stdio: 'inherit', shell: true });
}
