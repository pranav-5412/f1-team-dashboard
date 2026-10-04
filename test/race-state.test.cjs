// Race-model tests. Stock node, no dependencies:
//
//   node --test
//
// Everything under test is pure. race-state.js has no DOM and no timers, so the
// numbers asserted here are the same numbers script.js renders, and the whole
// 24-circuit sweep runs in a fraction of a second with no browser.
//
// Each test is named after the bug it prevents. The regression list in issue #5
// came from failures that shipped and were caught by hand-written throwaway
// browser scripts that were then deleted; those assertions live here now.
//
// The file is UTF-8: the middot in the chart titles and the arrow in the sector
// names are part of the strings being asserted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8');

// The project ships plain classic scripts rather than ES modules. Load them the
// way index.html does: evaluate the sources in order in one shared context, then
// read the bindings off the result.
//
// A top-level `const` does not become a property of `window` in a browser
// either -- it lives in the global lexical scope, visible to the next <script>
// but not as `window.X`. So the files are concatenated rather than evaluated
// separately, and the trailing expression is what hands the bindings back.
// node:vm is built in, so this still needs no dependency.
function loadGlobals(files, names) {
  const source = `${files.map((file) => read(file)).join('\n;\n')}\n;({ ${names.join(', ')} });`;
  const out = vm.runInNewContext(source, {}, { filename: files.join(' + ') });
  for (const name of names) assert.ok(out[name], `${files.join(', ')} did not declare ${name}`);
  return out;
}

const { RACE_STATE, OFFICIAL_F1_CIRCUITS } = loadGlobals(
  ['race-state.js', 'circuits-data.js'],
  ['RACE_STATE', 'OFFICIAL_F1_CIRCUITS'],
);

// Values built inside the vm context carry that context's prototypes, so
// assert.deepStrictEqual would fail comparing an identical array across realms.
// Re-wrap through JSON to compare contents.
const plain = (value) => JSON.parse(JSON.stringify(value));

// The live Spa entry is a view of the `belgium` round, not a calendar round of
// its own, so it is exercised alongside the 23 official circuits. This mirrors
// the liveSpaMap literal in script.js.
const LIVE_SPA = {
  slug: 'live-spa',
  name: 'Belgium · Spa-Francorchamps',
  shortName: 'Spa-Francorchamps',
  length: '7.004km',
  laps: 44,
  date: 'Sunday, 19 July',
  country: 'Belgium',
  lapBase: 107.228,
  sectors: ['La Source → Raidillon', 'Les Combes → Fagnes', 'Stavelot → Bus Stop'],
  corner: 'Eau Rouge',
  venue: 'Spa',
  weather: { air: 18, track: 26, rain: 30, wind: 'NW 8 km/h', asphalt: 'DRY · COOLING' },
};

const ALL_CIRCUITS = [LIVE_SPA, ...OFFICIAL_F1_CIRCUITS];

// Run a circuit from the grid to the chequered flag, counting the clicks.
function runToFlag(circuit) {
  const state = RACE_STATE.create();
  RACE_STATE.reset(state, circuit);
  const clicks = runTo(state);
  return { state, clicks };
}

// Advance a state to its flag, with a hard iteration bound.
//
// The bound is the point: an unbounded `while (state.lap < circuit.laps)` hangs
// the whole run if the engine can never reach the flag, which is exactly the
// bug several of these tests exist to catch. Mutation testing found that the
// suite stopped reporting and started timing out instead. A cap turns a hang
// into a legible assertion failure.
function runTo(state, label = 'race') {
  const limit = state.totalLaps + 100;
  let clicks = 0;
  while (state.lap < state.totalLaps) {
    if (clicks >= limit) {
      assert.fail(
        `${label}: still on lap ${state.lap}/${state.totalLaps} after ${clicks} advances; `
        + `the flag is unreachable (elapsed ${state.elapsed}, lapSeconds ${state.lapSeconds})`,
      );
    }
    RACE_STATE.advanceLap(state);
    clicks += 1;
  }
  return clicks;
}

