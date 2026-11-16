# The Demiurge

A WorldBox-style god sim where the inhabitants think for themselves. Tiny pixel civilizations discover materials and technology from hidden world rules, form beliefs about why things happen, found religions and cults, start revolutions, and run their own geopolitics, including arms races.

The AI runs locally in the player's browser (WebGPU), so there are no API costs.

## Status

Design stage. The first test is the **model bake-off**, which compares small open models running in the browser.

- Phase 0: https://kbobby92.github.io/the-demiurge/phase0/
- Bake-off: https://kbobby92.github.io/the-demiurge/bakeoff/
- Requires Chrome or Edge with WebGPU. The first run downloads several GB of models, which are cached afterwards.

## Layout

- `index.html` – project landing page (the game will live here later)
- `phase0/` – Phase 0 text-only story test (`sim.js` is the simulation core; `index.html` runs it with Gemma 4)
- `bakeoff/` – local model bake-off test page
