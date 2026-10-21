# PhotoSheet

Build printable photo sheets in the browser. Add photos from your phone or
computer, put them in order, write a description for each one, and export a PDF
with a proper header (title, project details, logo) and footer (your text and
page numbers).

Everything runs on your device. Photos are never uploaded anywhere.

## Using it

1. **Add photos**:
   - **Phone**: tap *Add photos* (photo library or files) or *Camera*.
   - **Computer**: drag photos or whole folders onto the page, or use
     *Add photos* / *Add folder*.
2. **Arrange**: drag the ⋮⋮ handle to reorder, or use ↑ ↓. *Sort by name* and
   *Sort by date taken* reorder everything at once. ⟳ rotates a photo 90°.
3. **Describe**: type a description under each photo. The date taken is read
   from the photo's EXIF data when it's there, and you can edit it.
4. **Sheet**: set the title, project, location, client, date, prepared by,
   footer text and your company logo (it goes in the top-left corner); choose paper (Letter, A4, Legal), orientation, photos
   per page (1, 2, 3, 4, 6 or 8) and the first photo number.
5. **Preview** shows the pages exactly as they'll print. **Export PDF** saves
   the file.

## Reports

You can keep as many reports as you like. Tap **Reports** at the top to see
them all, open one to change a caption or add photos, start a **New report**
(your logo, footer and page setup carry over), or delete one. Everything saves
automatically as you go, and the report you had open last opens again next
time.

Reports are stored in the browser on the device you made them on. To move a
report to another device, or keep a safe copy, use **Save backup of this
report** in the Reports window. It saves one `.photosheet.json` file with the
photos inside. **Open a backup…** on any device brings it back as a report.

On iPhone, add PhotoSheet to your Home Screen (Share → Add to Home Screen).
Safari can clear storage for websites you haven't opened in a while, but it
keeps storage for Home Screen apps.

## Notes

- Large photos are scaled to 2400 px on the long edge when they're added, which
  keeps PDFs a reasonable size and is still sharp at full-page print size.
- HEIC photos open only in browsers that can decode HEIC (Safari). iPhones
  usually convert to JPEG when you pick photos in the browser.
- The PDF uses Helvetica, so characters outside Latin-1 (e.g. emoji, CJK) won't
  show in the PDF.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app. Libraries (jsPDF, SortableJS, exifr) load from CDNs |
| `tests/smoke.mjs` | Smoke test: adds photos, edits, reorders, exports a PDF, reloads |

## Running locally

Open `index.html` in a browser, or serve the folder (e.g. `npx serve .`). To
host it, publish the folder with GitHub Pages (Settings → Pages → deploy from
`main`).

## Testing

```sh
npm install
npx playwright install chromium
npm test
```

The test serves the libraries from `node_modules` instead of the CDNs, so it
runs without network access. GitHub Actions runs it on every push
(`.github/workflows/smoke.yml`).