// Advance a state to a given lap number, bounded the same way.
function runToLap(state, target, label = 'race') {
  const limit = target + 100;
  let steps = 0;
  while (state.lap < target) {
    if (steps >= limit) {
      assert.fail(`${label}: never reached lap ${target}, stuck on lap ${state.lap}`);
    }
    RACE_STATE.advanceLap(state);
    steps += 1;
  }
  return steps;
}

// ---------------------------------------------------------------------------
// The race sweep: every circuit, grid to flag.
// ---------------------------------------------------------------------------

test('race sweep: every circuit reaches the flag in exactly its published lap count', () => {
  assert.equal(OFFICIAL_F1_CIRCUITS.length, 23, 'expected 23 calendar rounds');
  assert.equal(ALL_CIRCUITS.length, 24, 'expected 24 selectable entries');

  for (const circuit of ALL_CIRCUITS) {
    const { state, clicks } = runToFlag(circuit);
    assert.equal(state.lap, circuit.laps, `${circuit.slug}: final lap`);
    assert.equal(clicks, circuit.laps, `${circuit.slug}: one click per lap`);
    assert.equal(state.raceFinished, true, `${circuit.slug}: finished`);
    assert.equal(RACE_STATE.progressPercent(state), 100, `${circuit.slug}: progress 100%`);
    assert.match(RACE_STATE.clockLabel(state), /RACE COMPLETE$/, `${circuit.slug}: clock`);
    const { firstPercent, secondPercent } = RACE_STATE.stintShares(state);
    assert.ok(
      Math.abs(firstPercent + secondPercent - 100) < 1e-9,
      `${circuit.slug}: stints total 100%, got ${firstPercent + secondPercent}`,
    );
  }
});

test('race sweep: the time cap is the full race distance on every circuit', () => {
  for (const circuit of ALL_CIRCUITS) {
    const { state } = runToFlag(circuit);
    const cap = RACE_STATE.timeCapSeconds(state);
    assert.equal(cap, circuit.laps * circuit.lapBase, `${circuit.slug}: cap`);
    assert.match(RACE_STATE.clockLabel(state), /RACE COMPLETE$/, `${circuit.slug}: reads complete`);
  }
});

test('grid state: a fresh circuit sits on lap 0 with nothing run', () => {
  for (const circuit of ALL_CIRCUITS) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);

    assert.equal(state.lap, 0, `${circuit.slug}: lap 0`);
    assert.equal(state.maraAge, 0, `${circuit.slug}: Voss 0 tyre laps`);
    assert.equal(state.eliAge, 0, `${circuit.slug}: Navarro 0 tyre laps`);
    assert.equal(RACE_STATE.progressPercent(state), 0, `${circuit.slug}: 0% progress`);
    assert.equal(state.stopCompleted, false, `${circuit.slug}: no stop yet`);
    assert.equal(state.raceFinished, false, `${circuit.slug}: not finished`);

    const { firstPercent, secondPercent } = RACE_STATE.stintShares(state);
    assert.equal(firstPercent, 0, `${circuit.slug}: first stint collapsed`);
    assert.equal(secondPercent, 0, `${circuit.slug}: second stint collapsed`);
    assert.equal(RACE_STATE.tyreAgeLabel(state.maraAge), '0 LAPS', `${circuit.slug}: age label`);
    assert.equal(RACE_STATE.lapBadgeFor(state.lap), 'FORMATION', `${circuit.slug}: grid badge`);

    // The chart must be empty rather than inventing two points on the grid.
    assert.equal(plain(RACE_STATE.chartWindow(state)).length, 0, `${circuit.slug}: no chart points`);
    assert.equal(RACE_STATE.chartIsEmpty('pace', state), true, `${circuit.slug}: pace empty`);
    assert.equal(RACE_STATE.chartSeries('pace', state).a.length, 0, `${circuit.slug}: no series`);
    assert.equal(RACE_STATE.chartTitleFor('pace', state), 'Lap time · no laps yet', `${circuit.slug}: pace title`);
    assert.equal(RACE_STATE.chartTitleFor('position', state), 'Race position · on the grid', `${circuit.slug}: position title`);
    assert.equal(RACE_STATE.chartTitleFor('sector', state), 'Sector pace · no laps yet', `${circuit.slug}: sector title`);

    // Both plan notes must never be visible at the same time.
    assert.equal(RACE_STATE.planNoteHidden(state, 'a'), false, `${circuit.slug}: plan A visible`);
    assert.equal(RACE_STATE.planNoteHidden(state, 'b'), true, `${circuit.slug}: plan B hidden`);
  }
});

