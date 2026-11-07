import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let failed = false;
const scripts = ['worker.js'];
for (const dir of ['assets', 'lib', 'scripts', 'tests']) {
  scripts.push(...(await readdir(dir)).filter(name => /\.(js|mjs)$/.test(name)).map(name => path.join(dir, name)));
}
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
  if (result.status !== 0) { failed = true; console.error(result.stderr); }
}
for (const file of ['index.html', 'about.html', 'portfolio.html', 'services.html', 'policies.html', 'reviews.html']) {
  const html = await readFile(file, 'utf8');
  if (!html.includes('href="/reviews"')) { failed = true; console.error(`${file}: missing Reviews navigation link`); }
}
if (failed) process.exit(1);
console.log('JavaScript syntax and public navigation checks passed. No TypeScript compiler or lint configuration is used by this plain JavaScript site.');
