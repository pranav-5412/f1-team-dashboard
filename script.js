const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Everything about where we are in the race lives in this one object. The
// clock, lap, stop and flag fields are written only by RACE_STATE.reset(),
// .advanceLap(), .tick() and .sync() -- tools-lint.cjs fails the build if this
// file assigns them directly. That is what turns the call order inside
// applyCircuitContext from something a comment has to remember into something
// the linter enforces.
const raceState = RACE_STATE.create();

let toastTimer;
let selectedDriver = 'mara';
let chartMode = 'pace';
const TRACK_GAP_PER_POSITION = 0.05;
// A real lap is far too slow to watch, so car motion runs at 3x real time.
const LAP_TIME_SCALE = 3;
const SPA_MOTION_PATH = $('#circuitMotionPath').getAttribute('d');
let currentRoute = { width: 550, height: 443.7, d: SPA_MOTION_PATH };

const fieldCars = [
  { position: 1, name: 'Jules Mercer', number: 1, paceOffset: -0.088 },
  { position: 2, name: 'Alba Rossi', number: 18, paceOffset: -0.038 },
  { position: 3, name: 'Luca Moreau', number: 4, paceOffset: -0.028 },
  { position: 4, name: 'Mara Voss', number: 27, paceOffset: 0, driverKey: 'mara' },
  { position: 5, name: 'Theo Park', number: 81, paceOffset: 0.022 },
  { position: 6, name: 'Felix Ward', number: 44, paceOffset: 0.052 },
  { position: 7, name: 'Eli Navarro', number: 63, paceOffset: 0.363, driverKey: 'eli' },
  { position: 8, name: 'Niko Vale', number: 14, paceOffset: 0.082 },
  { position: 9, name: 'Samir Khan', number: 22, paceOffset: -0.048 },
  { position: 10, name: 'Iris Novak', number: 2, paceOffset: 0.042 },
  { position: 11, name: 'Tom Bell', number: 77, paceOffset: -0.008 },
  { position: 12, name: 'Mateo Cruz', number: 11, paceOffset: 0.112 },
  { position: 13, name: 'Leo Hart', number: 55, paceOffset: 0.072 },
  { position: 14, name: 'Finn Okada', number: 30, paceOffset: 0.172 },
  { position: 15, name: 'Noah Price', number: 20, paceOffset: 0.122 },
  { position: 16, name: 'Hugo Silva', number: 23, paceOffset: 0.212 },
  { position: 17, name: 'Aria Laurent', number: 10, paceOffset: 0.252 },
  { position: 18, name: 'Benji Stone', number: 31, paceOffset: 0.292 },
  { position: 19, name: 'Milo Chen', number: 6, paceOffset: 0.322 },
  { position: 20, name: 'Kai Morgan', number: 99, paceOffset: 0.382 },
];

// Every car is defined by its gap to the reference lap, so the whole field
// re-times itself the moment a circuit with a different lap pace is loaded.
fieldCars.forEach((driver) => { driver.lapSeconds = SPA_LAP_SECONDS + driver.paceOffset; });