test('pit stop: tyre age resets and the compound follows, stints still total 100%', () => {
  for (const circuit of ALL_CIRCUITS) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);
    const window = RACE_STATE.pitWindowFor(circuit);

    // Opening compound before the stop.
    assert.equal(RACE_STATE.compoundFor(state, 'mara'), 'medium', `${circuit.slug}: Voss opens on mediums`);
    assert.equal(RACE_STATE.compoundFor(state, 'eli'), 'soft', `${circuit.slug}: Navarro opens on softs`);
    assert.equal(RACE_STATE.compoundClassName(state, 'mara'), 'medium-compound', `${circuit.slug}: dot class`);

    // Exactly on the pit window's opening lap the stop happens and the age
    // resets to zero.
    runToLap(state, window.start, `${circuit.slug} to the pit window`);
    assert.equal(state.stopCompleted, true, `${circuit.slug}: stopped on lap ${window.start}`);
    assert.equal(state.maraAge, 0, `${circuit.slug}: Voss age reset`);
    assert.equal(state.eliAge, 0, `${circuit.slug}: Navarro age reset`);

    // One lap later the ages are on the new compound and the colours moved.
    RACE_STATE.advanceLap(state);
    assert.equal(state.maraAge, 1, `${circuit.slug}: Voss age 1`);
    assert.equal(RACE_STATE.tyreAgeLabel(state.maraAge), '1 LAP', `${circuit.slug}: singular noun`);
    assert.equal(RACE_STATE.compoundFor(state, 'mara'), 'hard', `${circuit.slug}: Voss switches to hards`);
    assert.equal(RACE_STATE.compoundFor(state, 'eli'), 'medium', `${circuit.slug}: Navarro switches to mediums`);
    assert.equal(RACE_STATE.compoundClassName(state, 'eli'), 'medium-compound', `${circuit.slug}: dot follows compound`);
    assert.equal(RACE_STATE.compoundLabel(state, 'eli'), 'MEDIUM', `${circuit.slug}: chip label`);
    assert.equal(RACE_STATE.chipCode(state, 'eli'), 'MED', `${circuit.slug}: card chip code`);
    assert.equal(RACE_STATE.tyreChipClassName(state, 'eli'), 'tyre-chip medium', `${circuit.slug}: card chip class`);

    // Run out the race: the stints must still add up.
    runTo(state, `${circuit.slug} to the flag`);
    const { firstPercent, secondPercent, firstLength, secondLength } = RACE_STATE.stintShares(state);
    assert.equal(firstLength, window.start, `${circuit.slug}: first stint length`);
    assert.equal(firstLength + secondLength, circuit.laps, `${circuit.slug}: stints cover the race`);
    assert.ok(Math.abs(firstPercent + secondPercent - 100) < 1e-9, `${circuit.slug}: stints total 100%`);
  }
});

