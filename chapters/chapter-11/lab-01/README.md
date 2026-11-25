# 3D Muscle Labelling

An interactive 3D study and quiz tool for the superficial muscles of the human body, built for first-year nursing students.

- **Study mode:** rotate the model, pick a muscle from the menu (or search for it), or click a labelled region.
- **Quiz mode:** answer by typing the muscle name or by multiple choice, then review your score.
- 36 muscle labels grouped by body region.
- Works in a modern desktop or mobile browser. No account, no data collected.

## Run it locally

The app is a static website, so it also works when published on GitHub Pages (read-only).

For instructor editing (Author mode), run the small local server:

```
node server.js
```

then open http://127.0.0.1:8010/. Author mode saves labels to `data/muscle-labels.json`.

## Credits

- 3D model: ["Male Full Body Ecorche"](https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6) by [Diego Luján García](https://sketchfab.com/diegoluga) on Sketchfab (see also his [ArtStation page](https://www.artstation.com/artwork/LkmLk)), licensed under [Creative Commons Attribution (CC BY)](https://creativecommons.org/licenses/by/4.0/).
- 3D rendering: [three.js](https://threejs.org/) (MIT licence), vendored in `vendor/three/`.
- Developed with the assistance of AI coding tools.

## Licence

Copyright is retained by the project owner unless a licence is added. The 3D model remains under its own Creative Commons Attribution (CC BY) licence.