const turnNotes = {
  1: ['La Source', 'Brake late, rotate once, and please do not introduce yourself to the gravel.'],
  2: ['Eau Rouge', 'Commitment corner. The car is confident; the engineer is pretending.'],
  3: ['Raidillon', 'Keep the throttle pinned over the crest. Scenic views are for the cooldown lap.'],
  4: ['Raidillon exit', 'Unwind the steering onto Kemmel. The straight is long enough to reconsider everything.'],
  5: ['Les Combes', 'Heavy braking after the Kemmel tow. A good place to make a very polite pass.'],
  6: ['Malmedy', 'Settle the car after Les Combes. The front tyres have already read the schedule.'],
  7: ['Rivage', 'Downhill and off-camber. Be kind to the fronts; they have a long afternoon.'],
  8: ['Bruxelles', 'Long downhill left. Front-left tyre would like a word about this.'],
  9: ['No Name', 'A quick change of direction. The corner naming committee ran out of coffee.'],
  10: ['Pouhon', 'Two-apex commitment. Lift only if the laws of physics send a formal letter.'],
  11: ['Pouhon', 'Keep the second apex tidy. The front-left has submitted another complaint.'],
  12: ['Fagnes', 'Quick left-right. Make the kerbs work for you, not the suspension bill.'],
  13: ['Campus', 'A brief breath before the final run. Brief is doing a lot of work there.'],
  14: ['Stavelot', 'Get the exit right and the next straight does the rest of the negotiating.'],
  15: ['Paul Frère', 'Carry the speed through the bend. The timing screen will notice.'],
  16: ['Curve 16', 'Smooth hands on the way toward Blanchimont. The car appreciates manners.'],
  17: ['Blanchimont', 'Flat in the dry. In the wet, suddenly everyone remembers their family.'],
  18: ['Bus Stop entry', 'Brake hard and place the car. This is not the moment for artistic kerb use.'],
  19: ['Bus Stop', 'Last chance to out-brake someone before the line. Or out-brake yourself.'],
};

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function addFieldDots() {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const markerLayer = $('#fieldDots');
  fieldCars.forEach((driver) => {
    const marker = document.createElementNS(svgNamespace, 'g');
    marker.classList.add('field-dot');
    if (driver.driverKey) marker.classList.add('team-car-dot', `team-${driver.driverKey}`);
    if (driver.driverKey) marker.dataset.driver = driver.driverKey;
    marker.setAttribute('role', 'img');
    marker.setAttribute('aria-label', `P${driver.position} ${driver.name}, car ${driver.number}`);

    const title = document.createElementNS(svgNamespace, 'title');
    title.textContent = `P${driver.position} · ${driver.name} #${driver.number}`;
    marker.append(title);
    if (driver.driverKey) {
      const halo = document.createElementNS(svgNamespace, 'circle');
      halo.classList.add('dot-halo');
      halo.setAttribute('r', '11');
      marker.append(halo);
    }
    const dot = document.createElementNS(svgNamespace, 'circle');
    dot.classList.add('dot-core');
    dot.setAttribute('r', driver.driverKey ? '7' : '5');
    marker.append(dot);
    if (driver.driverKey) {
      const number = document.createElementNS(svgNamespace, 'text');
      number.classList.add('dot-number');
      number.setAttribute('text-anchor', 'middle');
      number.setAttribute('y', '2.2');
      number.textContent = driver.number;
      marker.append(number);
    }
    driver.marker = marker;
    markerLayer.append(marker);
    placeDriver(driver);
  });
}

// Car motion is SVG SMIL, not CSS, so a prefers-reduced-motion rule cannot
// reach it, and freezing it via repeatCount="1" does not work either: the
// negative begin offset leaves the animation mid-iteration and it keeps
// playing. So when the setting matches, no animation element is created at
// all. Each car is placed once on the racing line and stays there. Watched
// live, so toggling the OS setting takes effect without a reload.
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionQuery.matches;
document.body.classList.toggle('reduced-motion', reducedMotion);

function carPhase(driver) {
  return ((0.37 - (driver.position - 4) * TRACK_GAP_PER_POSITION) % 1 + 1) % 1;
}

function createCarMotion(driver, svgNamespace = 'http://www.w3.org/2000/svg') {
  const motion = document.createElementNS(svgNamespace, 'animateMotion');
  const motionPathReference = document.createElementNS(svgNamespace, 'mpath');
  const lapDuration = driver.lapSeconds / LAP_TIME_SCALE;
  motion.setAttribute('dur', `${lapDuration}s`);
  motion.setAttribute('begin', `-${(carPhase(driver) * lapDuration).toFixed(2)}s`);
  motion.setAttribute('repeatCount', 'indefinite');
  motion.setAttribute('rotate', 'auto');
  motionPathReference.setAttribute('href', '#circuitMotionPath');
  motionPathReference.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#circuitMotionPath');
  motion.append(motionPathReference);
  return motion;
}

// Attach motion, or pin the car at its phase point on the current route.
function placeDriver(driver) {
  const path = $('#circuitMotionPath');
  const existing = driver.marker.querySelector('animateMotion');
  if (reducedMotion) {
    if (existing) driver.marker.removeChild(existing);
    driver.marker.removeAttribute('transform');
    if (path && typeof path.getPointAtLength === 'function' && path.getTotalLength() > 0) {
      const point = path.getPointAtLength(carPhase(driver) * path.getTotalLength());
      driver.marker.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
    }
    return;
  }
  driver.marker.removeAttribute('transform');
  if (existing) driver.marker.replaceChild(createCarMotion(driver), existing);
  else driver.marker.append(createCarMotion(driver));
}

function applyReducedMotionPreference() {
  const wasReduced = reducedMotion;
  reducedMotion = reducedMotionQuery.matches;
  document.body.classList.toggle('reduced-motion', reducedMotion);
  if (reducedMotion === wasReduced) return;
  applyCircuitMotion(currentRoute);
  showToast(reducedMotion
    ? 'Reduced motion on. The field is parked.'
    : 'Motion restored. Back on the limit.');
}

if (typeof reducedMotionQuery.addEventListener === 'function') {
  reducedMotionQuery.addEventListener('change', applyReducedMotionPreference);
} else if (typeof reducedMotionQuery.addListener === 'function') {
  // Safari before 14 only has the deprecated API.
  reducedMotionQuery.addListener(applyReducedMotionPreference);
}

