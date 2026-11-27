# Anatomy & Physiology Virtual Labs

A growing collection of free, browser-based anatomy and physiology learning activities designed primarily for first-year baccalaureate nursing students.

## Published labs

- Chapter 1, Lab 1: **Anatomical Orientation & Body Mapping**
  - Directional terms
  - Body regions and surface anatomy
  - Anatomical planes
  - Abdominal quadrants
- Chapter 11, Lab 1: **3D Muscle Labelling**
  - Interactive 3D model with 35 superficial muscle labels
  - Study mode and quiz mode (typed or multiple choice)
- Chapter 12, Lab 1: **Nerve Impulses: From Synapse to Axon** (multi-part)
  - Part 1 · Synaptic transmission and neurotransmitter guide
  - Part 2 · Continuous conduction in an unmyelinated axon
  - Part 3 · Saltatory conduction in a myelinated axon
- Chapter 18, Lab 1: **Blood Typing Lab**
  - ABO and Rh (D) antigens and antibodies
  - Slide typing simulation
  - Blood and plasma transfusion nursing care
  - Self-check quiz
- Chapter 19, Lab 1: **ECG Rhythm Monitor**
  - 14 synthesized rhythms: sinus, atrial, ventricular, AV blocks, PVCs
  - Adjustable sinus rate, 25/50 mm/s sweep, ECG-paper or monitor display
  - Two-strip side-by-side comparison
- Chapter 19, Lab 2: **Cardiac Cycle Simulator**
  - Seven phases of one heartbeat with valve states and blood flow
  - Live Wiggers diagram (pressures, ventricular volume, ECG, heart sounds)
  - Adjustable speed, phase jumping and heart sounds

## Project structure

- `index.html` — platform home for **Virtual Experiential Learning for Nurses**: one card for the virtual labs and one for the NCLEX-style case studies (its code box opens the Clinical Judgment Lab app with `?code=`)
- `labs/index.html` — the **A&P Virtual Labs** catalogue, organised by chapter, with search
- `lab-values/index.html` — **LabRef**, the case-study companion: Medical Council of Canada normal adult lab values (December 2020 list) with interpretation and nursing considerations. `?test=potassium-k-blood` opens one test by its fixed address (used by the NCLEX case-study player's Practice-mode links), `?q=potassium` opens a search
- `assets/css/platform.css` — the shared look for the library and every lab: colours, fonts, top bar, lab header and "In this lab" side rail, matching the Clinical Judgment Lab (NCLEX) app
- `assets/` — other shared styles, scripts, and optimized images
- `chapters/chapter-XX/lab-XX/` — hosted lab applications
  - Multi-part labs keep one sub-folder per part plus shared lab code (see `chapters/chapter-12/lab-01/README.md`)
- `blackboard-exports/` — self-contained HTML versions for Blackboard

The hosted versions use external optimized assets for faster delivery. Blackboard exports remain fully self-contained for direct insertion into a learning-management system.

## Learner privacy

The labs do not store, save, or submit learner data.

## Image disclosure

The human-model and plane images in Chapter 1 and the hand image in the Chapter 18 blood typing simulation were generated with artificial intelligence and are labelled as such within each lab.

## Acknowledgement

© 2026. Lab design, ideas and content by the course instructor. Simulations programmed by Claude Code, with some assistance from ChatGPT Codex.

## Copyright

Copyright is retained by the project owner. Public access to this repository does not grant permission to redistribute, modify, or commercially reuse its contents unless a licence is added later.
