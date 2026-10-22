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
3. **Include or leave out**: untick *Include in report* on a photo to keep it in
   the list but leave it out of the PDF, the photo index and the numbering.
   Tick it again to put it back.
4. **Mark up**: tap ✎ on a photo to draw arrows, circles, boxes, freehand
   lines and text labels on it, in red, yellow, blue, white or black and three
   sizes. *Undo* takes back the last mark. The original photo is kept, so you
   can reopen the markup later to change or clear it.
5. **Describe**: type a description under each photo. The date taken is read
   from the photo's EXIF data when it's there, and you can edit it.
6. **Project info** (button above the preview): title, project, location,
   client, date and prepared by. **Header & page**: your company logo (top-left
   corner, with a size slider), a theme for the header and footer (Classic,
   Banded, Title block, Minimal, Accent line, Centered, Corporate or Outlined;
   most take an accent colour), footer text, paper (Letter, A4, Legal),
   orientation, photos per page (1, 2, 3, 4, 6 or 8), the first photo number,
   PDF photo quality (Full, Email-friendly or Smallest; in a test, 10 photos
   came to about 12.7 MB, 2.2 MB and 1 MB),
   and what to show. Both open in a window you close with *Done*; the preview
   updates as you type.
7. **Photo index**: tick *Include photo index at the front* to start the PDF
   with a table of every photo: number, description, date taken and the page
   it's on. Untick it to leave the index out.
8. **Preview** shows the pages exactly as they'll print. **Export PDF** saves
   the file.

## Reports

You can keep as many reports as you like. Tap **Reports** at the top to see
them all, open one to change a caption or add photos, start a **New report**
(your logo, footer and page setup carry over), or delete one. Everything saves
automatically as you go, and the report you had open last opens again next
time.

Reports are stored in the browser on the device you made them on.

## Sharing a report

To send a report to someone else, or move it to another device, open
**Reports** and tap **Export report file**. On a phone this opens the share
sheet (Mail, Messages, AirDrop, Save to Files); on a computer it downloads a
`.photosheet.json` file. The file holds everything, photos included (about
1 MB per photo).

The other person opens PhotoSheet, taps **Reports → Import report file** (or
drags the file onto the page), makes their changes or adds photos, and
exports it back. When you import a report you already have, PhotoSheet asks
whether to replace your copy or keep both.

Edits aren't merged: if two people change the same report at the same time,
the copy that's imported last wins. Pass the file back and forth rather than
editing it in two places at once.

On iPhone, add PhotoSheet to your Home Screen (Share → Add to Home Screen).
Safari can clear storage for websites you haven't opened in a while, but it
keeps storage for Home Screen apps.

## Notes

- Large photos are scaled to 2400 px on the long edge when they're added, which
  keeps PDFs a reasonable size and is still sharp at full-page print size.
- iPhone HEIC photos work in every browser. Safari opens them directly; in
  other browsers (Chrome, Edge, Firefox) the first HEIC photo downloads a
  converter (heic-to, about 3 MB, then cached), so that first time needs an
  internet connection.
- The date taken is read from the photo's own camera data (EXIF in JPEG and
  HEIC, or XMP from editing apps; the app reads these itself, so it works
  even if a library fails to load), never from the
  file's date (that's usually when it was copied to the computer). Photos
  without camera data (screenshots, photos sent through some apps) are left
  blank to type in. To correct dates on photos already in a report, use
  **Fix dates…** and pick the original files; they're matched by file name.
- The PDF uses Helvetica, so characters outside Latin-1 (e.g. emoji, CJK) won't
  show in the PDF.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app. Libraries (jsPDF, SortableJS, exifr, and heic-to when a HEIC photo is added) load from CDNs |
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