function applyCircuitMotion(route) {
  const trackOverlay = $('#trackOverlay');
  const motionPath = $('#circuitMotionPath');
  trackOverlay.setAttribute('viewBox', `0 0 ${route.width} ${route.height}`);
  motionPath.setAttribute('d', route.d);
  // Markers only exist after addFieldDots(); the first route applies at boot.
  if (!fieldCars[0].marker) return;
  fieldCars.forEach(placeDriver);
}

const circuitSelect = $('#circuitSelect');
// The bundled Spa SVG is the "live race" view. It mirrors the `belgium` entry
// in circuits-data.js, which is why the two agree on length, laps and lap time.
const liveSpaMap = {
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
  image: 'assets/spa-francorchamps-map.svg',
  alt: 'Spa-Francorchamps track layout with all 19 numbered turns, sectors, and DRS detection zones',
};

const raceEventNames = {
  australia: 'AUSTRALIAN GRAND PRIX', china: 'CHINESE GRAND PRIX', japan: 'JAPANESE GRAND PRIX',
  miami: 'MIAMI GRAND PRIX', canada: 'CANADIAN GRAND PRIX', monaco: 'MONACO GRAND PRIX',
  // Note the two Spanish rounds, which are easy to swap: the Spanish Grand Prix
  // is the new Madrid circuit, and the long-standing race at Montmelo is now the
  // Barcelona-Catalunya Grand Prix.
  'barcelona-catalunya': 'BARCELONA-CATALUNYA GRAND PRIX', austria: 'AUSTRIAN GRAND PRIX',
  'great-britain': 'BRITISH GRAND PRIX', belgium: 'BELGIAN GRAND PRIX', hungary: 'HUNGARIAN GRAND PRIX',
  netherlands: 'DUTCH GRAND PRIX', italy: 'ITALIAN GRAND PRIX', spain: 'SPANISH GRAND PRIX',
  azerbaijan: 'AZERBAIJAN GRAND PRIX', bahrain: 'BAHRAIN GRAND PRIX', singapore: 'SINGAPORE GRAND PRIX',
  // 2026 special case: the Bahrain GP is being run at Sepang, Malaysia, after
  // the April Sakhir round was cancelled.
  'united-states': 'UNITED STATES GRAND PRIX', mexico: 'MEXICO CITY GRAND PRIX', brazil: 'SÃO PAULO GRAND PRIX',
  'las-vegas': 'LAS VEGAS GRAND PRIX', qatar: 'QATAR GRAND PRIX',
  'united-arab-emirates': 'ABU DHABI GRAND PRIX',
  'live-spa': 'BELGIAN GRAND PRIX',
};

OFFICIAL_F1_CIRCUITS.forEach((circuit) => {
  const option = document.createElement('option');
  option.value = circuit.slug;
  option.textContent = circuit.name;
  circuitSelect.append(option);
});

function setMapCredit(label, url, detail, sourceLabel = 'Formula1.com · 2026') {
  const credit = $('#mapCredit');
  credit.replaceChildren(document.createTextNode(`${label}: `));
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = sourceLabel;
  credit.append(link, document.createTextNode(` · ${detail}`));
}

// One shell, three slots. Four call sites used to rebuild it inline.
const NORTH_MARK = '<span class="map-north">N ↑</span>';
const PICK_A_CORNER = ['Pick a corner', 'Tap a turn marker for the engineer\'s note.', NORTH_MARK];

function setTurnReadout(title, detail, tail) {
  $('#turnReadout').innerHTML = `<span class="turn-readout-icon">⌖</span><span><b>${title}</b><small>${detail}</small></span>${tail}`;
}

// The lap badges in race control and the sector panel are written from here.
function updateLapBadges() {
  const badge = RACE_STATE.lapBadgeFor(raceState.lap);
  $$('[data-lap-badge]').forEach((node) => {
    node.textContent = badge;
  });
}

