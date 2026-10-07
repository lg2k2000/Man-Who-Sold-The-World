// Serves the production build and screenshots it in headless Chromium at
// 1440 by 900, in light and dark mode. Usage: node scripts/screenshots.mjs m1
// Run `npm run build` first. Output goes to docs/screenshots/<milestone>/.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const milestone = process.argv[2] ?? 'scratch';
const only = process.argv[3];
const outDir = join(root, 'docs', 'screenshots', milestone);
mkdirSync(outDir, { recursive: true });

const click = (name) => async (page) => {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForTimeout(900);
};

/** Each shot: name, query string, and steps run before the capture. */
const shots = [
  { name: 'home', query: '?sample=1', steps: [] },
  { name: 'north-america', query: '?sample=1', steps: [click('North America')] },
  { name: 'empty', query: '', steps: [] },
  {
    name: 'settings',
    query: '?sample=1',
    steps: [click('Settings')],
  },
];

const server = await preview({ root, preview: { port: 4317, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const errors = [];

try {
  for (const scheme of ['light', 'dark']) {
    for (const shot of shots) {
      if (only && shot.name !== only) continue;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${shot.name}/${scheme}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${shot.name}/${scheme}: ${m.text()}`));
      await page.goto(base + '/' + shot.query);
      await page.waitForSelector('.region');
      await page.waitForTimeout(400);
      for (const step of shot.steps) await step(page);
      const file = join(outDir, `${shot.name}-${scheme}.png`);
      await page.screenshot({ path: file });
      console.log(`Wrote ${file}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (errors.length) {
  console.error('Browser errors:\n' + errors.join('\n'));
  process.exit(1);
}