test('plan B: no stop, so the opening tyre runs the whole race', () => {
  for (const circuit of [LIVE_SPA, OFFICIAL_F1_CIRCUITS.find((c) => c.slug === 'monaco')]) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);
    const window = RACE_STATE.pitWindowFor(circuit);

    // Plan A first: the window is quoted with both bounds.
    assert.equal(RACE_STATE.pitWindowLabel(state), `Box window: laps ${window.start}–${window.end}`, `${circuit.slug}: plan A copy`);
    assert.equal(RACE_STATE.planNoteHidden(state, 'a'), false, `${circuit.slug}: plan A visible`);
    assert.equal(RACE_STATE.planNoteHidden(state, 'b'), true, `${circuit.slug}: plan B hidden`);

    // Now drop to plan B. The choice is a user preference and deliberately
    // survives a reset, so re-enabling plan A is an explicit act.
    RACE_STATE.setPitPlanActive(state, false);
    assert.equal(RACE_STATE.planNoteHidden(state, 'a'), true, `${circuit.slug}: plan A hidden`);
    assert.equal(RACE_STATE.planNoteHidden(state, 'b'), false, `${circuit.slug}: plan B visible`);
    assert.equal(RACE_STATE.pitWindowLabel(state), 'Running the opening tyre to the flag', `${circuit.slug}: window copy`);

    runTo(state, `${circuit.slug} plan B to the flag`);
    assert.equal(state.stopCompleted, false, `${circuit.slug}: never stopped`);
    const { firstPercent, secondPercent, firstLength } = RACE_STATE.stintShares(state);
    assert.equal(firstLength, circuit.laps, `${circuit.slug}: one stint, full distance`);
    assert.equal(secondPercent, 0, `${circuit.slug}: no second stint`);
    assert.ok(Math.abs(firstPercent - 100) < 1e-9, `${circuit.slug}: first stint is 100%`);

    // Switching back to plan A must reopen the window and clear the stop.
    RACE_STATE.setPitPlanActive(state, true);
    RACE_STATE.reset(state, circuit);
    assert.equal(state.stopCompleted, false, `${circuit.slug}: stop cleared on reset`);
    assert.equal(RACE_STATE.pitWindowLabel(state), `Box window: laps ${window.start}–${window.end}`, `${circuit.slug}: plan A copy returns`);
    assert.equal(RACE_STATE.planNoteHidden(state, 'a'), false, `${circuit.slug}: plan A visible again`);
  }
});

// ---------------------------------------------------------------------------
// Named regressions. Each of these shipped as a bug.
// ---------------------------------------------------------------------------

test('regression: repeated float addition cannot lose the final lap', () => {
  // The bug: elapsedSeconds += lapSeconds. At Melbourne's 80.1s lap, 58
  // additions land a hair under 58.0 and the counter never reaches the flag.
  const melbourne = OFFICIAL_F1_CIRCUITS.find((c) => c.slug === 'australia');

  // Establish that the risk is real for this circuit, scored the way sync()
  // scores it but without the epsilon.
  let naive = 0;
  for (let i = 0; i < melbourne.laps; i += 1) naive += melbourne.lapBase;
  const scoreWithoutEpsilon = (elapsed) => Math.floor(elapsed / melbourne.lapBase);
  assert.ok(
    scoreWithoutEpsilon(naive) < melbourne.laps,
    'the naive sum loses the final lap when scored without the epsilon, otherwise this test proves nothing',
  );
  // ...and that the epsilon is what recovers it.
  assert.equal(
    Math.floor(naive / melbourne.lapBase + 1e-9),
    melbourne.laps,
    'the epsilon is load-bearing',
  );

  // The stronger guarantee: the clock is snapped to an exact lap boundary on
  // every advance, so no error accumulates at all and the epsilon is only a
  // backstop for the animation path. After N advances elapsed is exactly
  // N * lapSeconds -- not approximately.
  for (const circuit of ALL_CIRCUITS) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);
    for (let lap = 0; lap < circuit.laps; lap += 1) {
      RACE_STATE.advanceLap(state);
      assert.equal(
        state.elapsed,
        state.lap * state.lapSeconds,
        `${circuit.slug} lap ${state.lap}: elapsed must be an exact lap multiple`,
      );
      assert.equal(state.lap, lap + 1, `${circuit.slug}: advanced one lap`);
    }
    assert.equal(state.lap, circuit.laps, `${circuit.slug}: engine still reaches the flag`);
  }
});

