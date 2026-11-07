import { cp, mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Explicit allowlist: never publish secrets, migrations, tests or server source.
for (const name of ['index.html', 'about.html', 'portfolio.html', 'services.html',
  'policies.html', 'reviews.html', 'style.css', 'reviews.css', '_headers']) {
  await copyFile(path.join(root, name), path.join(output, name));
}
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
await mkdir(path.join(output, 'images'));
for (const name of await readdir(path.join(root, 'images'))) {
  if (/\.(jpe?g|png|webp|gif|svg|avif|ico)$/i.test(name)) {
    await copyFile(path.join(root, 'images', name), path.join(output, 'images', name));
  }
}
console.log('Built public assets in dist/. Wrangler bundles the Worker separately.');
