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
const settings = async (page, dlg, fn) => { // open a settings window, fill it in, close it
  await page.click(`[data-open=${dlg}]`);
  await fn();
  await page.click(`#${dlg} [data-close]`);
};
const check = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('ok -', msg); };

try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  // Serve the CDN libraries from node_modules (same pinned versions), so the test needs no network.
  const libs = {
    'jspdf.umd.min.js': 'node_modules/jspdf/dist/jspdf.umd.min.js',
    'Sortable.min.js': 'node_modules/sortablejs/Sortable.min.js',
    'lite.umd.js': 'node_modules/exifr/dist/lite.umd.js',
    'heic-to.js': 'node_modules/heic-to/dist/iife/heic-to.js',
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
  await settings(page, 'projectDlg', async () => {
    await page.fill('[data-key=title]', 'Site Visit');
    await page.fill('[data-key=project]', 'Test Project');
  });
  await settings(page, 'layoutDlg', () => page.selectOption('[data-key=perPage]', '2'));
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
  await settings(page, 'layoutDlg', () => page.locator('[data-key=logoScale]').fill('35'));
  await page.waitForTimeout(300);
  const small = await page.locator('#pages .pg-logo').first().boundingBox();
  check(small.width < logoBox.width * 0.6, 'logo size slider shrinks the logo');

  // Every theme draws a header and footer in the preview, and exports.
  for (const theme of ['banded', 'titleblock', 'minimal', 'accentline', 'centered', 'corporate', 'outlined', 'classic']) {
    await settings(page, 'layoutDlg', () => page.selectOption('[data-key=theme]', theme));
    await page.waitForTimeout(250);
    const text = await page.textContent('#pages .page');
    check(text.includes('Site Visit') && text.includes('Page 1 of 2'), `${theme} theme shows header and footer`);
    if (theme === 'titleblock') {
      const [d] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
      check(((await readFile(await d.path())).toString('latin1').match(/\/Type \/Page\b/g) || []).length === 2, 'title block theme exports');
    }
  }

  // Unticking "Include in report" leaves a photo out of the preview and renumbers the rest.
  await page.uncheck('#list .item:nth-child(2) [data-include]');
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 1, 'excluded photo leaves the preview');
  check(await page.textContent('#list .item:nth-child(2) .num') === 'Not in report'
    && await page.textContent('#list .item:nth-child(3) .num') === 'Photo 2', 'excluded photo is unnumbered, the rest renumber');
  const [partial] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  check((((await readFile(await partial.path())).toString('latin1')).match(/\/Type \/Page\b/g) || []).length === 1, 'pdf leaves out the excluded photo');
  await page.check('#list .item:nth-child(2) [data-include]');
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 2, 'ticking it again puts it back');

  // Photo index: ticking the box adds an index page at the front; unticking removes it.
  await settings(page, 'layoutDlg', () => page.check('[data-key=includeIndex]'));
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 3, 'index adds a page');
  const idx = await page.textContent('#pages .page');
  check(idx.includes('Photo Index') && idx.includes('North elevation') && idx.includes('Page 1 of 3'), 'index page is first and lists captions');
  const [withIndex] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const pdfIdx = await readFile(await withIndex.path());
  check((pdfIdx.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 3, 'pdf with index has three pages');
  await settings(page, 'layoutDlg', () => page.uncheck('[data-key=includeIndex]'));
  await page.waitForTimeout(300);
  check(await page.locator('#pages .page').count() === 2, 'unticking removes the index');

  // Markup: draw an arrow and a text label on photo 1, undo, redraw, keep it through a rotate.
  const thumbBefore = await page.getAttribute('#list .item:nth-child(1) .thumb', 'src');
  await page.click('#list .item:nth-child(1) [data-act=markup]');
  await page.waitForSelector('#markupDlg[open]');
  const box = await page.locator('#mkCanvas').boundingBox();
  const drag = async (x1, y1, x2, y2) => {
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 5 });
    await page.mouse.up();
  };
  await drag(0.2, 0.2, 0.6, 0.6);
  await page.click('[data-tool=ellipse]');
  await drag(0.5, 0.5, 0.8, 0.8);
  await page.click('#mkUndo');
  await page.click('[data-tool=text]');
  page.once('dialog', (d) => d.accept('Crack'));
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.8);
  await page.click('#mkDone');
  await page.waitForFunction(() => state.photos[0].markedId && blobs.has(state.photos[0].markedId));
  check((await page.evaluate(() => state.photos[0].marks.map((m) => m.type).join())) === 'arrow,text', 'markup saved (arrow and text; undo removed the circle)');
  check(await page.getAttribute('#list .item:nth-child(1) .thumb', 'src') !== thumbBefore, 'thumbnail shows the markup');
  const before = await page.evaluate(() => state.photos[0].marks[0].pts[0].join());
  await page.click('#list .item:nth-child(1) [data-act=rotate]');
  await page.waitForFunction((b) => state.photos[0].marks[0].pts[0].join() !== b && blobs.has(state.photos[0].markedId), before);
  check(await page.evaluate(() => state.photos[0].w > state.photos[0].h && !!state.photos[0].markedId), 'markup kept and turned when the photo is rotated');

  await page.click('#list .item:nth-child(2) [data-act=rotate]');
  await page.waitForTimeout(300);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const pdf = await readFile(await download.path());
  check(download.suggestedFilename() === 'Site Visit.pdf', 'pdf file name');
  check(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, `pdf written (${pdf.length} bytes)`);
  check((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 2, 'pdf has two pages');

  // Smallest photo quality makes a smaller PDF.
  await settings(page, 'layoutDlg', () => page.selectOption('[data-key=pdfQuality]', 'small'));
  const [smallPdf] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const smallBytes = await readFile(await smallPdf.path());
  check(smallBytes.length < pdf.length, `smallest quality makes a smaller pdf (${smallBytes.length} < ${pdf.length} bytes)`);
  await settings(page, 'layoutDlg', () => page.selectOption('[data-key=pdfQuality]', 'full'));

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
  await settings(page, 'projectDlg', () => page.fill('[data-key=title]', 'Second Visit'));
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  check(await page.locator('#reportList .report').count() === 2, 'two reports listed');
  await page.click('#reportList .report:has-text("Site Visit") [data-act=open] >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3);
  check((await page.inputValue('#list .item:nth-child(1) textarea')).startsWith('North'), 'first report reopened with captions');

  // Export a report file, then import it: first keeping both, then replacing the copy.
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  const [exported] = await Promise.all([page.waitForEvent('download'), page.click('#exportReport')]);
  check(exported.suggestedFilename() === 'Site Visit.photosheet.json', 'report file exported');
  const reportFile = await exported.path();
  page.once('dialog', (d) => d.dismiss());
  await page.setInputFiles('#importInput', reportFile);
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 3 && !document.querySelector('#reports').open);
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  check(await page.locator('#reportList .report').count() === 3, 'import keeps both when asked');
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('#importInput', reportFile);
  await page.waitForFunction(() => !document.querySelector('#reports').open);
  await page.click('#reportsBtn');
  await page.waitForSelector('#reports[open]');
  check(await page.locator('#reportList .report').count() === 3, 'import replaces the existing copy');
  check((await page.inputValue('#list .item:nth-child(1) textarea')).startsWith('North'), 'imported report has its captions');
  check(await page.evaluate(() => !!(state.photos[0].markedId && blobs.has(state.photos[0].markedId) && state.photos[0].marks.length === 2)), 'imported report keeps the markup');
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

  // iPhone HEIC photos convert (Chromium can't open HEIC itself), and the date taken is read from the photo.
  await page.setInputFiles('#files', [path.join(root, 'tests/fixtures/IMG_0001.HEIC'), path.join(root, 'tests/fixtures/exif-date.jpg')]);
  await page.waitForFunction(() => document.querySelectorAll('#list .item').length === 2, null, { timeout: 60000 });
  const imported = await page.evaluate(() => state.photos.map(({ name, w, h, taken }) => ({ name, w, h, taken })));
  check(imported[0].name === 'IMG_0001.HEIC' && imported[0].w === 1600 && imported[0].h === 1200, 'HEIC photo converted and added');
  check(imported[1].taken === '2024-03-02 11:22', `date taken read from the photo (${imported[1].taken})`);
  check(imported[0].taken === '2025-06-14 09:30', `HEIC date taken read (${imported[0].taken})`);

  // Date taken from every kind of file, with and without exifr (which can fail to load or to read a file).
  const datesFrom = (withoutExifr) => page.evaluate(async (off) => {
    const saved = window.exifr;
    if (off) window.exifr = undefined;
    try {
      const out = {};
      for (const name of ['exif-date.jpg', 'exif-little-endian.jpg', 'xmp-date.jpg', 'no-date-taken.jpg', 'IMG_0001.HEIC']) {
        const blob = await (await fetch(`tests/fixtures/${name}`)).blob();
        out[name] = await readTaken(new File([blob], name));
      }
      return out;
    } finally { window.exifr = saved; }
  }, withoutExifr);
  const expected = { 'exif-date.jpg': '2024-03-02 11:22', 'exif-little-endian.jpg': '2024-12-31 23:59', 'xmp-date.jpg': '2025-09-30 07:45', 'no-date-taken.jpg': '', 'IMG_0001.HEIC': '2025-06-14 09:30' };
  // Dragging a photo onto the page reads its date the same way.
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File([await (await fetch('tests/fixtures/exif-little-endian.jpg')).blob()], 'dragged.jpg', { type: 'image/jpeg' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => state.photos.some((p) => p.name === 'dragged.jpg') && !importing);
  check(await page.evaluate(() => state.photos.find((p) => p.name === 'dragged.jpg').taken) === '2024-12-31 23:59', 'dragged-in photo gets its date taken');
  await page.click('#list .item:last-child [data-act=remove]');

  for (const off of [false, true]) {
    const got = await datesFrom(off);
    check(JSON.stringify(got) === JSON.stringify(expected), `dates read correctly ${off ? 'without' : 'with'} exifr: ${JSON.stringify(got)}`);
  }
  await page.fill('#list .item:nth-child(2) input.taken', '2026-01-01 00:00');
  await page.setInputFiles('#fixDatesInput', path.join(root, 'tests/fixtures/exif-date.jpg'));
  await page.waitForFunction(() => state.photos[1].taken === '2024-03-02 11:22');
  check(await page.inputValue('#list .item:nth-child(2) input.taken') === '2024-03-02 11:22', 'Fix dates reads the date from the original file');

  // Phone-sized layout: tabs switch panels.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('.tabs [data-tab=previewPanel]');
  check(await page.isVisible('#previewPanel') && !(await page.isVisible('#photosPanel')), 'mobile tabs');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
} finally {
  await browser.close();
  server.close();
}