test('regression: the lap counter cannot go negative on a timestamp reset', () => {
  // A frame timestamp can move backwards: a clock origin change, or a
  // suspend/resume. Two guards exist -- tickFrame() clamps the delta and tick()
  // floors elapsed at zero -- so this asserts the observable result across a
  // deliberately hostile sequence of stamps.
  const state = RACE_STATE.create();
  RACE_STATE.reset(state, LIVE_SPA);
  RACE_STATE.advanceLap(state);
  const before = state.elapsed;

  for (const stamp of [1000, 0, -5000, 500, -1, 512, -10_000, 600]) {
    RACE_STATE.tickFrame(state, stamp);
    assert.ok(state.elapsed >= 0, `elapsed went negative after timestamp ${stamp}: ${state.elapsed}`);
    assert.ok(state.lap >= 0, `lap went negative after timestamp ${stamp}: ${state.lap}`);
    assert.ok(state.lap <= state.totalLaps, `lap overshot the flag after timestamp ${stamp}`);
  }
  // Repeated backwards frames must not eat into the race distance either.
  assert.ok(state.elapsed >= before, `elapsed shrank from ${before} to ${state.elapsed}`);
});

test('regression: a backgrounded tab cannot fast-forward the race', () => {
  // One enormous frame delta after the tab is restored. FRAME_STEP_CAP bounds it
  // to 0.1s, so a minute-long gap must not complete a lap.
  //
  // Timestamps start well above zero on purpose. requestAnimationFrame never
  // returns 0, and a first stamp of 0 used to collide with the engine's
  // "no frame yet" sentinel: lastFrameTime was set to 0, which is falsy, so the
  // next frame re-seeded it and the delta came out as zero. That made this test
  // assert nothing at all -- it passed with the step cap deleted.
  const state = RACE_STATE.create();
  RACE_STATE.reset(state, LIVE_SPA);
  RACE_STATE.tickFrame(state, 16);
  RACE_STATE.tickFrame(state, 60_016);
  assert.ok(state.elapsed > 0, 'the frame clock started');
  assert.ok(state.elapsed <= 0.1 + 1e-9, `elapsed should be capped to one step, got ${state.elapsed}`);
  assert.equal(state.lap, 0, 'a 60s gap must not complete a lap');

  // And the same holds with the sentinel path: a first stamp of exactly 0 must
  // still start the clock on the following frame.
  const zero = RACE_STATE.create();
  RACE_STATE.reset(zero, LIVE_SPA);
  RACE_STATE.tickFrame(zero, 0);
  RACE_STATE.tickFrame(zero, 500);
  assert.ok(zero.elapsed > 0, 'a first stamp of 0 must not wedge the frame clock');
});

test('regression: the clock never shows more than the cap', () => {
  // The bug: the countdown rendered a minute/second pair derived from an
  // unrounded difference, so a 78:38 race could read 78:39. Two things have to
  // hold at the boundary: the countdown must floor, never round up past the
  // remaining distance, and the flag must resolve to exactly RACE COMPLETE.
  for (const circuit of ALL_CIRCUITS) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);
    const cap = RACE_STATE.timeCapSeconds(state);
    const capLabel = `${Math.floor(cap / 60)}:${String(Math.floor(cap % 60)).padStart(2, '0')}`;

    // Walk right up to the flag in fractions of a lap, including the awkward
    // zone just before and just after the boundary.
    const step = state.lapSeconds / 11;
    for (let elapsed = 0; elapsed < cap + step; elapsed += step) {
      state.elapsed = elapsed;
      const change = RACE_STATE.sync(state);
      const label = RACE_STATE.clockLabel(state);
      if (change.finished) {
        assert.equal(label, `${capLabel} RACE COMPLETE`, `${circuit.slug}: flag label at the cap`);
        continue;
      }
      const [mm, ss] = label.split(' TO ')[0].split(':').map(Number);
      const shown = mm * 60 + ss;
      assert.ok(shown >= 0, `${circuit.slug}: countdown went negative`);
      assert.ok(
        shown <= cap + 1e-9,
        `${circuit.slug}: countdown ${label} exceeds cap ${capLabel} at elapsed ${elapsed}`,
      );
      // The countdown floors: it must never report more time than is left.
      assert.ok(
        shown <= Math.floor(Math.max(0, cap - elapsed)),
        `${circuit.slug}: countdown ${label} reports more than the ${Math.floor(Math.max(0, cap - elapsed))}s remaining`,
      );
    }

    // The exact flag instant is RACE COMPLETE, and one frame earlier it is not.
    state.elapsed = cap;
    assert.equal(RACE_STATE.sync(state).finished, true, `${circuit.slug}: cap completes the race`);
    assert.equal(RACE_STATE.clockLabel(state), `${capLabel} RACE COMPLETE`, `${circuit.slug}: exact cap label`);
    state.elapsed = cap - 1e-6;
    const justShort = RACE_STATE.sync(state);
    assert.equal(justShort.finished, false, `${circuit.slug}: a hair short is not the flag`);
    assert.match(RACE_STATE.clockLabel(state), / TO /, `${circuit.slug}: a hair short still counts down`);

    // Overshooting the cap in one jump -- which is what a badly clamped frame
    // delta would produce -- must still clamp the lap to the flag rather than
    // report lap 79 of a 78-lap race.
    for (const overshoot of [1.5, 3, 12.5]) {
      state.elapsed = cap * overshoot;
      RACE_STATE.sync(state);
      assert.equal(state.lap, circuit.laps, `${circuit.slug}: lap clamps at the flag when elapsed is ${overshoot}x the cap`);
      assert.equal(RACE_STATE.progressPercent(state), 100, `${circuit.slug}: progress stays 100%`);
      assert.equal(RACE_STATE.clockLabel(state), `${capLabel} RACE COMPLETE`, `${circuit.slug}: overshoot still reads complete`);
    }
  }
});

