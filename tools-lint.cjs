// High-signal static checks. `node --check` only validates syntax, so it misses
// the failure mode that bit us: an edit that swallows the rest of a function
// and leaves it referencing an out-of-scope variable, and selectors that point
// at ids which no longer exist.
//
// Run: node tools-lint.cjs
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const script = read('script.js');
const html = read('index.html');
const circuits = read('circuits-data.js');
const routes = read('circuit-routes.js');

const problems = [];
const note = (msg) => problems.push(msg);

// 1. Every $('#some-id') in script.js must exist in index.html.
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const m of script.matchAll(/\$\('#([\w-]+)'\)/g)) {
  if (!htmlIds.has(m[1])) note(`script.js references #${m[1]} which is not in index.html`);
}
// Same for data-attribute hooks, which the code writes through.
const htmlDataAttrs = new Set([...html.matchAll(/\s(data-[\w-]+)(?:=|\s|>)/g)].map((m) => m[1]));
for (const m of script.matchAll(/\$\('\[(data-[\w-]+)=/g)) {
  if (!htmlDataAttrs.has(m[1])) note(`script.js references [${m[1]}] which is not in index.html`);
}

// 2. Every element id referenced must also be unique in the markup.
const idCounts = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) idCounts.set(m[1], (idCounts.get(m[1]) || 0) + 1);
for (const [id, count] of idCounts) {
  if (count > 1) note(`index.html has ${count} elements with id="${id}"`);
}

// 3. Dead functions: a top-level function that is only ever declared, never
// called, is dead code. This is what the truncated function looked like.
const declaredFns = [...script.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
for (const fn of declaredFns) {
  const uses = script.match(new RegExp(`\\b${fn}\\b`, 'g')) || [];
  if (uses.length <= 1) note(`function ${fn}() is declared but never called`);
}

// 4. Cross-file slug agreement.
const slugs = [...circuits.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
const routeSlugs = [...routes.matchAll(/"([\w-]+)":\{"width"/g)].map((m) => m[1]);
for (const slug of slugs) {
  if (!routeSlugs.includes(slug)) note(`circuits-data.js has "${slug}" with no racing line`);
}
for (const slug of routeSlugs) {
  if (!slugs.includes(slug)) note(`circuit-routes.js has "${slug}" with no circuit entry`);
}
const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupes.length) note(`duplicate slugs: ${[...new Set(dupes)].join(', ')}`);

// 5. Every circuit record must carry the fields the renderer reads.
// Records are one per line ending in `},` so split on lines rather than
// balancing braces: a nested weather: { ... } would close them early.
const records = circuits.split('\n')
  .filter((l) => l.trim().startsWith('{ slug:'))
  .map((l) => l.replace(/,\s*$/, ''));
for (const rec of records) {
  const slug = (rec.match(/slug: '([^']+)'/) || [])[1];
  for (const field of ['name', 'country', 'length', 'laps', 'date', 'venue', 'lapBase', 'corner', 'eventUrl', 'mapUrl']) {
    if (!new RegExp(`\\b${field}:`).test(rec)) note(`${slug} is missing ${field}`);
  }
  // The date string must name the weekday the date actually falls on, or the
  // race strip contradicts itself. Two 2026 rounds are Saturdays.
  const dateStr = (rec.match(/date: '([^']+)'/) || [])[1];
  const iso = dateStr && /(\d{1,2}) ([A-Z][a-z]+)/.exec(dateStr);
  if (iso) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const when = new Date(Date.UTC(2026, months.indexOf(iso[2]), Number(iso[1]), 12));
    const realDay = days[when.getUTCDay()];
    if (dateStr.indexOf(realDay) !== 0) {
      note(`${slug}: date "${dateStr}" names the wrong weekday; 2026-06-01 style date falls on a ${realDay}`);
    }
  }
  const sectors = (rec.match(/sectors: \[([^\]]*)\]/) || [])[1] || '';
  if (sectors.split(',').filter((s) => s.trim()).length !== 3) note(`${slug} does not have 3 sectors`);
  for (const key of ['air', 'track', 'rain', 'wind', 'asphalt']) {
    if (!rec.includes(`${key}:`)) note(`${slug} weather is missing ${key}`);
  }
  const laps = Number((rec.match(/laps: (\d+)/) || [])[1]);
  if (!(laps >= 44 && laps <= 80)) note(`${slug} laps=${laps} is outside the real 2026 range`);
  const km = parseFloat((rec.match(/length: '([\d.]+)km'/) || [])[1]);
  if (!(km >= 3 && km <= 7.5)) note(`${slug} length=${km}km is implausible`);
  const air = Number((rec.match(/air: (\d+)/) || [])[1]);
  const track = Number((rec.match(/track: (\d+)/) || [])[1]);
  if (Number.isFinite(air) && Number.isFinite(track) && track < air) {
    note(`${slug} track (${track}) is colder than air (${air})`);
  }
}

// 6. Rendering-time invariants that must hold for any circuit.
const lapBaseFor = (slug) => {
  const rec = records.find((r) => r.includes(`slug: '${slug}'`)) || '';
  return Number((rec.match(/lapBase: ([\d.]+)/) || [])[1]);
};
for (const rec of records) {
  const slug = (rec.match(/slug: '([^']+)'/) || [])[1];
  const base = lapBaseFor(slug);
  const laps = Number((rec.match(/laps: (\d+)/) || [])[1]);
  // A one-stop race needs a pit window that leaves a usable second stint.
  const window = Math.max(2, Math.round(laps * 0.45));
  if (window + 3 > laps) note(`${slug} pit window at lap ${window} leaves no second stint`);
  if (base < 60 || base > 120) note(`${slug} lapBase=${base}s is implausible`);
  // Race length sanity, used for the time cap readout.
  const raceSeconds = laps * base;
  if (raceSeconds < 2000 || raceSeconds > 7200) {
    note(`${slug} race distance ${Math.round(raceSeconds)}s is implausible`);
  }
}

// 7. Every compound class the JS writes must have a matching CSS colour rule,
// or the dot/chip silently renders in the wrong colour after a pit stop.
const css = read('styles.css');
const engine = read('race-state.js');
for (const compound of ['soft', 'medium', 'hard']) {
  if (!new RegExp(`\\.${compound}-compound\\{[^}]*color:`).test(css)) {
    note(`script.js can set "${compound}-compound" but styles.css has no colour rule for it`);
  }
  if (!new RegExp(`\\.tyre-chip\\.${compound}\\{`).test(css)) {
    note(`script.js can set "tyre-chip ${compound}" but styles.css has no rule for it`);
  }
}

// 8. Compounds used in a TYRE_PLANS entry must be one the stylesheet knows.
// The plans moved to race-state.js, so this has to read them from there or it
// quietly stops checking anything.
const planBlock = (engine.match(/const TYRE_PLANS = \{[\s\S]*?\n\};/) || [])[0] || '';
for (const m of planBlock.matchAll(/\b(first|second):\s*'(\w+)'/g)) {
  if (!new RegExp(`\\.${m[2]}-compound\\{`).test(css)) {
    note(`TYRE_PLANS uses compound "${m[2]}" which styles.css does not define`);
  }
}

// 9. Descendant selectors on flex containers silently change layout: wrapping
// text in a <span> turns one flex child into several. Flag the containers
// that hold venue/state text next to a tag.
for (const sel of ['weather-title']) {
  const rule = (css.match(new RegExp(`\\.${sel}\\{[^}]*\\}`)) || [])[0] || '';
  if (/display:flex/.test(rule) && new RegExp(`\\.${sel} span\\{`).test(css)) {
    note(`.${sel} is a flex container and has a descendant .${sel} span rule; use a class so a new wrapper does not change the child count`);
  }
}

// 10. The race model's fields may only be written inside race-state.js. This is
// the invariant that issue #7 asked for: a circuit switch used to score the
// previous circuit's elapsed time against the new lap pace because the reset
// order was only documented in a comment. Reads through `raceState.foo` are
// fine; what must not reappear is a bare assignment to one of these names.
const RACE_FIELDS = ['elapsed', 'lap', 'stopCompleted', 'raceFinished', 'maraAge', 'eliAge', 'pitWindowStart', 'pitWindowEnd', 'lapSeconds', 'totalLaps', 'lastFrameTime', 'lastDisplayedSecond'];
const blame = (index, field, via) => {
  const line = script.slice(0, index).split('\n').length;
  const text = script.split('\n')[line - 1].trim();
  if (text.startsWith('//')) return;
  note(`script.js:${line} writes race field "${field}"${via}; only race-state.js may, via reset/advanceLap/tick/sync`);
};

// (a) Any write through raceState.<field>. This is the case that matters most:
// reaching into the state object is exactly how the old ordering hazard came
// back. Reads are fine, so only an assignment operator counts.
const viaState = new RegExp(`raceState\\.(${RACE_FIELDS.join('|')})\\s*(?:\\+\\+|--|(?:[-+*/]|%)?=)(?!=)`, 'g');
for (const m of script.matchAll(viaState)) blame(m.index, m[1], ' via raceState');

// (b) A bare assignment to one of the old module-level names. The leading class
// excludes `.`, quotes and `-`, so `driver.lapSeconds` and `[data-lap="mara"]`
// are not caught; only a standalone name being written is.
for (const field of RACE_FIELDS) {
  const bare = new RegExp(`(^|[^.\\w$"'\`\\-])${field}\\s*(?:\\+\\+|--|(?:[-+*/]|%)?=)(?!=)`, 'gm');
  for (const m of script.matchAll(bare)) blame(m.index + m[1].length, field, '');
}

// 11. Every engine entry point script.js calls must actually be exported.
// The export list is the last `return {` in the file; earlier ones are plain
// object literals returned by create() and pitWindowFor().
const exportBlock = engine.slice(engine.lastIndexOf('return {'));
for (const m of script.matchAll(/RACE_STATE\.(\w+)\(/g)) {
  if (!new RegExp(`^\\s*${m[1]},?$`, 'm').test(exportBlock)) {
    note(`script.js calls RACE_STATE.${m[1]}() but race-state.js does not export it`);
  }
}

// 12. No file may contain UTF-8 that was decoded as cp1252 and re-encoded. That
// double round trip is what turns U+00B7 into "A-circumflex, period" and renders
// as "A-circumflex, period" in the page. It is easy to cause by editing a file
// through a tool that assumes the system codepage, and it is invisible in a
// diff review because the ASCII is untouched.
//
// The test is a Latin-1 letter immediately followed by a cp1252 symbol or digit.
// Correct text does not do this: "SAO PAULO" has A-tilde followed by a letter,
// "Frere" has e-grave followed by a letter. Node has no cp1252 codec, so the
// high range is listed explicitly.
const MOJIBAKE = /[\u00c0-\u00df][\u00a1-\u00bf\u00d7\u00f7\u2013\u2014\u2018\u2019\u201c\u201d\u2020-\u2026\u2122\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc]/;
for (const [name, source] of Object.entries({ 'index.html': html, 'script.js': script, 'circuits-data.js': circuits, 'race-state.js': engine, 'tools-lint.cjs': read('tools-lint.cjs') })) {
  source.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
    const m = MOJIBAKE.exec(line);
    if (m) {
      const at = line.indexOf(m[0]);
      note(`${name}:${i + 1} looks like mojibake (UTF-8 read as cp1252): "${line.trim().slice(Math.max(0, at - 20), at + 20)}"`);
    }
  });
  // A replacement character means the file is not valid UTF-8 at all.
  if (source.includes('\uFFFD')) note(`${name} contains a U+FFFD replacement character, so it is not valid UTF-8`);
}

// Report
if (problems.length === 0) {
  console.log('clean');
} else {
  problems.forEach((p) => console.log(`  ${p}`));
  console.log(`\n${problems.length} problem(s)`);
  process.exitCode = 1;
}
