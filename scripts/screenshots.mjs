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
sets.m5 = [
  { name: '01-home', query: '?sample=1', steps: [away] },
  { name: '02-north-america', query: '?sample=1', steps: [click('North America'), away] },
  { name: '03-hover-card', query: '?sample=1', steps: [hoverRegion('US-MT')] },
  {
    name: '04-keyboard-focus',
    query: '?sample=1',
    steps: [
      async (page) => {
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);
      },
    ],
  },
  { name: '05-state-zoom', query: '?sample=1', steps: [clickRegion('US-OR', 50, 10), away] },
  { name: '06-pin-brief', query: '?sample=1', steps: [search('Sample Co 26'), away] },
  { name: '07-pin-stakeholders', query: '?sample=1', steps: [search('Sample Co 26'), tab('Stakeholders'), away] },
  { name: '08-pin-coverage', query: '?sample=1', steps: [search('Sample Co 26'), tab('Coverage'), away] },
  { name: '09-pin-deals', query: '?sample=1', steps: [search('Sample Co 26'), tab('Deals'), away] },
  { name: '10-filter-overlap', query: '?sample=1', steps: [check('3+ coverage roles'), away] },
  { name: '11-search', query: '?sample=1', steps: [search('sample person a', false)] },
  { name: '12-partner-panel', query: '?sample=1', steps: [search('Sample Partner 2'), away] },
  { name: '13-people', query: '?sample=1#/people', steps: [] },
  { name: '14-person-form', query: '?sample=1#/people', steps: [row('Sample Person AJ'), away] },
  { name: '15-partners', query: '?sample=1#/partners', steps: [] },
  { name: '16-partner-form', query: '?sample=1#/partners', steps: [row('Sample Partner 2(?!\\d)'), away] },
  { name: '17-data-empty', query: '#/data', steps: [] },
  {
    name: '18-import-report',
    query: '#/data',
    steps: [pickFiles('people.csv', 'partners.csv', 'broken/prospects.csv', 'broken/deals.csv'), clickText(/^Import 4 files/)],
  },
  { name: '19-map-empty', query: '', steps: [away] },
  {
    name: '20-editor',
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
  { name: '21-error-map-load', query: '', route: '**/geo/north-america.topo.json', steps: [] },
  { name: '22-error-storage-blocked', query: '#/data', blockStorage: true, steps: [] },
];
const waitDetail = async (page) => {
  await page.waitForSelector('g.detail');
  await page.waitForTimeout(300);
};
/** Zooms with the mouse wheel over the first of these cities that has a label, so it stays put. */
const wheelAt =
  (cities, clicks = 1) =>
  async (page) => {
    let box = null;
    for (const city of cities) {
      const dot = page.locator('g.city', { hasText: new RegExp(`^${city}$`) }).locator('circle');
      if (await dot.count()) {
        box = await dot.first().boundingBox();
        break;
      }
    }
    if (!box) throw new Error(`None of ${cities.join(', ')} is labeled`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < clicks; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(700);
  };
const layer = (label, on) => async (page) => {
  await page.getByRole('dialog', { name: 'Map layers' }).getByLabel(label).setChecked(on);
  await page.waitForTimeout(300);
};
/** Rests the mouse on the legend, since at state zoom the map's left edge is land and would show a card. */
const offMap = async (page) => {
  await page.mouse.move(150, 319);
  await page.waitForTimeout(200);
};
sets.m6 = [
  { name: '01-home', query: '?sample=1', steps: [waitDetail, offMap] },
  { name: '02-north-america', query: '?sample=1', steps: [waitDetail, click('North America'), offMap] },
  { name: '03-washington', query: '?sample=1', steps: [waitDetail, clickRegion('US-WA', 30, 20), offMap] },
  {
    name: '04-puget-sound',
    query: '?sample=1',
    steps: [waitDetail, clickRegion('US-WA', 30, 20), wheelAt(['Seattle', 'Bremerton', 'Tacoma'], 3), offMap],
  },
  { name: '05-oregon-pins', query: '?sample=1', steps: [waitDetail, clickRegion('US-OR', -25, 15), offMap] },
  { name: '06-layers-menu', query: '?sample=1', steps: [waitDetail, clickRegion('US-WA', 30, 20), click('Map layers')] },
  {
    name: '07-layers-off',
    query: '?sample=1',
    steps: [
      waitDetail,
      clickRegion('US-WA', 30, 20),
      click('Map layers'),
      layer('Highways', false),
      layer('Metro areas', false),
      layer('US county lines', false),
    ],
  },
  { name: '08-empty-map', query: '', steps: [waitDetail, offMap] },
  { name: '09-detail-failed', query: '?sample=1', route: '**/geo/detail.topo.json', steps: [click('Map layers')] },
];
const paste = (text) => async (page) => {
  await page.getByRole('button', { name: 'Paste rows' }).click();
  await page.locator('#paste-rows').fill(text);
  await page.getByRole('button', { name: 'Read pasted rows' }).click();
  await page.waitForTimeout(400);
};
const pickPath = (path) => async (page) => {
  await page.setInputFiles('#import-file', join(root, path));
  await page.waitForSelector('.wizard');
  await page.waitForTimeout(600);
};
const scrollTo = (selector) => async (page) => {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
};
sets.m7 = [
  { name: '01-deals', query: '?sample=1#deals', steps: [] },
  { name: '02-deal-form', query: '?sample=1#deals', steps: [row('VME migration'), offMap] },
  { name: '03-companies', query: '?sample=1#companies', steps: [] },
  { name: '04-partner-form', query: '?sample=1#companies', steps: [clickText(/^Partners/), row('Sample Partner 1(?!\\d)'), offMap] },
  { name: '05-contacts', query: '?sample=1#contacts', steps: [] },
  { name: '06-panel-contacts', query: '?sample=1', steps: [search('Sample Co 1'), tab('Contacts'), offMap] },
  { name: '07-panel-deals', query: '?sample=1', steps: [search('Sample Co 1'), tab('Deals'), offMap] },
  { name: '08-territory-card', query: '?sample=1', steps: [hoverRegion('US-MT', -40, 25)] },
  { name: '09-import-workbook', query: '#data', steps: [pickPath('fixtures/import-examples/manager-pipeline.xlsx')] },
  { name: '10-import-preview', query: '#data', steps: [pickPath('fixtures/import-examples/manager-pipeline.xlsx'), scrollTo('.preview')] },
  {
    name: '11-import-paste',
    query: '#data',
    steps: [
      paste(
        'Opportunity ID\tAccount Name\tOpportunity Name\tStage\tAmount\tClose Date\tBilling State\nOPE-0000000501\tSample Co 40\tVME pilot\tQualify\t$250,000\t1/15/2027\tWA\nOPE-0000000502\tSample Co 41\tDR site\tDevelop\t1.2M\t3/31/2027\tOR',
      ),
    ],
  },
  {
    name: '12-import-done',
    query: '#data',
    steps: [pickPath('fixtures/import-examples/manager-pipeline.xlsx'), clickText(/^Import \d+ rows/), scrollTo('.reports')],
  },
  {
    name: '13-deals-after-import',
    query: '#data',
    steps: [
      pickPath('fixtures/import-examples/manager-pipeline.xlsx'),
      clickText(/^Import \d+ rows/),
      clickLink('Deals'),
      clickText(/^All$/),
    ],
  },
  { name: '14-team', query: '?sample=1#team', steps: [] },
];
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
      const expectsFailure = Boolean(shot.route || shot.blockStorage);
      page.on('pageerror', (e) => errors.push(`${shot.name}/${scheme}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && !expectsFailure && errors.push(`${shot.name}/${scheme}: ${m.text()}`));
      // Simulated failures: a missing boundaries file, or a browser that refuses IndexedDB.
      if (shot.route) await page.route(shot.route, (r) => r.fulfill({ status: 404, body: 'missing' }));
      if (shot.blockStorage) {
        await page.addInitScript(() => {
          indexedDB.open = () => {
            throw new DOMException('blocked', 'SecurityError');
          };
        });
      }
      await page.goto(base + '/' + shot.query);
      const mapFails = shot.route?.includes('north-america');
      await page.waitForSelector(mapFails ? '.map-error' : shot.query.includes('#') ? '.page' : '.region');
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
