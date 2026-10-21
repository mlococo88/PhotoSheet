// Smoke test: add photos, edit, reorder, check the preview, export a PDF, reload.
// Fails on any page error. Run with `npm test`.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer(async (req, res) => {
  const rel = new URL(req.url, 'http://x').pathname;
  const file = path.join(root, decodeURIComponent(rel === '/' ? '/index.html' : rel));
  try {
    if (!file.startsWith(root)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const check = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('ok -', msg); };

try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  // Serve the CDN libraries from node_modules (same pinned versions), so the test needs no network.
  const libs = {
    'jspdf.umd.min.js': 'node_modules/jspdf/dist/jspdf.umd.min.js',
    'Sortable.min.js': 'node_modules/sortablejs/Sortable.min.js',
    'lite.umd.js': 'node_modules/exifr/dist/lite.umd.js',
  };
  await context.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, async (route) => {
    const local = libs[route.request().url().split('/').pop()];
    if (!local) return route.abort();
    route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, local)) });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.jspdf && window.Sortable);

  // Make three test JPEGs (one landscape, one portrait, one square) in the browser.
  const images = await page.evaluate(async () => {
    const make = async (w, h, color, label) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = '80px sans-serif'; x.fillText(label, 40, 120);
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      return [...new Uint8Array(await b.arrayBuffer())];
    };
    return [await make(1600, 1000, '#c33', 'B'), await make(900, 1400, '#36c', 'A'), await make(1000, 1000, '#393', 'C')];
  });
  await page.setInputFiles('#files', [
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(images[0]) },
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(images[1]) },
    { name: 'c.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(images[2]) },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3);
  check(true, 'three photos added');

  await page.click('#sortName');
  const names = await page.$$eval('#list .fname', (els) => els.map((e) => e.textContent));
  check(names.join() === 'a.jpg,b.jpg,c.jpg', 'sort by name');

  await page.click('#list .item:nth-child(3) [data-act=up]');
  const moved = await page.$$eval('#list .fname', (els) => els.map((e) => e.textContent));
  check(moved.join() === 'a.jpg,c.jpg,b.jpg', 'move up');

  await page.fill('#list .item:nth-child(1) textarea', 'North elevation, looking south. Cracking visible at the window head.');
  await page.fill('[data-key=title]', 'Site Visit');
  await page.fill('[data-key=project]', 'Test Project');
  await page.selectOption('[data-key=perPage]', '2');
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 2, 'two pages at 2 per page');
  check((await page.textContent('#pages .page')).includes('North elevation'), 'caption in preview');

  // Logo goes in the top-left corner, with the title to its right.
  const logo = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 100;
    c.getContext('2d').fillRect(0, 0, 300, 100);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  await page.setInputFiles('#logoInput', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(logo) });
  await page.waitForSelector('#pages .pg-logo');
  const [logoBox, titleBox, pageBox] = await Promise.all(['#pages .pg-logo', '#pages .pg-title', '#pages .page'].map((sel) => page.locator(sel).first().boundingBox()));
  check(logoBox.x - pageBox.x < pageBox.width * 0.1 && titleBox.x >= logoBox.x + logoBox.width, 'logo top left, title after it');
  await page.locator('[data-key=logoScale]').fill('35');
  await page.waitForTimeout(300);
  const small = await page.locator('#pages .pg-logo').first().boundingBox();
  check(small.width < logoBox.width * 0.6, 'logo size slider shrinks the logo');

  // Photo index: ticking the box adds an index page at the front; unticking removes it.
  await page.check('[data-key=includeIndex]');
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 3, 'index adds a page');
  const idx = await page.textContent('#pages .page');
  check(idx.includes('Photo Index') && idx.includes('North elevation') && idx.includes('Page 1 of 3'), 'index page is first and lists captions');
  const [withIndex] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const pdfIdx = await readFile(await withIndex.path());
  check((pdfIdx.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 3, 'pdf with index has three pages');
  await page.uncheck('[data-key=includeIndex]');
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 2, 'unticking removes the index');

  await page.click('#list .item:nth-child(2) [data-act=rotate]');
  await page.waitForTimeout(300);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const pdf = await readFile(await download.path());
  check(download.suggestedFilename() === 'Site Visit.pdf', 'pdf file name');
  check(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, `pdf written (${pdf.length} bytes)`);
  check((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 2, 'pdf has two pages');

  await page.waitForTimeout(500); // let the debounced save land
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3);
  check(await page.inputValue('[data-key=title]') === 'Site Visit', 'settings restored after reload');
  check((await page.inputValue('#list .item:nth-child(1) textarea')).startsWith('North'), 'captions restored after reload');

  // Reports: start a new one, then go back to the first.
  await page.click('#reportsBtn');
  await page.click('#newReport');
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 0);
  check(await page.inputValue('[data-key=title]') === 'Photo Log', 'new report starts empty');
  check(await page.locator('#pages .pg-logo').count() === 1, 'new report keeps the logo');
  await page.fill('[data-key=title]', 'Second Visit');
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  check(await page.locator('#reportList .report').count() === 2, 'two reports listed');
  await page.click('#reportList .report:has-text("Site Visit") [data-act=open] >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3);
  check((await page.inputValue('#list .item:nth-child(1) textarea')).startsWith('North'), 'first report reopened with captions');

  // Backup and restore.
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  const [backup] = await Promise.all([page.waitForEvent('download'), page.click('#backupReport')]);
  check(backup.suggestedFilename() === 'Site Visit.photosheet.json', 'backup file saved');
  await page.setInputFiles('#restoreInput', await backup.path());
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3 && !document.querySelector('#reports').open);
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  check(await page.locator('#reportList .report').count() === 3, 'backup opened as a third report');
  page.once('dialog', (d) => d.accept());
  await page.click('#reportList .report:has-text("Second Visit") [data-act=delete]');
  await page.waitForFunction(() => document.querySelectorAll('#reportList .report').length === 2);
  check(true, 'report deleted');
  await page.click('#closeReports');

  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3);
  check(await page.textContent('#currentName') === 'Site Visit', 'last open report reopens after reload');

  page.once('dialog', (d) => d.accept());
  await page.click('#clearAll');
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 0);
  check(true, 'remove all');

  // Phone-sized layout: tabs switch panels.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('.tabs [data-tab=previewPanel]');
  check(await page.isVisible('#previewPanel') && !(await page.isVisible('#photosPanel')), 'mobile tabs');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
} finally {
  await browser.close();
  server.close();
}