test('regression: a circuit switch resets the race completely', () => {
  // The bug: renderPitPlan() ran before the reset, so a new circuit's lap pace
  // was scored against the previous circuit's elapsed time and latched
  // stopCompleted on, leaving the stop permanently marked as done.
  //
  // Spun through the full Spa race first, so the leaked elapsed time would be
  // past Australia's entire race distance and would immediately show the flag.
  const spa = LIVE_SPA;
  const next = OFFICIAL_F1_CIRCUITS.find((c) => c.slug === 'australia');
  const state = RACE_STATE.create();
  RACE_STATE.reset(state, spa);
  runTo(state, `${spa.slug} to its flag`);

  const stoppedAt = RACE_STATE.pitWindowFor(spa).start;
  assert.equal(state.stopCompleted, true, 'the stop was made');
  assert.equal(state.raceFinished, true, 'Spa ran to its flag');
  assert.ok(state.lap > stoppedAt, 'we are well past the pit window');
  // Precondition: without a reset this elapsed time would already be past the
  // next circuit's flag. If the data ever changes so this stops holding, the
  // test would silently stop reproducing the bug, so assert it out loud.
  assert.ok(
    state.elapsed > next.laps * next.lapBase,
    `${spa.slug} elapsed ${state.elapsed} must exceed the ${next.slug} cap ${next.laps * next.lapBase}`,
  );

  RACE_STATE.reset(state, next);

  assert.equal(state.lap, 0, 'lap back to 0');
  assert.equal(state.elapsed, 0, 'clock back to 0');
  assert.equal(state.stopCompleted, false, 'stop flag cleared');
  assert.equal(state.raceFinished, false, 'not finished');
  assert.equal(state.totalLaps, next.laps, 'lap count follows the circuit');
  assert.equal(state.lapSeconds, next.lapBase, 'lap pace follows the circuit');
  assert.equal(state.pitWindowStart, RACE_STATE.pitWindowFor(next).start, 'pit window recalculated');
  assert.equal(state.maraAge, 0, 'tyre age reset');
  assert.equal(state.eliAge, 0, 'tyre age reset');
  assert.equal(RACE_STATE.progressPercent(state), 0, 'progress reset');
  assert.equal(plain(RACE_STATE.chartWindow(state)).length, 0, 'chart emptied');
  assert.match(RACE_STATE.clockLabel(state), / TO /, 'clock restarted, not complete');
  assert.equal(RACE_STATE.onStintTwo(state), false, 'not on the second stint');

  // The new circuit must then run to its own flag.
  const { clicks } = runToFlag(next);
  assert.equal(clicks, next.laps, 'the new circuit reaches its own flag');

  // The pit plan is a user choice and must survive a circuit change.
  RACE_STATE.setPitPlanActive(state, false);
  RACE_STATE.reset(state, spa);
  assert.equal(state.pitPlanActive, false, 'plan choice persists across circuits');
});

