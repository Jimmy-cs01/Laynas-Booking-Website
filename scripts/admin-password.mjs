import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH, hashPassword, validPasswordLength } from '../lib/security.js';

const [mode, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (mode !== undefined && !['--preview-file', '--production-file'].includes(mode))) {
  console.error('Usage: npm run admin:password [-- --preview-file|--production-file]');
  process.exit(1);
}

if (!process.stdin.isTTY) {
  console.error('Run this command in an interactive terminal. Password input is hidden.');
  process.exit(1);
}
const passwordRange = `${ADMIN_PASSWORD_MIN_LENGTH}–${ADMIN_PASSWORD_MAX_LENGTH} characters`;
process.stdout.write(`New admin password (${passwordRange}; input hidden): `);
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
let password = '';
for await (const chunk of process.stdin) {
  if (chunk.includes('\u0003')) process.exit(130);
  for (const char of chunk) {
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (!validPasswordLength(password)) {
        console.error(`\nUse a unique password with ${passwordRange}.`);
        process.exit(1);
      }
      const filename = mode === '--preview-file' ? '.wrangler/preview.secrets.json'
        : mode === '--production-file' ? '.wrangler/production.secrets.json' : '.dev.vars';
      const sessionSecret = randomBytes(32).toString('hex');
      const hash = await hashPassword(password, sessionSecret);
      const content = mode ? JSON.stringify({ ADMIN_PASSWORD_HASH: hash, SESSION_SECRET: sessionSecret })
        : `ADMIN_PASSWORD_HASH="${hash}"\nSESSION_SECRET="${sessionSecret}"\n`;
      try {
        if (mode) await mkdir(new URL('../.wrangler/', import.meta.url), { recursive: true, mode: 0o700 });
        await writeFile(new URL(`../${filename}`, import.meta.url), content, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        console.error(error.code === 'EEXIST'
          ? `\n${filename} already exists. Move it securely before generating a replacement.`
          : `\nCould not write ${filename}.`);
        process.exit(1);
      }
      console.log(`\nSaved runtime secrets to ${filename}.`);
      process.exit(0);
    } else if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
    else if (char >= ' ') password += char;
  }
}
