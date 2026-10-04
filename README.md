# Apex GP — F1 Race Desk

A single-page Formula 1 race strategy dashboard. It opens mid-race at Spa-Francorchamps on lap 28 of 44, with two cars, twenty cars circulating on the map, a tyre strategy to approve, and a race control channel that is suspiciously calm.

It is a **design and interaction exercise**, not a telemetry product. Every driver, lap time, gap and weather reading is fictional.

- **Stack:** HTML, CSS, and vanilla JavaScript. Nothing else.
- **Dependencies:** none. No build step, no `npm install`, no framework.
- **Size:** ~122 KB across the six files the browser loads, ~47 KB over the wire once gzipped, plus a 40 KB map asset.
- **Race:** starts on the grid at lap 0 and runs to the selected circuit's real final lap.

---

## Run it in ten seconds

The project is static, so you have two options.

**Just open the file.** Double-click `index.html`, or drag it into a browser. It works straight off the filesystem — the scripts are plain `<script>` tags, not ES modules, so there's no CORS or server requirement.

**Or serve it locally** if you prefer clean URLs and proper caching:

```bash
git clone https://github.com/Raghav2012Code/f1-team-dashboard.git
cd f1-team-dashboard

python -m http.server 8000     # then open http://localhost:8000
```

The only feature that needs a network connection is the circuit selector, which hot-links official track diagrams from Formula1.com. Everything else — including the built-in Spa map — is bundled in the repo.

There is nothing to build and nothing to install. Any static host (GitHub Pages, Vercel, Netlify, S3) will serve it as-is.

---

## What you'll see

