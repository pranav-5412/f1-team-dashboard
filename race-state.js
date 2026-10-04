// The race model, with no DOM and no timers.
//
// Everything here is a pure function of a circuit and a state object, so the
// browser and the node tests exercise exactly the same arithmetic. That is the
// point of the file: the race used to be ten module-level `let` bindings mutated
// from a dozen places, which is how a circuit switch ended up scoring the
// previous circuit's elapsed time against the new circuit's lap pace.
//
// Two rules this file exists to enforce:
//   1. `reset()` is the only thing that puts the race back on the grid.
//   2. `elapsed`, `lap`, `stopCompleted` and `raceFinished` are only ever
//      written by reset(), advanceLap(), tick() and sync(). Nothing reaches in
//      and assigns them. tools-lint.cjs fails the build if script.js tries.

// Spa's published splits (32.441 / 41.208 / 33.579) are the reference every
// other circuit is scaled from.
const SPA_LAP_SECONDS = 107.228;
const SPA_SECTOR_SPLITS = [32.441, 41.208, 33.579];
const TEAM_PACE_GAP = 0.363;

// The race runs from the grid: lap 0 through to the circuit's final lap.
const START_LAP = 0;

// Repeated float addition drifts. At Melbourne's 80.1s lap, 58 additions of
// lapSeconds land on 57.9999 and the counter never reaches the flag. The lap
// boundary is derived instead of accumulated, and this epsilon covers the same
// drift when the animation loop sums deltas.
const LAP_EPSILON = 1e-9;

// A backgrounded tab produces one enormous timestamp delta, which would
// fast-forward the race through several laps at once.
const FRAME_STEP_CAP = 0.1;

const CHART_WINDOW = 10;

// Abstract "cost" scale, not seconds: the shape of the data survives a circuit
// change even though the absolute lap times do not.
const PACE_SHAPE = [66, 59, 62, 45, 50, 37, 43, 27, 32, 21, 34, 26];
const NAVARRO_SHAPE = [78, 73, 70, 77, 57, 61, 53, 55, 37, 42, 47, 39];
const POSITION_SHAPE = [25, 25, 42, 42, 42, 42, 42, 42, 42, 42, 40, 42];
const NAVARRO_POSITION_SHAPE = [58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 56, 58];

// Each driver runs a one-stop plan: an opening compound, then a second.
const TYRE_PLANS = {
  mara: { first: 'medium', second: 'hard', labels: { medium: 'MEDIUM', hard: 'HARD' }, chips: { medium: 'MED', hard: 'HARD', soft: 'SOFT' } },
  eli: { first: 'soft', second: 'medium', labels: { soft: 'SOFT', medium: 'MEDIUM' }, chips: { soft: 'SOFT', medium: 'MED', hard: 'HARD' } },
};

