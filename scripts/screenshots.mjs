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
const regionCenter = async (page, code) => {
  const box = await page.locator(`path.region[data-code="${code}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const hoverRegion =
  (code, dx = 0, dy = 0) =>
  async (page) => {
    const c = await regionCenter(page, code);
    await page.mouse.move(c.x + dx, c.y + dy);
    await page.waitForTimeout(300);
  };
const clickRegion =
  (code, dx = 0, dy = 0) =>
  async (page) => {
    const c = await regionCenter(page, code);
    await page.mouse.click(c.x + dx, c.y + dy);
    await page.waitForTimeout(900);
  };
const search =
  (text, pick = true) =>
  async (page) => {
    await page.getByRole('combobox', { name: /search/i }).fill(text);
    await page.waitForTimeout(250);
    if (pick) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(900);
    }
  };
const tab = (name) => async (page) => {
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
  await page.waitForTimeout(250);
};
const choose = (label, value) => async (page) => {
  await page.getByLabel(label, { exact: true }).selectOption(value);
  await page.waitForTimeout(700);
};
const check = (label) => async (page) => {
  await page.getByLabel(label).check({ force: true });
  await page.waitForTimeout(500);
};
const ex = (name) => join(root, 'fixtures', 'import-examples', name);
const pickFiles =
  (...names) =>
  async (page) => {
    await page.setInputFiles('#import-file', names.map(ex));
    await page.waitForTimeout(300);
  };
const clickText = (name) => async (page) => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(700);
};
const clickLink = (name) => async (page) => {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForTimeout(500);
};
const header = (name) => async (page) => {
  await page.getByRole('columnheader', { name }).getByRole('button').click();
  await page.waitForTimeout(200);
};
const row = (text) => async (page) => {
  await page
    .getByRole('row', { name: new RegExp(text) })
    .first()
    .click();
  await page.waitForTimeout(400);
};
const away = async (page) => {
  await page.mouse.move(5, 300);
  await page.waitForTimeout(200);
};

/** Each shot: name, query string, and steps run before the capture. */
const sets = {
  m1: [
    { name: 'home', query: '?sample=1', steps: [] },
    { name: 'north-america', query: '?sample=1', steps: [click('North America')] },
    { name: 'empty', query: '', steps: [] },
    { name: 'settings', query: '?sample=1', steps: [click('Settings')] },
  ],
  m2: [
    { name: 'home-pins', query: '?sample=1', steps: [away] },
    { name: 'north-america-counts', query: '?sample=1', steps: [click('North America'), away] },
    { name: 'hover-card', query: '?sample=1', steps: [hoverRegion('US-MT')] },
    { name: 'state-zoom', query: '?sample=1', steps: [clickRegion('US-OR', 50, 10), away] },
    { name: 'pin-brief', query: '?sample=1', steps: [search('Sample Co 26'), away] },
    { name: 'pin-stakeholders', query: '?sample=1', steps: [search('Sample Co 26'), tab('Stakeholders'), away] },
    { name: 'pin-coverage', query: '?sample=1', steps: [search('Sample Co 26'), tab('Coverage'), away] },
    { name: 'pin-deals', query: '?sample=1', steps: [search('Sample Co 26'), tab('Deals'), away] },
    { name: 'filter-overlap', query: '?sample=1', steps: [check('3+ coverage roles'), away] },
    { name: 'filter-tier-deal', query: '?sample=1', steps: [choose('Tier fit', 'vme'), choose('Open deal', 'yes'), away] },
    { name: 'search-list', query: '?sample=1', steps: [search('sample partner', false)] },
    { name: 'partner-panel', query: '?sample=1', steps: [search('Sample Partner 2'), away] },
    { name: 'person-panel', query: '?sample=1', steps: [search('Sample Person AD'), away] },
    { name: 'empty', query: '', steps: [hoverRegion('US-OR')] },
  ],
  m3: [
    { name: 'map-empty', query: '', steps: [away] },
    { name: 'data-empty', query: '#/data', steps: [] },
    { name: 'data-pending', query: '#/data', steps: [pickFiles('people.csv', 'partners.csv', 'broken/prospects.csv', 'broken/deals.csv')] },
    {
      name: 'data-report',
      query: '#/data',
      steps: [pickFiles('people.csv', 'partners.csv', 'broken/prospects.csv', 'broken/deals.csv'), clickText(/^Import 4 files/)],
    },
    {
      name: 'map-after-import',
      query: '#/data',
      steps: [
        pickFiles('people.csv', 'partners.csv', 'prospects.csv', 'coverage.csv', 'deals.csv', 'briefs.json', 'stakeholders.json'),
        clickText(/^Import 7 files/),
        clickLink('Map'),
        clickRegion('US-WA', 0, 20),
        away,
      ],
    },
    { name: 'data-sample', query: '#/data', steps: [clickText('Load sample data')] },
    { name: 'editor', query: '', steps: [clickLink('Edit'), clickRegion('CA-AB')] },
    {
      name: 'editor-moved',
      query: '',
      steps: [
        clickLink('Edit'),
        clickRegion('CA-AB'),
        async (page) => {
          await page.getByRole('dialog').getByLabel('Territory').selectOption('pacnorthwest');
          await page.waitForTimeout(400);
        },
      ],
    },
    {
      name: 'draft-notice',
      query: '',
      steps: [
        clickLink('Edit'),
        clickRegion('CA-AB'),
        async (page) => {
          await page.getByRole('dialog').getByLabel('Territory').selectOption('pacnorthwest');
          await page.waitForTimeout(300);
        },
        clickLink('Done'),
        away,
      ],
    },
  ],
  m4: [
    { name: 'people', query: '?sample=1#/people', steps: [] },
    { name: 'people-sorted', query: '?sample=1#/people', steps: [header('Accounts'), header('Accounts')] },
    { name: 'person-form', query: '?sample=1#/people', steps: [row('Sample Person AJ'), away] },
    {
      name: 'person-errors',
      query: '?sample=1#/people',
      steps: [
        clickText('Add person'),
        async (page) => {
          await page.getByRole('dialog').getByRole('button', { name: 'Add person' }).click();
          await page.waitForTimeout(300);
        },
      ],
    },
    {
      name: 'people-filtered',
      query: '?sample=1#/people',
      steps: [
        async (page) => {
          await page.getByLabel('Filter people by role').selectOption('networking');
          await page.waitForTimeout(200);
        },
      ],
    },
    { name: 'partners', query: '?sample=1#/partners', steps: [] },
    { name: 'partner-form', query: '?sample=1#/partners', steps: [row('Sample Partner 2(?!\d)'), away] },
    { name: 'people-empty', query: '#/people', steps: [] },
    { name: 'partners-empty', query: '#/partners', steps: [] },
    { name: 'map-to-form', query: '?sample=1', steps: [search('Sample Partner 9'), clickText('Edit in Partners')] },
  ],
};
const shots = sets[milestone] ?? sets.m2;

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
      await page.waitForSelector(shot.query.includes('#/') ? '.page' : '.region');
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