| Panel | What's on it |
| --- | --- |
| **Race strip** | Session status, lap counter, progress bar, live countdown to the race distance, and an `ADVANCE LAP` button. The race starts at **lap 0** and runs to the selected circuit's final lap. |
| **Driver cards** | Mara Voss (#27, P4, on mediums) and Eli Navarro (#63, P7, on softs) — position, gap ahead, last lap, tyre age, personal best. Click one to highlight that car on the map. |
| **Weather card** | Air and track temperature, rain probability, wind, and an asphalt state readout — per circuit. |
| **Track map** | The real Spa layout with an interactive SVG overlay: twenty cars moving along the racing line, nineteen tappable turn markers, sector key, and per-corner engineer notes. |
| **Circuit selector** | Swap the map for any of 23 official 2026 season circuits. The cars keep circulating along that circuit's mapped racing line. |
| **Strategy desk** | Tyre stint bars per driver that fill as the race runs, the pit window, the stop countdown, and a one-click toggle between Plan A (one stop) and Plan B (no stop). |
| **Race control** | Current flag state, an expandable incident report, and safety car / VSC / penalty status. |
| **Race picture** | A chart with three tabs — lap time, race position, and sector pace. Hand-drawn SVG, no charting library. |
| **Sector split** | Per-driver sector times with personal-best highlighting, best-in-sector deltas, and a written insight. |

---

## Things to try

The dashboard is built to be poked at, so give it a minute:

1. **Run the race.** It loads on the grid at **lap 0** and advances on its own, one lap per ~107 seconds of real time at Spa, faster on shorter circuits. The tyre ages, the two lap badges, the stint bars and the progress bar all move with it. Hit `ADVANCE LAP` to skip ahead. The chequered flag drops on the circuit's real final lap and the controls lock.
2. **Watch a pit stop.** Plan A pits around 45% of the way through — lap 20 at Spa, lap 35 at Monaco. On that lap the tyre age resets to zero and each driver picks up their second compound: Voss goes to hards, Navarro to mediums. Plan B skips the stop entirely and runs the opening tyre to the flag.
3. **Read a corner.** Click any of the 19 turn markers on the Spa map — or tab to one and press Enter. Each one has an engineer's note. `RESET VIEW` clears your selection.
4. **Swap the circuit.** Change the dropdown from *Spa · live race* to Suzuka, Monza, Interlagos, anywhere. The whole desk follows: map, race distance, lap clock, weather, sector names, the headline's corner name, and the field's pace. Monaco runs 78 laps, Las Vegas 50, and the race restarts on the grid.
5. **Change the plan.** The `✓` on the strategy desk flips between Plan A and Plan B. Do it mid-race and the stint bars, tyre compound, pit window and plan badge all react.
6. **Switch drivers.** Click a driver card. The other car's marker dims on the map so you can follow one at a time.
7. **Cycle the charts.** Lap time, position and sector pace are three readings of the laps run so far; the x-axis follows the race as it goes.
8. **Enter focus mode.** The `◎` button in the top bar dims the analytics, weather and race control panels and highlights the map and strategy desk. The `☰` button is a mobile navigation drawer.
9. **Resize the window.** The layout reflows at 1050px, 720px and 400px.

---

## How the map works

The track map is two layers stacked on top of each other:

- **A base image** of the circuit — either the bundled `assets/spa-francorchamps-map.svg`, or an official diagram hot-linked from Formula1.com.
- **An SVG overlay** in the same coordinate space. It holds a single invisible `<path>` describing the racing line, plus a group per car.

Each car is an SVG `<g>` containing an `<animateMotion>` element with an `<mpath>` reference to that path. The per-car `dur` is derived from that driver's lap time (scaled down by 3× so a lap takes about 36 seconds instead of nearly two minutes), and each car starts at a negative `begin` offset so the field is spread around the circuit instead of nose-to-tail. `rotate="auto"` turns each car to face the direction of travel.

Switching circuits swaps the path's `d` attribute and the overlay's `viewBox` to match the new image's natural dimensions, then rebuilds every car's motion element. That's the whole animation system — no canvas, no physics, no tweening library.

---

## Project structure

```
index.html                     Markup, panel structure, the Spa turn markers
styles.css                     The entire theme and layout (shipped minified)
race-state.js                  The race model: pure arithmetic, no DOM, no timers
script.js                      Rendering and interaction; owns no race state
circuits-data.js               23 circuits: name, length, laps, map URL, event URL
circuit-routes.js              Traced racing-line paths, keyed by circuit slug
assets/spa-francorchamps-map.svg   Bundled Spa layout, 19 turns + sector markings
test/race-state.test.cjs       20 tests over the race model, stock node
tools-lint.cjs                 Markup, data and CSS consistency checks
verify-calendar.cjs            Checks circuits-data.js against the 2026 calendar
```

The data files are plain globals — `OFFICIAL_F1_CIRCUITS`, `OFFICIAL_CIRCUIT_ROUTES` and `RACE_STATE` — read directly by `script.js`. Adding a circuit means adding an entry to both circuit files, keyed by the same slug.

### Where the race state lives

All of it is in **one object**, `raceState`, and the arithmetic that maintains it is in `race-state.js`. `script.js` only reads it and writes it to the DOM.

Two rules, both enforced rather than documented:

- **`RACE_STATE.reset(state, circuit)` is the only thing that puts the race back on the grid.** It is called at the top of `applyCircuitContext`, before anything reads the state, so there is no window in which one circuit's elapsed time can be scored against another circuit's lap pace. That ordering used to be a comment, and the bug it described — the pit stop latching as already-made — shipped anyway.
- **Nothing outside `race-state.js` may assign a race field.** `tools-lint.cjs` fails if `script.js` writes to `raceState.lap`, `raceState.stopCompleted` and friends, or re-declares them as loose variables.

Because `race-state.js` has no DOM and no timers, the whole 24-circuit race sweep runs headlessly in Node in milliseconds — which is what `test/race-state.test.cjs` does.

### What is real and what is invented

`circuits-data.js` mixes both on purpose, and it is worth knowing which is which:

| Field | Status |
| --- | --- |
| `name`, `country`, `length`, `laps`, `date` | Real, from the published 2026 calendar |
| `mapUrl`, `eventUrl` | Real, served by Formula1.com |
| `lapBase` | **Invented.** A plausible race lap per circuit, used for the clock, car speed and sector scaling |
| `sectors`, `corner` | Real circuit features |
| `weather` | **Invented.** Plausible conditions for that venue in that month — not a live feed |

`node verify-calendar.cjs` checks `circuits-data.js` against the published 2026 calendar: round count and order, circuit length, lap count, and the race date including its weekday.

Four 2026 quirks are baked in and easy to trip over:

- **The Bahrain GP is at Sepang.** The April race at Sakhir was cancelled, so Malaysia hosts the Bahrain Grand Prix in October: 56 laps of the 5.543 km Sepang circuit. The `bahrain` slug carries Sepang's venue, length, lap count and map, and `country` is **Malaysia** because the race strip reports the host nation, not the race's name.
- **There is no Saudi Arabian GP.** Jeddah was cancelled alongside Bahrain and not replaced, which is why the calendar has 23 rounds and not 24.
- **There are two Spanish races, and their names are easy to swap.** The Spanish Grand Prix is the new street circuit at Madring, Madrid. The long-standing race at Montmeló keeps its own round as the **Barcelona-Catalunya Grand Prix**.
- **Two rounds are Saturdays, not Sundays.** Azerbaijan moved to Saturday 26 September at the promoter's request, and Las Vegas is Saturday 21 November. Every other round is a Sunday, so the desk's copy names the weekday per circuit rather than assuming.

---

## Tech stack

- **HTML5** — semantic structure, `aria` labelling on the interactive controls.
- **CSS3** — CSS Grid and Flexbox, custom properties for the whole palette, no framework.
- **Vanilla JavaScript (ES6+)** — `requestAnimationFrame` race loop, event delegation, direct DOM and SVG construction.
- **SVG** — track overlay, car motion paths, and the charts (drawn as `<polyline>` with a hand-rolled scale).

### Design tokens

The entire theme lives in `:root` in `styles.css`:

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#10191c` | Page background |
| `--panel` / `--panel-raised` | `#172327` / `#1c2a2e` | Card surfaces |
| `--line` | `#304146` | Borders and rules |
| `--paper` | `#f1f1e9` | Primary text |
| `--muted` | `#94a4a2` | Secondary text |
| `--lime` | `#d5f169` | Accent — live states, team Voss, focus highlights |
| `--red` | `#ff735f` | Alerts, team Navarro |
| `--cyan` | `#72c9bc` | Sector three |

Type is a system stack throughout: a condensed display face for headings (`Arial Narrow` / `Impact`), a system sans for body, and a monospace for all numerics and labels. **No web fonts are requested**, so the page renders instantly and works offline.

---

## Accessibility and responsiveness

- Turn markers are `role="button"`, focusable, and respond to Enter and Space.
- Chart tabs use `role="tablist"` with correct `aria-selected` state.
- Toasts announce through an `aria-live="polite"` status region.
- Car markers carry per-driver `aria-label`s and SVG `<title>` tooltips.
- `prefers-reduced-motion: reduce` disables transitions, animations and smooth scrolling globally.

---

## Data and asset credits

**All racing data in this project is fictional.** Apex GP is not a real team. The drivers, teams, lap times, gaps, tyre ages, weather readings and race control events are invented for the demo. Do not cite anything here as real Formula 1 telemetry.

Track artwork is real and credited:

- **Spa-Francorchamps** — `assets/spa-francorchamps-map.svg` is derived from
  [2022 F1 CourseLayout Belgium](https://commons.wikimedia.org/wiki/File:2022_F1_CourseLayout_Belgium.svg)
  by ごひょううべこ, licensed **CC BY-SA 4.0**. The attribution line under the map is part of the licence and must stay in place if you redistribute this project.
- **All other circuits** — official 2026 diagrams served by Formula1.com and displayed with their original markings. The traced racing lines in `circuit-routes.js` are derived from those diagrams and used here for demonstration.

Formula 1, the FIA and the circuit names used in this project are trademarks of their respective owners. This is an unofficial, non-commercial project with no affiliation.

---

## Contributing

Small, focused pull requests are welcome — a corner note, a new circuit, a bug in the lap maths.

Run the checks before you push:

```bash
node --test               # 20 tests over the race model
node tools-lint.cjs        # markup, data and CSS consistency
node verify-calendar.cjs   # circuits-data.js against the published 2026 calendar
```

None of these is a style linter, and none of them needs an install step: there is no `package.json`, and they run on stock node.

### Tests

`node --test` covers the race model only, and that is on purpose. `race-state.js` is pure, so the tests need no browser and no DOM shim — the full 24-circuit sweep, including every lap from the grid to the chequered flag, finishes in milliseconds.

Nine of them are named after bugs that actually shipped. They came from failures caught by hand-written browser scripts that were then thrown away, so the assertions live in the suite now:

| Test | What it prevents |
| --- | --- |
| repeated float addition cannot lose the final lap | `elapsed += lapSeconds` drifting, so Melbourne could never reach the flag |
| the lap counter cannot go negative | a frame-timestamp reset reading `LAP -1` |
| a backgrounded tab cannot fast-forward the race | one huge frame delta skipping laps |
| the clock never shows more than the cap | `78:39` on a 78:38 race |
| a circuit switch resets the race completely | the pit stop latching as already-made |
| the chart plots only laps actually run | two invented points on the grid |
| chart titles reflect the window | "last 2 laps" when one had been run |
| stint bars never go negative or past 100% | a bar overflowing its track |
| pit window is always inside the race and never before lap 2 | `Math.round(laps * 0.45)` opening the box before the start or past the flag |

Two of them assert their own preconditions — the float-drift test proves the naive sum really does lose the final lap for that circuit before trusting the epsilon, and the circuit-switch test proves the leaked elapsed time really would have passed the next circuit's flag. If the data changes and a precondition stops holding, the test fails loudly instead of quietly passing.

A note on writing tests here: drive the race through `runTo` / `runToLap`, which are iteration-bounded. An unbounded `while (state.lap < circuit.laps)` hangs the whole run if the flag becomes unreachable — which is exactly the bug several of these tests exist to catch, so a hang hides the failure it was written to surface.

### Static checks

`tools-lint.cjs` and `verify-calendar.cjs` catch the things that have actually broken this project:

- **`$('#some-id')` in `script.js` with no matching id in `index.html`.** Renaming an id in the markup silently breaks the code that writes to it.
- **A function that is declared but never called.** This is what an edit that swallows the tail of a function looks like: `node --check` passes, because the orphaned code is still valid JavaScript, it just references variables that are no longer in scope.
- **A compound class the stylesheet does not define.** The strategy dot gets `hard-compound` at the pit stop; without a matching rule the dot keeps the previous colour and the label stops matching the swatch.
- **An assignment to a race field in `script.js`.** Reading `raceState.lap` is fine; writing it, or reintroducing a loose `lap`, fails the build. See "Where the race state lives" above.
- **A call to `RACE_STATE.something()` that the engine does not export**, which is the typo that would otherwise only show up as `undefined is not a function` in the browser.
- **Slug drift** between `circuits-data.js` and `circuit-routes.js`, and duplicate ids in the markup.
- **Implausible circuit data** — a track temperature below the air temperature, a lap count outside the real 2026 range, a pit window that leaves no second stint.
- **A date that names the wrong weekday.** The weekday is recomputed and compared to the copy, which is how "Sunday, 26 September" got caught when Azerbaijan 2026 is a Saturday.

A few things worth knowing before you edit:

- **`styles.css` is minified.** It's a single flattened file. Reformat it in your editor before making structural changes, and don't commit a whitespace-only reformat on its own — it makes reviews impossible.
- **On Windows, don't read-modify-write these files through PowerShell.** `index.html`, `script.js` and `circuits-data.js` contain typographic characters (`·`, `—`, `→`, `°`, `☁`). `Get-Content` and `>` redirection use the system codepage, so a round trip through either transcodes the file to mojibake — the tab title then reads `Apex GP <3-byte garbage> Belgian grand prix` instead of `Apex GP — Belgian grand prix`, and every `·` in the page doubles. No ASCII moves, so it is invisible in a diff. `tools-lint.cjs` fails on the pattern, but the real fix is to use a UTF-8-preserving editor, or do the edit in one UTF-8 process:
  ```bash
  node -e "const fs=require('fs');const p='script.js';const s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,s.replace('old','new'),'utf8')"
  ```
- **Wrapping text in a `<span>` can change layout.** Several containers are flex with `justify-content:space-between`, so each new element becomes a new flex child and the existing ones get spread apart. This is what turned the weather card into `SPA   , RIGHT NOW   LOCAL`. Give new wrappers a class and style them explicitly.
- **Toggling `hidden` needs the global rule.** `[hidden]{display:none!important}` is in the reset for a reason: a component rule like `.strategy-note small{display:block}` outranks a bare `[hidden]`, so the attribute silently does nothing.
- **The race clock is driven by real time.** `elapsedSeconds` accumulates from `requestAnimationFrame` deltas, clamped to 0–100ms per frame so a backgrounded tab cannot fast-forward the race and a timestamp reset cannot produce a negative lap. Lap maths depends on that clamp.
- **`ADVANCE LAP` snaps rather than accumulates.** It sets `elapsedSeconds = (lap + 1) * lapSeconds` instead of `+= lapSeconds`. Repeated float addition drifts: at Melbourne's 80.1s lap, 58 additions land on 57.9999 and the race never reaches the flag. Don't "simplify" this back to `+=`.
- **A new circuit needs two entries.** `circuits-data.js` for metadata, `circuit-routes.js` for the racing line. A missing route makes the selector fall back to Spa with a toast. Keep the slug lists in step — a slug in one file and not the other is a silent failure.
- **The sector table has to stay honest.** The purple cell must be the faster of the two rows, and the "best in sector" footer must name whoever actually holds it. The margins live in `winnerMargins` in `script.js`.
- **The time cap is derived, not configured.** It is `laps × lapBase`, so the clock and the lap counter always reach zero together. Don't reintroduce a fixed cap.
- **`applyCircuitContext` has a required order.** It sets `totalLaps`/`lapSeconds`, then writes the sector table, then resets the race, and only then calls `renderPitPlan()` and `updateSectorInsight()`. Both of those call `updateRaceReadouts()`, which reads the clock — run them before the reset and the new circuit's lap pace gets scored against the previous circuit's elapsed time.
- **Preserve the CC BY-SA attribution** on the Spa map if you touch that panel.

---

## License

The code is released under the [MIT License](LICENSE) — see `LICENSE` for the full text.

The MIT license covers the code in this repository. It does **not** cover the third-party assets in `assets/`, which keep their own terms: the Spa diagram is CC BY-SA 4.0 and must retain its attribution, and the official Formula1.com diagrams are served hot from their CDN and are trademarks of Formula One Licensing BV.