const RACE_STATE = (() => {
  // A one-stop race: pit around 45% of the way through, then run to the flag.
  function pitWindowFor(circuit) {
    const start = Math.max(2, Math.round(circuit.laps * 0.45));
    return { start, end: Math.min(circuit.laps, start + 2) };
  }

  // A fresh state, with the race fields deliberately absent until the first
  // reset. `pitPlanActive` is a user choice, not part of the race, so it is
  // carried in rather than forced back to true on every circuit change.
  function create() {
    return { pitPlanActive: true, lastDisplayedSecond: -1, lastFrameTime: null };
  }

  // The single reset path. Every field that describes "where we are in this
  // race" is written here and nowhere else.
  function reset(state, circuit) {
    const window = pitWindowFor(circuit);
    state.circuit = circuit;
    state.totalLaps = circuit.laps;
    state.lapSeconds = circuit.lapBase;
    state.pitWindowStart = window.start;
    state.pitWindowEnd = window.end;
    state.elapsed = 0;
    state.lap = START_LAP;
    state.maraAge = 0;
    state.eliAge = 0;
    state.stopCompleted = false;
    state.raceFinished = false;
    state.lastDisplayedSecond = -1;
    // lastFrameTime is deliberately left alone: zeroing it would make the next
    // frame's delta enormous, or negative, depending on the clock's origin.
    return state;
  }

  // Recompute lap, stop and tyre ages from elapsed time. Returns what changed
  // so the caller can fire toasts and redraw without the engine knowing about
  // either.
  function sync(state) {
    const previousLap = state.lap;
    state.lap = Math.min(state.totalLaps, Math.floor(state.elapsed / state.lapSeconds + LAP_EPSILON));

    let stoppedNow = false;
    // The stop happens on the pit window's opening lap; tyre age resets there.
    if (state.pitPlanActive && !state.stopCompleted && state.lap >= state.pitWindowStart) {
      state.stopCompleted = true;
      stoppedNow = true;
    }
    const onStintTwo = state.pitPlanActive && state.stopCompleted;
    const age = onStintTwo ? state.lap - state.pitWindowStart : state.lap;
    state.maraAge = age;
    state.eliAge = age;

    const finished = state.lap >= state.totalLaps;
    if (finished) state.raceFinished = true;

    state.lastDisplayedSecond = Math.floor(state.elapsed);
    return { previousLap, lap: state.lap, stoppedNow, finished, lapChanged: state.lap !== previousLap };
  }

  // ADVANCE LAP. Snap to the exact lap boundary rather than adding lapSeconds.
  function advanceLap(state) {
    if (state.raceFinished || state.lap >= state.totalLaps) return null;
    state.elapsed = (state.lap + 1) * state.lapSeconds;
    return sync(state);
  }

  // One animation frame.
  function tick(state, deltaSeconds) {
    if (state.raceFinished) return null;
    // Clamp at zero so a timestamp reset can never drive the lap counter
    // negative, and cap the step so a backgrounded tab does not fast-forward.
    const delta = Math.max(0, Math.min(deltaSeconds, FRAME_STEP_CAP));
    state.elapsed = Math.max(0, state.elapsed + delta);
    if (Math.floor(state.elapsed) === state.lastDisplayedSecond) return null;
    return sync(state);
  }

  // One animation frame. The frame clock lives here too, so nothing outside
  // this file assigns a race field.
  //
  // `lastFrameTime` starts as null rather than 0. A 0 sentinel is falsy, so a
  // frame whose timestamp is 0 would be treated as "no frame yet" and re-seed
  // the clock, silently zeroing the delta. requestAnimationFrame never returns
  // 0 in a browser, but the tests do drive it directly and the sentinel should
  // not depend on the caller.
  function tickFrame(state, timestamp) {
    if (state.lastFrameTime === null) state.lastFrameTime = timestamp;
    // Clamp at zero so a timestamp reset can never drive the lap counter
    // negative, and cap the step so a backgrounded tab does not fast-forward.
    const delta = Math.max(0, Math.min((timestamp - state.lastFrameTime) / 1000, FRAME_STEP_CAP));
    state.lastFrameTime = timestamp;
    return tick(state, delta);
  }

  // Plan B means no stop: the opening stint simply runs to the flag.
  function setPitPlanActive(state, active) {
    state.pitPlanActive = active;
    if (!active) state.stopCompleted = false;
    return state;
  }

  function onStintTwo(state) {
    return state.pitPlanActive && state.stopCompleted;
  }

  // --- selectors: everything the desk renders --------------------------

  function progressPercent(state) {
    return (state.lap / state.totalLaps) * 100;
  }

  // The cap is the full race distance, so the countdown and the lap counter
  // reach zero together on every circuit.
  function timeCapSeconds(state) {
    return state.totalLaps * state.lapSeconds;
  }

  function clockLabel(state) {
    const raceSeconds = timeCapSeconds(state);
    const capLabel = `${Math.floor(raceSeconds / 60)}:${String(Math.floor(raceSeconds % 60)).padStart(2, '0')}`;
    const finished = state.lap >= state.totalLaps;
    if (finished) return `${capLabel} RACE COMPLETE`;
    const timeLeft = Math.max(0, raceSeconds - state.elapsed);
    // Never show more than the cap: a rounding overshoot would read 78:39 on a
    // 78:38 race.
    const safeLeft = Math.min(timeLeft, raceSeconds);
    const safeMinutes = Math.floor(safeLeft / 60);
    const safeSeconds = Math.floor(safeLeft % 60);
    return `${String(safeMinutes).padStart(2, '0')}:${String(safeSeconds).padStart(2, '0')} TO ${capLabel} CAP`;
  }

  function lapLabel(state) {
    return `LAP ${state.lap} / ${state.totalLaps}`;
  }

  function lapBadgeFor(lap) {
    return lap === START_LAP ? 'FORMATION' : `LAP ${lap}`;
  }

  function tyreAgeLabel(age) {
    return `${age} LAP${age === 1 ? '' : 'S'}`;
  }

  function compoundFor(state, key) {
    const plan = TYRE_PLANS[key];
    return onStintTwo(state) ? plan.second : plan.first;
  }

  function compoundLabel(state, key) {
    return TYRE_PLANS[key].labels[compoundFor(state, key)];
  }

  // The strategy dot, the driver card chip and the stint bars all follow the
  // compound, so the colour still says "soft" after the stop onto mediums.
  function chipCode(state, key) {
    return TYRE_PLANS[key].chips[compoundFor(state, key)];
  }

  function compoundClassName(state, key) {
    return `${compoundFor(state, key)}-compound`;
  }

  function tyreChipClassName(state, key) {
    return `tyre-chip ${compoundFor(state, key)}`;
  }

  // The two stint bars. A share of 0 collapses the bar: a 0%-wide element still
  // renders its horizontal padding, which reads as a stray colour block.
  function stintShares(state) {
    const onSecond = onStintTwo(state);
    const firstLength = state.pitPlanActive
      ? (onSecond ? state.pitWindowStart : Math.min(state.lap, state.pitWindowStart))
      : state.lap;
    const secondLength = onSecond ? state.lap - state.pitWindowStart : 0;
    return {
      onSecond,
      firstLength,
      secondLength,
      firstPercent: Math.max(0, (firstLength / state.totalLaps) * 100),
      secondPercent: Math.max(0, (secondLength / state.totalLaps) * 100),
    };
  }

  function pitWindowLabel(state) {
    return state.pitPlanActive
      ? `Box window: laps ${state.pitWindowStart}–${state.pitWindowEnd}`
      : 'Running the opening tyre to the flag';
  }

  // Plan A and Plan B are two separate elements toggled with `hidden`, so
  // neither can destroy the node the other depends on.
  function planNoteHidden(state, plan) {
    return state.pitPlanActive ? plan !== 'a' : plan !== 'b';
  }

  // The laps actually completed, most recent last. Empty on the grid: the chart
  // must not invent points for laps that have not been run.
  function chartWindow(state) {
    const end = Math.max(0, state.lap);
    const start = Math.max(1, end - CHART_WINDOW + 1);
    return Array.from({ length: end - start + 1 }, (unused, i) => start + i);
  }

  function sliceShape(shape, labels) {
    return labels.map((lapNumber) => shape[(lapNumber - 1) % shape.length]);
  }

  function lapNoun(count) {
    return `${count} lap${count === 1 ? '' : 's'}`;
  }

  function chartTitleFor(mode, state) {
    const laps = chartWindow(state);
    const noData = laps.length === 0;
    if (mode === 'position') return noData ? 'Race position · on the grid' : `Race position · last ${lapNoun(laps.length)}`;
    if (mode === 'sector') return noData ? 'Sector pace · no laps yet' : `Sector pace · lap ${state.lap}`;
    return noData ? 'Lap time · no laps yet' : `Lap time · last ${lapNoun(laps.length)}`;
  }

  // The plot for one chart tab: which laps, and both series' values. `a` is
  // Voss, `b` is Navarro. Sector pace is fixed-width because it is always the
  // three sectors of the current lap rather than a run of laps.
  function chartSeries(mode, state) {
    if (mode === 'sector') return { labels: ['S1', 'S2', 'S3'], a: [55, 49, 31], b: [61, 44, 60] };
    const laps = chartWindow(state);
    const shapes = mode === 'position'
      ? [POSITION_SHAPE, NAVARRO_POSITION_SHAPE]
      : [PACE_SHAPE, NAVARRO_SHAPE];
    return {
      labels: laps.map(String),
      a: sliceShape(shapes[0], laps),
      b: sliceShape(shapes[1], laps),
    };
  }

  function chartIsEmpty(mode, state) {
    return mode !== 'sector' && chartWindow(state).length === 0;
  }

  function sectorSplitsFor(baseLapSeconds) {
    const scale = baseLapSeconds / SPA_LAP_SECONDS;
    return SPA_SECTOR_SPLITS.map((value) => value * scale);
  }

  function formatLapTime(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const totalMs = Math.round(safe * 1000);
    const milliseconds = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const seconds = totalSec % 60;
    const minutes = Math.floor(totalSec / 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }

  return {
    create,
    reset,
    sync,
    advanceLap,
    tickFrame,
    setPitPlanActive,
    onStintTwo,
    pitWindowFor,
    progressPercent,
    timeCapSeconds,
    clockLabel,
    lapLabel,
    lapBadgeFor,
    tyreAgeLabel,
    compoundFor,
    compoundLabel,
    chipCode,
    compoundClassName,
    tyreChipClassName,
    stintShares,
    pitWindowLabel,
    planNoteHidden,
    chartWindow,
    chartTitleFor,
    chartSeries,
    chartIsEmpty,
    lapNoun,
    sectorSplitsFor,
    formatLapTime,
  };
})();
