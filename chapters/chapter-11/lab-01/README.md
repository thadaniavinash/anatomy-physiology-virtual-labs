# 3D Muscle Labelling

An interactive 3D study and quiz tool for the superficial muscles of the human body, built for first-year nursing students.

- **Study mode:** rotate the model, pick a muscle from the menu (or search for it), or click a labelled region.
- **Quiz mode:** answer by typing the muscle name or by multiple choice, then review your score.
- 35 muscle labels grouped by body region.
- Works in a modern desktop or mobile browser. No account, no data collected.

## Editing the labels (Author mode)

On the published site the app is read-only: students can study and quiz, and the instructor lock is hidden. Labels are edited on a computer with a copy of the repository and [Node.js](https://nodejs.org/) installed:

1. In a terminal, go to this folder (`chapters/chapter-11/lab-01/`) and run:

   ```
   node server.js
   ```

2. Open http://127.0.0.1:8010/ (it goes straight to the app). The page looks exactly like the published lab.
3. Select the lock icon in the top bar, enter the instructor passcode, and choose **Author** to add, edit, position or delete muscle labels. **Save muscle** writes the change to `data/muscle-labels.json`.
4. Commit and push `data/muscle-labels.json` to `main`. GitHub Pages publishes the new labels to students within a few minutes.

### Muscle outlines

Each side of a muscle can have an outline: the parts of the 3D model that belong to it, stored in `data/muscle-regions.json` (separate from the labels). A student who clicks anywhere on an outlined muscle, from any angle, gets that muscle and side, and the selected muscle is shown tinted with an outline that follows its shape. Muscles without an outline keep the older labelling point and click region.

**Checking and fixing outlines: the Outline review screen.** With `node server.js` running, open http://127.0.0.1:8010/chapters/chapter-11/lab-01/outlines.html (or, in Author mode, select **Outline review** in the top bar, or the link beside a muscle's outline).

- **Checklist** (left): every muscle with its status: *To review*, *Looks right* or *No outline*. Filter by status; **Next to review** (or `N`) moves to the next muscle not yet marked. Click a muscle (or double-click it on the model) to open it; the camera turns to face it.
- **Colours**: the side you are editing is amber with a navy outline, the other side of the same muscle is blue, other muscles are grey.
- **Trace** (`T`): hold the mouse button down and draw a loop around the part to add. Hold **Alt** (Option on a Mac) while drawing to remove the part inside the loop instead. Only what you can see is taken; tick **See through** (`X`) to reach parts hidden behind other surfaces.
- **Brush** (`B`) / **Eraser** (`E`): for small touch-ups; `[` and `]` change the size. **Fill** (`F`): click inside the red muscle and it spreads to the pale tendon lines.
- **Turning the model**: right-drag (or hold **Space**, or the **Rotate** tool `V`), scroll to zoom; **Front / Back / Left / Right / Face this muscle** buttons.
- **Both sides** (on by default, `M`): each change is repeated on the mirror-image side, so you fix one side only. Only the change is copied; the rest of the other side is kept. Untick it for a muscle whose sides differ. **Copy left side to the right side** replaces the whole other side.
- Parts that already belong to another muscle are left alone (a message names the muscle); tick **Take from other muscles** to include them.
- **Undo / Redo** (`Ctrl+Z` / `Ctrl+Shift+Z`) for every change; **Revert this muscle to the saved version**.
- **Mark as looking right** (`K`) when a muscle is correct. **Save** (`Ctrl+S`) writes all outlines and the review marks to `data/muscle-regions.json`; then commit and push that file to `main`. The page warns before closing with unsaved changes. On the published website the page opens in view-only mode.

Review marks (`"review"` in the same file) are for the instructor only; students never see them. The muscle's labelling point (arrow) is still set in Author mode.

Code: `src/regions.js` (outline engine), `src/outline-review.js` + `src/outline-pick.js` (review screen, trace selection), hooks in `src/app.js` (search for `regions`). Drafting notes: `OUTLINE_REVIEW.md`.

The server serves the whole site from the repository root so the shared platform stylesheet loads, and it only writes to `data/muscle-labels.json` and `data/muscle-regions.json`. The passcode is only a convenience lock: the code is public, and saving is impossible on the published site anyway.

## Credits

- 3D model: ["Male Full Body Ecorche"](https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6) by [Diego Luján García](https://sketchfab.com/diegoluga) on Sketchfab (see also his [ArtStation page](https://www.artstation.com/artwork/LkmLk)), licensed under [Creative Commons Attribution (CC BY)](https://creativecommons.org/licenses/by/4.0/).
- 3D rendering: [three.js](https://threejs.org/) (MIT licence), vendored in `vendor/three/`.
- Lab design, ideas and content by the course instructor. Programmed by Claude Code, with some assistance from ChatGPT Codex.

## Licence

Copyright is retained by the project owner unless a licence is added. The 3D model remains under its own Creative Commons Attribution (CC BY) licence.