test('regression: the chart plots only laps actually run, capped at a 10-lap window', () => {
  const state = RACE_STATE.create();
  RACE_STATE.reset(state, LIVE_SPA);
  assert.deepEqual(plain(RACE_STATE.chartWindow(state)), [], 'no points on the grid');

  RACE_STATE.advanceLap(state);
  assert.deepEqual(plain(RACE_STATE.chartWindow(state)), [1], 'one point after one lap');

  for (let i = 0; i < 9; i += 1) RACE_STATE.advanceLap(state);
  assert.equal(state.lap, 10);
  assert.deepEqual(plain(RACE_STATE.chartWindow(state)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'ten points at lap 10');

  RACE_STATE.advanceLap(state);
  assert.deepEqual(plain(RACE_STATE.chartWindow(state)), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'window slides, still ten');

  const { state: done } = runToFlag(LIVE_SPA);
  const window = plain(RACE_STATE.chartWindow(done));
  assert.equal(window.length, 10, 'window stays capped at the flag');
  assert.equal(window[window.length - 1], LIVE_SPA.laps, 'window ends on the final lap');
  // Every plotted value must line up with its own label.
  const series = RACE_STATE.chartSeries('pace', done);
  assert.equal(series.a.length, window.length, 'series matches labels');
  assert.equal(series.b.length, window.length, 'series matches labels');
});

test('regression: chart titles reflect the window, not a fixed count', () => {
  const state = RACE_STATE.create();
  RACE_STATE.reset(state, LIVE_SPA);
  RACE_STATE.advanceLap(state);
  assert.equal(RACE_STATE.chartTitleFor('pace', state), 'Lap time · last 1 lap', 'singular');
  RACE_STATE.advanceLap(state);
  assert.equal(RACE_STATE.chartTitleFor('pace', state), 'Lap time · last 2 laps', 'plural');
  for (let i = 0; i < 20; i += 1) RACE_STATE.advanceLap(state);
  assert.equal(RACE_STATE.chartTitleFor('pace', state), 'Lap time · last 10 laps', 'capped at ten');
});

test('regression: stint bars never go negative or past 100%', () => {
  for (const circuit of ALL_CIRCUITS) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);
    for (let step = 0; step <= circuit.laps; step += 1) {
      const { firstPercent, secondPercent, firstLength, secondLength } = RACE_STATE.stintShares(state);
      assert.ok(firstPercent >= 0, `${circuit.slug} lap ${state.lap}: first stint negative`);
      assert.ok(secondPercent >= 0, `${circuit.slug} lap ${state.lap}: second stint negative`);
      assert.ok(firstPercent <= 100 + 1e-9, `${circuit.slug} lap ${state.lap}: first stint over 100%`);
      assert.ok(secondPercent <= 100 + 1e-9, `${circuit.slug} lap ${state.lap}: second stint over 100%`);
      assert.ok(firstLength >= 0 && secondLength >= 0, `${circuit.slug} lap ${state.lap}: negative length`);
      if (state.lap < circuit.laps) RACE_STATE.advanceLap(state);
    }
  }
});

test('regression: pit window is always inside the race and never before lap 2', () => {
  for (const circuit of ALL_CIRCUITS) {
    const { start, end } = RACE_STATE.pitWindowFor(circuit);
    assert.ok(start >= 2, `${circuit.slug}: pit window opens before lap 2`);
    assert.ok(start <= circuit.laps, `${circuit.slug}: pit window is past the flag`);
    assert.ok(end <= circuit.laps, `${circuit.slug}: pit window closes past the flag`);
    assert.ok(end >= start, `${circuit.slug}: pit window ends before it starts`);
    assert.equal(start, Math.max(2, Math.round(circuit.laps * 0.45)), `${circuit.slug}: window at 45%`);
  }
});

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test('lap times format as minutes:seconds.milliseconds', () => {
  assert.equal(RACE_STATE.formatLapTime(107.228), '1:47.228');
  assert.equal(RACE_STATE.formatLapTime(0), '0:00.000');
  assert.equal(RACE_STATE.formatLapTime(80.1), '1:20.100');
  assert.equal(RACE_STATE.formatLapTime(59.999), '0:59.999');
  assert.equal(RACE_STATE.formatLapTime(59.9996), '1:00.000', 'sub-millisecond rounding rolls over seconds and minutes');
  assert.equal(RACE_STATE.formatLapTime(60), '1:00.000');
  assert.equal(RACE_STATE.formatLapTime(-5), '0:00.000', 'negative clamps to zero');
});

