import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (target !== 'preview' && target !== 'production') {
  console.error('Usage: npm run worker:config -- preview|production');
  process.exit(1);
}

const output = new URL(`../.wrangler.${target}.json`, import.meta.url);
const previewId = process.env.CLOUDFLARE_PREVIEW_D1_ID?.toLowerCase();
const productionId = process.env.CLOUDFLARE_PRODUCTION_D1_ID?.toLowerCase();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
if (!uuid.test(previewId || '') || (target === 'production' && !uuid.test(productionId || ''))) {
  console.error('Set CLOUDFLARE_PREVIEW_D1_ID to the actual preview database UUID. Production also requires CLOUDFLARE_PRODUCTION_D1_ID.');
  process.exit(1);
}
if (previewId === productionId) {
  console.error('Preview and production must use different D1 databases.');
  process.exit(1);
}

const config = JSON.parse(await readFile(new URL('../wrangler.local.jsonc', import.meta.url), 'utf8'));
const preview = target === 'preview';
config.name = preview ? 'beautybylayna-preview' : 'beautybylayna';
config.workers_dev = true;
config.d1_databases[0].database_id = preview ? previewId : productionId;
config.d1_databases[0].database_name = preview ? 'beauty-by-layna-reviews-preview' : 'beauty-by-layna-reviews-production';

await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote .wrangler.${target}.json for ${config.name}.`);
