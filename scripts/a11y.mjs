// Accessibility checks against the production build in headless Chromium:
// an axe-core scan of every view in both themes, and a keyboard walk through
// the map (regions, pins, panel tabs) with no mouse. Run `npm run build` first.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await preview({ root, preview: { port: 4320, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const failures = [];

const views = [
  { name: 'map', url: '/?sample=1', ready: '.region' },
  { name: 'map empty', url: '/', ready: '.region' },
  { name: 'deals', url: '/?sample=1#deals', ready: '.records' },
  { name: 'companies', url: '/?sample=1#companies', ready: '.records' },
  { name: 'contacts', url: '/?sample=1#contacts', ready: '.records' },
  { name: 'HPE team', url: '/?sample=1#team', ready: '.records' },
  { name: 'data', url: '/#data', ready: '.page' },
  {
    name: 'deal form',
    url: '/?sample=1#deals',
    ready: '.records',
    steps: async (page) => {
      await page.locator('table.records tbody tr').first().click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'company panel contacts',
    url: '/?sample=1',
    ready: '.region',
    steps: async (page) => {
      await page.getByRole('combobox', { name: /search/i }).fill('Sample Co 1');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      await page.getByRole('tab', { name: /^Contacts/ }).click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'map layers at state zoom',
    url: '/?sample=1',
    ready: '.region',
    steps: async (page) => {
      await page.waitForSelector('g.detail', { state: 'attached' });
      await page.getByRole('combobox', { name: /search/i }).fill('Sample Co 26');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Map layers' }).click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'pin panel',
    url: '/?sample=1',
    ready: '.region',
    steps: async (page) => {
      await page.getByRole('combobox', { name: /search/i }).fill('Sample Co 26');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'territory editor',
    url: '/',
    ready: '.region',
    steps: async (page) => {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const box = await page.locator('path.region[data-code="CA-AB"]').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'import matching and preview',
    url: '/#data',
    ready: '.page',
    steps: async (page) => {
      await page.setInputFiles('#import-file', join(root, 'fixtures', 'import-examples', 'manager-pipeline.xlsx'));
      await page.waitForSelector('.preview');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'import report',
    url: '/#data',
    ready: '.page',
    steps: async (page) => {
      await page.setInputFiles('#import-file', join(root, 'fixtures', 'import-examples', 'broken', 'deals.csv'));
      await page.waitForSelector('.preview');
      await page.getByRole('button', { name: /^Import \d+ row/ }).click();
      await page.waitForSelector('.reports');
    },
  },
  {
    name: 'person form',
    url: '/?sample=1#team',
    ready: '.records',
    steps: async (page) => {
      await page.getByRole('button', { name: 'Add person' }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Add person' }).click();
      await page.waitForTimeout(300);
    },
  },
];

try {
  for (const scheme of ['light', 'dark']) {
    for (const v of views) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(base + v.url);
      await page.waitForSelector(v.ready);
      await page.waitForTimeout(500);
      if (v.steps) await v.steps(page);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const violation of result.violations) {
        failures.push(
          `${v.name} (${scheme}): ${violation.id} – ${violation.help} (${violation.nodes.length}): ${violation.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
        );
      }
      console.log(`axe ${v.name} (${scheme}): ${result.violations.length} violations, ${result.passes.length} rules passed`);
      await context.close();
    }
  }

  // Keyboard only: skip link, regions, Enter to zoom, pins, Enter to open, tabs.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(base + '/?sample=1');
  await page.waitForSelector('.region');
  await page.waitForTimeout(500);
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}|${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 60)}` : '';
    });
  const step = async (key, expect) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    const f = await focused();
    const ok = expect.test(f);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(10)} -> ${f}`);
    if (!ok) failures.push(`keyboard: after ${key} expected ${expect} but focus was ${f}`);
  };
  await step('Tab', /Skip to the map/);
  await step('Enter', /^path\|Alaska\. PacNorthwest/);
  if (!(await page.locator('.tcard').count())) failures.push('keyboard: focusing a region did not show the territory card');
  await step('ArrowRight', /^path\|British Columbia/);
  await step('ArrowRight', /^path\|Idaho/);
  await step('Enter', /^path\|Idaho/);
  const chip = await page.locator('.chip').textContent();
  if (!chip?.includes('Idaho')) failures.push(`keyboard: Enter on Idaho did not select it (chip: ${chip})`);
  await step('Tab', /^g\|Sample Co \d+, (Boise|Idaho Falls)/);
  await step('ArrowRight', /^g\|Sample Co/);
  await step('Enter', /^h2\|Sample Co/);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if ((await focused()).startsWith('button|Brief')) break;
  }
  await step('ArrowRight', /^button\|Contacts/);
  const selected = await page.locator('[role=tab][aria-selected=true]').textContent();
  if (!selected?.startsWith('Contacts')) failures.push('keyboard: ArrowRight did not select the Contacts tab');
  await step('Escape', /^g\|Sample Co/);
  await context.close();
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (failures.length) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
console.log('\nNo accessibility failures.');