test('sector splits scale with the circuit lap pace', () => {
  const spa = plain(RACE_STATE.sectorSplitsFor(107.228));
  assert.equal(spa.length, 3);
  spa.forEach((value, index) => {
    assert.ok(Math.abs(value - [32.441, 41.208, 33.579][index]) < 1e-9, `Spa S${index + 1}`);
  });
  // A shorter lap must give proportionally shorter sectors, and they must sum
  // back to the lap time.
  const monaco = plain(RACE_STATE.sectorSplitsFor(73.0));
  monaco.forEach((value, index) => {
    assert.ok(value < spa[index], `S${index + 1} should shrink with the lap`);
  });
  assert.ok(Math.abs(monaco.reduce((a, b) => a + b, 0) - 73.0) < 1e-9, 'sectors sum to the lap');
});

test('lap nouns are pluralised correctly', () => {
  assert.equal(RACE_STATE.lapNoun(0), '0 laps');
  assert.equal(RACE_STATE.lapNoun(1), '1 lap');
  assert.equal(RACE_STATE.lapNoun(2), '2 laps');
});

test('every compound the tyre plans can produce has a stylesheet rule', () => {
  // tools-lint.cjs enforces the same thing statically; this asserts the engine
  // and the stylesheet agree from the test side too.
  const css = read('styles.css');
  const seen = new Set();
  for (const circuit of ALL_CIRCUITS) {
    const state = RACE_STATE.create();
    RACE_STATE.reset(state, circuit);
    const window = RACE_STATE.pitWindowFor(circuit);
    // Sample both phases: the opening compound before the stop, and the second
    // one after it. Sampling only one phase finds just two of the three.
    for (const when of [0, window.start + 1]) {
      runToLap(state, when, `${circuit.slug} to lap ${when}`);
      for (const key of ['mara', 'eli']) {
        seen.add(RACE_STATE.compoundFor(state, key));
        seen.add(RACE_STATE.compoundClassName(state, key).split('-')[0]);
      }
    }
  }
  assert.deepEqual(plain([...seen].sort()), ['hard', 'medium', 'soft'], 'the plans cover exactly soft, medium and hard');
  for (const compound of seen) {
    assert.ok(css.includes(`.${compound}-compound{`), `styles.css has no .${compound}-compound`);
  }
});

test('the live Spa entry mirrors the Belgium round it stands in for', () => {
  const belgium = OFFICIAL_F1_CIRCUITS.find((c) => c.slug === 'belgium');
  assert.ok(belgium, 'belgium round exists');
  // The bundled Spa SVG mirrors the belgium entry, which is why the two agree on
  // lap count, lap time and length. If one moves the other must follow.
  assert.equal(LIVE_SPA.laps, belgium.laps, 'lap count agrees');
  assert.equal(LIVE_SPA.lapBase, belgium.lapBase, 'lap time agrees');
  assert.equal(LIVE_SPA.length, belgium.length, 'length agrees');
});

test('every circuit declares a length in one consistent format', () => {
  // All 23 rounds write "7.004km" with no space. The live Spa view used to say
  // "7.004 km", which rendered an inconsistent length in the map footer
  // depending on which view you were looking at.
  const lengths = ALL_CIRCUITS.map((c) => c.length);
  assert.equal(new Set(lengths).size > 1, true, 'circuits have differing lengths, as expected');
  const odd = lengths.filter((value) => !/^\d+\.\d{3}km$/.test(value));
  assert.deepEqual(plain(odd), [], 'every length must read as N.NNNkm');
});
