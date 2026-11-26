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

The server serves the whole site from the repository root so the shared platform stylesheet loads, and it only writes to `data/muscle-labels.json`. The passcode is only a convenience lock: the code is public, and saving is impossible on the published site anyway.

## Credits

- 3D model: ["Male Full Body Ecorche"](https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6) by [Diego Luján García](https://sketchfab.com/diegoluga) on Sketchfab (see also his [ArtStation page](https://www.artstation.com/artwork/LkmLk)), licensed under [Creative Commons Attribution (CC BY)](https://creativecommons.org/licenses/by/4.0/).
- 3D rendering: [three.js](https://threejs.org/) (MIT licence), vendored in `vendor/three/`.
- Lab design, ideas and content by the course instructor. Programmed by Claude Code, with some assistance from ChatGPT Codex.

## Licence

Copyright is retained by the project owner unless a licence is added. The 3D model remains under its own Creative Commons Attribution (CC BY) licence.
