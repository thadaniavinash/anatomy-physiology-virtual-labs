# Chapter 12 · Lab 1 — Nerve Impulses: From Synapse to Axon

A multi-part lab that follows one nerve signal from the synapse to the end of the axon.

| Part | Folder | Status |
|------|--------|--------|
| Overview hub | `index.html` | ready |
| 1 · Synaptic transmission (+ neurotransmitter guide tab) | `synaptic-transmission/` | interactive |
| 2 · Unmyelinated axon (continuous conduction) | `unmyelinated-axon/` | interactive |
| 3 · Myelinated axon (saltatory conduction) | `myelinated-axon/` | planned (storyboard page) |

All pages are static HTML with classic `<script>` tags, so they work on GitHub Pages **and** when opened directly from disk (`file://`). No build step.

## Structure

```
lab-01/
  index.html              overview hub: neuron "journey" diagram + part cards
  neuro.css               lab styles (layered on assets/css/shared.css)
  js/manifest.js          list of parts → drives tabs, progress, pager, cards
  js/neurolab.js          shared engine (see below)
  <part>/index.html       one folder per part
  <part>/<part>.js        part-specific geometry and drawing
```

### Shared engine (`js/neurolab.js` → `window.NeuroLab`)

- `createMembrane(opts)` is the prescribed action-potential model. Voltage, Na⁺ channel populations (closed / open / inactivated), K⁺ channel opening, refractoriness, phase and ion flux are **all functions of one variable, `age`** (ms since that patch crossed threshold), so they cannot drift out of sync.
  - `naChannel(u, age)` / `kChannel(u, age)` give the state of one drawn channel with a fixed random `u`. The fraction of drawn channels in each state matches the population curves, and each channel always goes C → O → I → C.
  - `spawnAges(kind, u, quantum, phase)` gives the times when ion particles cross a channel. One particle is drawn per `quantum` mV·ms of driving force while the channel is open, so flux ∝ open channels × driving force. Spawn times are precomputed, so scrubbing the timeline stays exact.
  - `stages` lists teaching milestones (threshold, peak g<sub>Na</sub>, peak voltage, end of absolute refractory, …).
- `createPlayer(opts)` handles play, pause, step, next stage, speed, loop and the timeline slider, and re-renders only when something has changed.
- `drawProbeTrace(svg, model, age)` draws the voltage-vs-time and channel-population plot.
- `renderChrome(partId)`, `renderPartCards(el)` and `renderQuiz(el, items)` build the navigation, the overview cards and the learning check-in.

## Adding or finishing a part

1. Create `<part>/index.html` by copying an existing part page. Keep `data-root="../"` on `<body>` and the `lab-progress`, `lab-nav` and `lab-pager` placeholders.
2. Add or update the entry in `js/manifest.js` (set `status: 'ready'` when it is interactive). Navigation updates everywhere automatically.
3. Put the part's drawing code in `<part>/<part>.js`. Reuse `createMembrane` for any excitable membrane. For example, Part 3 should evaluate it only at nodes of Ranvier, with `arrival(x)` jumping from node to node. That keeps channel behaviour identical to Part 2.

## Not yet done

- A self-contained Blackboard export (`blackboard-exports/`) for this lab. The multi-file structure would need a small inline/bundle step.