// The strategy desk's stint bars: the first bar fills as the opening stint is
// used, and the second one takes over once the stop is made. All of the
// arithmetic lives in RACE_STATE.stintShares() -- this only projects it.
function updateStintVisuals() {
  const stints = $$('.stint-visual');
  ['mara', 'eli'].forEach((key, index) => {
    const bars = stints[index] ? stints[index].querySelectorAll('.stint-bar') : [];
    if (bars.length < 2) return;
    const [firstBar, secondBar] = bars;
    const { onSecond, firstLength, secondLength, firstPercent, secondPercent } = RACE_STATE.stintShares(raceState);
    firstBar.style.width = `${firstPercent}%`;
    secondBar.style.width = `${secondPercent}%`;
    // Collapse a stint that has not started. A 0%-wide bar still renders its
    // 7px of horizontal padding, which reads as a stray colour block.
    firstBar.classList.toggle('is-empty', firstPercent === 0);
    secondBar.classList.toggle('is-empty', secondPercent === 0);
    const laps = RACE_STATE.lapNoun;
    firstBar.querySelector('b').textContent = laps(firstLength);
    secondBar.querySelector('b').textContent = onSecond ? laps(secondLength) : 'planned';
    firstBar.classList.toggle('stint-active', !onSecond);
    secondBar.classList.toggle('stint-active', onSecond);
    // Plan B means no second compound: the opening tyre runs all the way.
    // The strategy dot and the driver card chip both follow the compound, so
    // the colour still says "soft" after the stop onto mediums.
    const chip = $(`[data-compound="${key}"]`);
    if (chip) chip.textContent = RACE_STATE.compoundLabel(raceState, key);
    const dot = $(`[data-compound-dot="${key}"]`);
    if (dot) dot.className = `compound ${RACE_STATE.compoundClassName(raceState, key)}`;
    const card = $(`[data-driver="${key}"] .tyre-chip`);
    if (card) {
      card.className = RACE_STATE.tyreChipClassName(raceState, key);
      card.innerHTML = `<i></i> ${RACE_STATE.chipCode(raceState, key)}`;
    }
  });
}

