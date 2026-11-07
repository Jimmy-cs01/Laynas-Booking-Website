import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('deployment configs isolate D1, reject local IDs, and bundle for production', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'layna-worker-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'));
  const generator = path.join(root, 'scripts/worker-config.mjs');
  await copyFile('scripts/worker-config.mjs', generator);
  const local = JSON.parse(await readFile('wrangler.local.jsonc', 'utf8'));
  local.main = path.resolve(local.main);
  local.assets.directory = path.resolve(local.assets.directory);
  await writeFile(path.join(root, 'wrangler.local.jsonc'), JSON.stringify(local));

  const previewId = randomUUID();
  const productionId = randomUUID();
  function generate(target, preview, production = '') {
    return spawnSync(process.execPath, [generator, target], {
      encoding: 'utf8',
      env: { ...process.env, CLOUDFLARE_PREVIEW_D1_ID: preview, CLOUDFLARE_PRODUCTION_D1_ID: production }
    });
  }

  assert.notEqual(generate('preview', local.d1_databases[0].database_id).status, 0);
  assert.notEqual(generate('production', previewId).status, 0);
  assert.notEqual(generate('production', previewId, previewId).status, 0);
  for (const [target, name, id] of [
    ['preview', 'beautybylayna-preview', previewId],
    ['production', 'beautybylayna', productionId]
  ]) {
    const result = generate(target, previewId, productionId);
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await readFile(path.join(root, `.wrangler.${target}.json`), 'utf8'));
    assert.equal(config.name, name);
    assert.equal(config.d1_databases[0].database_id, id);
    assert.equal(config.d1_databases[0].binding, 'REVIEWS_DB');
    assert.equal(config.workers_dev, true);
    assert.equal(config.d1_databases[0].database_name, target === 'preview'
      ? 'beauty-by-layna-reviews-preview' : 'beauty-by-layna-reviews-production');
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.secrets.required, ['ADMIN_PASSWORD_HASH', 'SESSION_SECRET']);
    assert.ok(!Object.hasOwn(config, 'routes') && !Object.hasOwn(config, 'route'));
  }

  const build = spawnSync(process.execPath, [
    'node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run',
    '--config', path.join(root, '.wrangler.production.json'), '--outdir', path.join(root, 'bundle')
  ], {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(root, 'wrangler.log') }
  });
  assert.equal(build.status, 0, build.stdout + build.stderr);
});
