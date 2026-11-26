# 3D Muscle Labelling

An interactive 3D study and quiz tool for the superficial muscles of the human body, built for first-year nursing students.

- **Study mode:** rotate the model, pick a muscle from the menu (or search for it), or click a labelled region.
- **Quiz mode:** answer by typing the muscle name or by multiple choice, then review your score.
- 36 muscle labels grouped by body region.
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

### Muscle outlines (prototype)

Each side of a muscle can have a painted outline: the triangles of the 3D model that belong to it, stored in `data/muscle-regions.json` (separate from the labels). A student who clicks anywhere on an outlined muscle, from any angle, gets that muscle and side, and the selected muscle is shown tinted with an outline that follows its shape. Muscles without an outline keep the older labelling point and click region.

To paint one, open the muscle in Author mode and choose **Paint outline** (or **Edit outline**) for a side:

- **Fill**: click inside the muscle. The outline spreads across the red muscle surface until it meets the pale tendon and fascia lines of the model's texture, and never crosses the midline. Click again to add another segment (for example each segment of rectus abdominis).
- **Brush** / **Erase**: drag over the surface; the slider sets the size. Dragging off the model still rotates it.
- **Copy to other side**: mirrors the outline across the midline (the figure's left is +x).
- **Save muscle** saves the label and the outlines together.

Code: `src/regions.js` (outline engine) and the hooks in `src/app.js` (search for `regions`). Pectoralis major, deltoid and rectus abdominis have draft outlines that need anatomical review.

The server serves the whole site from the repository root so the shared platform stylesheet loads, and it only writes to `data/muscle-labels.json`. The passcode is only a convenience lock: the code is public, and saving is impossible on the published site anyway.

## Credits

- 3D model: ["Male Full Body Ecorche"](https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6) by [Diego Luján García](https://sketchfab.com/diegoluga) on Sketchfab (see also his [ArtStation page](https://www.artstation.com/artwork/LkmLk)), licensed under [Creative Commons Attribution (CC BY)](https://creativecommons.org/licenses/by/4.0/).
- 3D rendering: [three.js](https://threejs.org/) (MIT licence), vendored in `vendor/three/`.
- Lab design, ideas and content by the course instructor. Programmed by Claude Code, with some assistance from ChatGPT Codex.

## Licence

Copyright is retained by the project owner unless a licence is added. The 3D model remains under its own Creative Commons Attribution (CC BY) licence.