// Everything the desk shows about *where* we are: venue, lap count, lap pace,
// sector names, weather, and the copy that used to hardcode Spa.
function applyCircuitContext(circuit) {
  // Changing circuit restarts the race: the lap clock, the time cap and the
  // chequered flag all belong to the circuit you are looking at.
  //
  // This is the only place the race is put back on the grid. reset() is called
  // before anything reads raceState, so the ordering hazard that latched
  // stopCompleted on a circuit switch can no longer be reached: there is no
  // window in which an old elapsed time can be scored against the new circuit's
  // lap pace, because the new lap pace is installed by the same call.
  RACE_STATE.reset(raceState, circuit);

  const eventName = raceEventNames[circuit.slug] || `${circuit.shortName || circuit.name} GRAND PRIX`;
  const heroCorner = circuit.corner;
  $('#eventName').textContent = eventName;
  // The host nation, not the display name's prefix: the Bahrain Grand Prix
  // races in Malaysia, and Las Vegas is in the United States.
  $('#raceVenue').textContent = circuit.country || circuit.name.split(' · ')[0];
  $('#raceDate').textContent = circuit.date;
  $('#heroDate').textContent = circuit.date;
  $('#heroCircuit').textContent = circuit.shortName || circuit.name;
  $('#heroLine').innerHTML = `One eye on ${heroCorner}.<br /><em>The other on the tyres.</em>`;
  // Title-cased for the tab. "UNITED STATES GRAND PRIX" must not become
  // "United states grand prix", so the small words stay lower and the rest
  // keeps its original casing.
  const titleWords = eventName.toLowerCase().split(' ');
  const smallWords = new Set(['grand', 'prix', 'of', 'the', 'and', 'in']);
  const documentTitle = titleWords
    .map((word, index) => {
      if (index > 0 && smallWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  document.title = `Apex GP — ${documentTitle}`;
  const { air, track, rain, wind, asphalt } = circuit.weather;
  $('#weatherVenue').textContent = (circuit.venue || circuit.shortName || circuit.name).toUpperCase();
  const icon = rain >= 45 ? '☂' : rain >= 20 ? '☁' : '☀';
  $('#weatherIcon').textContent = icon;
  $('#weatherMiniIcon').textContent = icon;
  $('#weatherAir').textContent = `${air}°`;
  $('#weatherTrack').textContent = `${track}°`;
  $('#weatherRain').textContent = `${rain}%`;
  $('#rainChance').textContent = `${rain}%`;
  $('#rainMeterFill').style.width = `${rain}%`;
  $('#weatherWind').textContent = wind;
  $('#weatherAsphalt').textContent = asphalt;
  $('#weatherMini').textContent = `${air}°`;
  $('#weatherMiniTrack').textContent = `${track}°`;
  $('#sector1Name').textContent = circuit.sectors[0];
  $('#sector2Name').textContent = circuit.sectors[1];
  $('#sector3Name').textContent = circuit.sectors[2];
  $('#incidentCorner').textContent = circuit.corner;

  // The sector table has to stay internally consistent: the purple cell must
  // be the faster of the two rows, and the "best in sector" footer must name
  // whoever actually holds it. Spa's split gives Voss S1 and S3, Navarro S2,
  // by margins of 0.166 / 0.106 / 0.303 against the session's 0.363 pace gap.
  const splits = RACE_STATE.sectorSplitsFor(circuit.lapBase);
  const sectorWinners = ['mara', 'eli', 'mara'];
  const winnerMargins = [0.166, 0.106, 0.303];
  const sectorRows = $$('.sector-driver');
  const sectorTimes = sectorWinners.map((winner, index) => {
    const reference = splits[index] + (winner === 'mara' ? 0 : TEAM_PACE_GAP / 3);
    return winner === 'mara' ? reference - winnerMargins[index] : reference;
  });
  const applyRow = (row, isMara) => {
    if (!row) return;
    const cells = [...row.querySelectorAll('span')].filter((cell) => !cell.classList.contains('sector-driver-name'));
    cells.forEach((cell, index) => {
      const holdsPurple = (sectorWinners[index] === 'mara') === isMara;
      // The winner's own time; the loser's is the winner's plus the margin.
      const seconds = holdsPurple ? sectorTimes[index] : sectorTimes[index] + winnerMargins[index];
      cell.textContent = seconds.toFixed(3);
      cell.classList.toggle('personal-best', holdsPurple);
    });
  };
  applyRow(sectorRows[0], true);
  applyRow(sectorRows[1], false);

  const bestInSector = $$('.sector-best span');
  sectorWinners.forEach((winner, index) => {
    const cell = bestInSector[index + 1];
    if (!cell) return;
    cell.innerHTML = `${winner === 'mara' ? 'VOSS' : 'NAVARRO'} <i>−${winnerMargins[index].toFixed(3)}</i>`;
  });

  // LAST LAP is the current reference pace; BEST is a little quicker, as it
  // was on the original Spa card (1:47.228 last vs 1:46.902 best).
  const driverLaps = { mara: circuit.lapBase, eli: circuit.lapBase + TEAM_PACE_GAP };
  const bestBonus = { mara: 0.326, eli: 0.820 };
  Object.entries(driverLaps).forEach(([key, seconds]) => {
    $$(`[data-lap="${key}"]`).forEach((node) => { node.textContent = RACE_STATE.formatLapTime(seconds); });
    $$(`[data-best="${key}"]`).forEach((node) => { node.textContent = RACE_STATE.formatLapTime(seconds - bestBonus[key]); });
  });

  fieldCars.forEach((driver) => {
    driver.lapSeconds = circuit.lapBase + driver.paceOffset;
  });
  applyCircuitMotion(currentRoute);

  // Everything below reads raceState, which reset() rebuilt at the top of this
  // function, so there is no earlier state left to score against the new lap
  // pace. renderPitPlan() still has to come after that reset.
  $('#advanceLap').disabled = false;
  $('#advanceLap').innerHTML = 'ADVANCE LAP <span>＋</span>';
  $('.status-pill').innerHTML = '<b></b> GREEN FLAG';
  $('.status-pill').style.color = '';
  $('.status-pill b').style.background = '';
  $('#simulationLabel').textContent = circuit.slug === 'live-spa' ? '20 CARS MOVING' : '20 CARS · TRACK SYNC';
  $('#simulationState').classList.remove('sim-preview');
  // renderPitPlan() ends by calling updateRaceReadouts() itself, so this is the
  // one full readout pass for the new circuit.
  renderPitPlan();
  // Last, so it reads the reset state rather than the previous circuit's.
  updateSectorInsight();
  drawChart(chartMode);
  // Last: the reset above cleared raceFinished, so this re-arms the loop. If the
  // previous circuit had already reached its flag the loop had stopped, and
  // this is what starts it again.
  startRaceLoop();
}

function updateSectorInsight() {
  const circuit = raceState.circuit;
  if (!circuit) return;
  const finale = circuit.sectors[2].split('→').pop().trim();
  $('#sectorInsight').innerHTML = raceState.lap === 0
    ? `<b>No laps run yet.</b> Sector data lands after the first flying lap at ${circuit.venue}.`
    : raceState.stopCompleted
      ? `<b>Voss is quicker into ${finale}.</b> Fresh rubber, so the run to the flag should be where it is won.`
      : `<b>Voss is quicker into ${finale}.</b> The opening tyres are still fresh. Conserve them.`;
}

function showCircuitMap(slug = 'live-spa') {
  const circuit = OFFICIAL_F1_CIRCUITS.find((item) => item.slug === slug);
  const isLiveSpa = !circuit;
  const mapArt = $('#mapArt');
  const trackOverlay = $('#trackOverlay');
  const trackImage = $('#realTrackMap');
  const movingLegend = $$('.moving-legend');

  if (isLiveSpa) {
    circuitSelect.value = 'live-spa';
    mapArt.classList.remove('official-map');
    mapArt.style.removeProperty('--map-aspect');
    trackImage.src = liveSpaMap.image;
    trackImage.alt = liveSpaMap.alt;
    trackOverlay.hidden = false;
    currentRoute = { width: 550, height: 443.7, d: SPA_MOTION_PATH };
    applyCircuitContext(liveSpaMap);
    $('#circuitName').textContent = liveSpaMap.shortName;
    $('#circuitLength').textContent = liveSpaMap.length;
    $('#mapEyebrow').textContent = 'LIVE RACE MAP · SPA-FRANCORCHAMPS';
    movingLegend.forEach((item) => { item.hidden = false; });
    $('#mapFooter').hidden = false;
    $('#cornerLine').hidden = false;
    setTurnReadout(...PICK_A_CORNER);
    $('#mapReset').innerHTML = 'RESET VIEW <span>↺</span>';
    setMapCredit('Map', 'https://commons.wikimedia.org/wiki/File:2022_F1_CourseLayout_Belgium.svg', 'ごひょううべこ · CC BY-SA 4.0', '2022 F1 CourseLayout · Wikimedia Commons');
    return;
  }

  circuitSelect.value = circuit.slug;
  mapArt.classList.add('official-map');
  trackImage.src = circuit.mapUrl;
  trackImage.alt = `Official 2026 Formula 1 circuit diagram for ${circuit.name}; original turn numbers and markings retained`;
  const motionRoute = OFFICIAL_CIRCUIT_ROUTES[circuit.slug];
  if (!motionRoute) {
    showToast('No racing line found for this circuit yet.');
    return showCircuitMap();
  }
  trackOverlay.hidden = false;
  currentRoute = motionRoute;
  applyCircuitContext(circuit);
  $('#circuitName').textContent = circuit.name.split(' · ').slice(1).join(' · ');
  $('#circuitLength').textContent = circuit.length;
  $('#mapEyebrow').textContent = 'OFFICIAL F1 CIRCUIT MAP · 2026';
  movingLegend.forEach((item) => { item.hidden = false; });
  $('#mapFooter').hidden = true;
  $('#cornerLine').hidden = true;
  setTurnReadout(`${circuit.name} · ${circuit.laps} laps`, "Twenty cars follow this official layout's mapped racing line as the field runs.", `<a class="map-source-link" href="${circuit.eventUrl}" target="_blank" rel="noreferrer">SOURCE ↗</a>`);
  $('#mapReset').innerHTML = 'BACK TO LIVE SPA <span>↶</span>';
  setMapCredit('Official map', circuit.eventUrl, 'track diagram served by Formula1.com; markings kept as published');
}

$('#realTrackMap').addEventListener('load', (event) => {
  const image = event.currentTarget;
  if (image.naturalWidth && image.naturalHeight) {
    $('#mapArt').style.setProperty('--map-aspect', `${image.naturalWidth} / ${image.naturalHeight}`);
    if (circuitSelect.value !== 'live-spa') {
      $('#trackOverlay').setAttribute('viewBox', `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
    }
  }
});

$('#realTrackMap').addEventListener('error', () => {
  if (circuitSelect.value !== 'live-spa') {
    showToast('Official map did not load. Returning to the live Spa map.');
    showCircuitMap();
  }
});

circuitSelect.addEventListener('change', () => showCircuitMap(circuitSelect.value));

// Projects raceState onto the desk. Every number here is read from the engine,
// so this function makes no decisions of its own.
function updateRaceReadouts(change) {
  if (change === null) return;
  const previousLap = change ? change.previousLap : raceState.lap;
  $('#lapReadout').textContent = RACE_STATE.lapLabel(raceState);
  // scaleX, not width: the fill has no text, so transform keeps this off the
  // layout path. The bar itself is width:100% in CSS.
  $('#progressFill').style.transform = `scaleX(${RACE_STATE.progressPercent(raceState) / 100})`;
  updateLapBadges();
  $('#maraAge').textContent = RACE_STATE.tyreAgeLabel(raceState.maraAge);
  $('#eliAge').textContent = RACE_STATE.tyreAgeLabel(raceState.eliAge);
  // Two swappable pieces rather than an innerHTML rewrite: rebuilding the
  // note on every tick would recreate the #stopCountdown node each time.
  const lead = $('#stopLead');
  const countdown = $('#stopCountdown');
  if (lead && countdown) {
    lead.textContent = raceState.stopCompleted ? 'Boxed on lap' : 'Next stop on lap';
    countdown.textContent = String(raceState.pitWindowStart);
  }
  updateStintVisuals();
  $('#raceClock').textContent = RACE_STATE.clockLabel(raceState);
  if (change && change.finished) {
    $('.status-pill').innerHTML = '<b></b> CHEQUERED FLAG';
    $('.status-pill').style.color = 'var(--paper)';
    $('.status-pill b').style.background = 'var(--paper)';
    $('#advanceLap').textContent = 'RACE COMPLETE';
    $('#advanceLap').disabled = true;
    $('#simulationLabel').textContent = 'CHEQUERED FLAG';
    showToast('That is the flag. Someone tell the tyres they can stop now.');
  } else if (change && change.stoppedNow) {
    const late = raceState.pitWindowStart >= raceState.totalLaps - 2;
    showToast(`${late ? 'Late' : 'Planned'} stop. Fresh rubber from here.`);
  } else if (change && change.lap > previousLap) {
    const phase = raceState.stopCompleted ? 'Second stint' : 'Opening tyres';
    showToast(`Lap ${change.lap} of ${raceState.totalLaps}. ${phase}.`);
  }
  // The chart window and the sector insight both depend on how far we've run.
  if (change && change.lapChanged) {
    drawChart(chartMode);
    updateSectorInsight();
  }
}

$('#advanceLap').addEventListener('click', () => {
  updateRaceReadouts(RACE_STATE.advanceLap(raceState));
});

// The race loop stops at the chequered flag rather than waking the browser every
// frame for the rest of the session, since tickFrame() returns null from then on.
// applyCircuitContext() re-arms it, and the guard is what stops a circuit change
// from leaving two loops running.
let raceLoopRunning = false;

function animateRace(timestamp) {
  updateRaceReadouts(RACE_STATE.tickFrame(raceState, timestamp));
  if (raceState.raceFinished) { raceLoopRunning = false; return; }
  requestAnimationFrame(animateRace);
}

function startRaceLoop() {
  if (raceLoopRunning) return;
  raceLoopRunning = true;
  requestAnimationFrame(animateRace);
}

$$('.turn').forEach((turn) => {
  const activate = () => {
    $$('.turn.selected').forEach((node) => node.classList.remove('selected'));
    turn.classList.add('selected');
    const [name, note] = turnNotes[turn.dataset.turn] || [`Turn ${turn.dataset.turn}`, 'Corner note pending. The map says corner; the pit wall agrees.'];
    setTurnReadout(`Turn ${turn.dataset.turn} · ${name}`, note, NORTH_MARK);
  };
  turn.addEventListener('click', activate);
  turn.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
  });
});

$$('.driver-card').forEach((card) => card.addEventListener('click', () => {
  $$('.driver-card').forEach((item) => item.classList.remove('active-driver'));
  card.classList.add('active-driver');
  selectedDriver = card.dataset.driver;
  $$('.team-car-dot').forEach((marker) => { marker.style.opacity = marker.dataset.driver === selectedDriver ? '1' : '.35'; });
  showToast(`${selectedDriver === 'mara' ? 'Voss' : 'Navarro'} selected. Map marker highlighted.`);
}));

// The chart plots an abstract "cost" scale rather than real seconds, so the
// shape of the data survives a circuit change even though the absolute
// lap-time numbers in the driver cards do not. Which laps to plot and what
// their values are both decided in race-state.js; this only assembles the
// markup. `a` is Voss, `b` is Navarro.
function chartDataFor() {
  const pace = RACE_STATE.chartSeries('pace', raceState);
  const position = RACE_STATE.chartSeries('position', raceState);
  const sector = RACE_STATE.chartSeries('sector', raceState);
  const reference = RACE_STATE.formatLapTime(raceState.circuit.lapBase);
  return {
    pace: {
      title: RACE_STATE.chartTitleFor('pace', raceState),
      stat: () => (RACE_STATE.chartIsEmpty('pace', raceState)
        ? `<b>${reference}</b> <i>reference pace</i>`
        : `<b>${reference}</b> <i>−0.4s vs. field</i>`),
      ...pace,
    },
    position: {
      title: RACE_STATE.chartTitleFor('position', raceState),
      stat: () => '<b>P4 / P7</b> <i>both holding</i>',
      ...position,
    },
    sector: {
      title: RACE_STATE.chartTitleFor('sector', raceState),
      stat: () => '<b>−0.575s</b> <i>team delta</i>',
      ...sector,
    },
  };
}

function drawChart(mode) {
  chartMode = mode;
  const data = chartDataFor()[mode];
  $('#chartTitle').textContent = data.title;
  $('#chartStat').innerHTML = typeof data.stat === 'function' ? data.stat() : data.stat;
  $$('.chart-tab').forEach((button) => {
    const selected = button.dataset.chart === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  const width = 620, height = 145, left = 30, right = 606, top = 10;
  const gridLines = [25, 55, 85, 115].map((y) => `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`).join('');

  // Before the first lap there is nothing to plot, so show the grid and a
  // line of copy rather than two invented data points.
  if (!data.a.length) {
    $('#chartArea').innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${data.title}">${gridLines}<text class="chart-empty" x="${(left + right) / 2}" y="70" text-anchor="middle">No laps completed</text></svg>`;
    return;
  }

  // A single point has no span to divide by, so centre it.
  const span = data.labels.length - 1;
  const x = (index) => (span <= 0 ? (left + right) / 2 : left + index * ((right - left) / span));
  const points = (values) => values.map((y, i) => `${x(i)},${top + y}`).join(' ');
  const axes = data.labels.map((label, i) => `<text class="chart-axis" text-anchor="middle" x="${x(i)}" y="138">${mode === 'pace' ? `L${label}` : label}</text>`).join('');
  const markers = (values, className) => values.map((value, i) => `<circle class="${className}" cx="${x(i)}" cy="${top + value}" r="3.5"><title>${mode === 'pace' ? `Lap ${data.labels[i]}` : data.labels[i]}</title></circle>`).join('');
  $('#chartArea').innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${data.title} comparison chart">${gridLines}<polyline class="chart-line-yellow" points="${points(data.a)}"/><polyline class="chart-line-red" points="${points(data.b)}"/>${markers(data.a, 'chart-point-yellow')}${markers(data.b, 'chart-point-red')}${axes}</svg>`;
}

$$('.chart-tab').forEach((button) => button.addEventListener('click', () => drawChart(button.dataset.chart)));

$('#incidentToggle').addEventListener('click', () => {
  const button = $('#incidentToggle');
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  $('#incidentDetail').classList.toggle('open', !expanded);
});

function renderPitPlan() {
  const button = $('#pitPlan');
  button.textContent = raceState.pitPlanActive ? '✓' : '×';
  button.classList.toggle('unplanned', !raceState.pitPlanActive);
  $('.plan-badge').textContent = raceState.pitPlanActive ? 'PLAN A' : 'PLAN B?';
  $('#pitWindow').textContent = RACE_STATE.pitWindowLabel(raceState);
  // Plan A and Plan B are two separate elements, toggled with `hidden`, so
  // neither can destroy the node the other depends on.
  $('.plan-a-note').hidden = RACE_STATE.planNoteHidden(raceState, 'a');
  $('.plan-b-note').hidden = RACE_STATE.planNoteHidden(raceState, 'b');
  // Plan B means no stop: the opening stint runs to the flag, so the flag
  // clears and the window reopens.
  updateRaceReadouts(RACE_STATE.sync(raceState));
}

$('#pitPlan').addEventListener('click', () => {
  RACE_STATE.setPitPlanActive(raceState, !raceState.pitPlanActive);
  renderPitPlan();
  showToast(raceState.pitPlanActive ? 'Pit window restored. The pit wall breathes again.' : 'Plan changed. Someone has opened three spreadsheets.');
});

$('#mapReset').addEventListener('click', () => {
  if (circuitSelect.value !== 'live-spa') {
    showCircuitMap();
    showToast('Back to the live Spa map. The field is still moving.');
    return;
  }
  $$('.turn.selected').forEach((node) => node.classList.remove('selected'));
  setTurnReadout(...PICK_A_CORNER);
  $$('.team-car-dot').forEach((marker) => { marker.style.opacity = '1'; });
  showToast('Map reset. Spa remains stubbornly the same shape.');
});

$('#soundToggle').setAttribute('aria-label', 'Toggle focus mode');
$('#soundToggle').setAttribute('aria-pressed', 'false');
$('#soundToggle').title = 'Toggle focus mode';
$('#soundToggle').textContent = '◎';
$('#soundToggle').addEventListener('click', (event) => {
  document.body.classList.toggle('focus-mode');
  const active = document.body.classList.contains('focus-mode');
  event.currentTarget.classList.toggle('is-on', active);
  event.currentTarget.setAttribute('aria-pressed', String(active));
  showToast(active ? 'Focus mode on. Map and strategy have the floor.' : 'Full desk restored.');
});

$('#menuButton').addEventListener('click', (event) => {
  const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
  event.currentTarget.setAttribute('aria-expanded', String(!expanded));
  document.body.classList.toggle('nav-open', !expanded);
});

$$('.topbar a, .quick-nav a').forEach((link) => link.addEventListener('click', () => {
  document.body.classList.remove('nav-open');
  $('#menuButton').setAttribute('aria-expanded', 'false');
}));

// Boot last, so every module above has been initialised before the first
// circuit context is applied.
addFieldDots();
showCircuitMap('live-spa');
