const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let lap = 28;
let maraAge = 12;
let eliAge = 8;
let toastTimer;
let selectedDriver = 'mara';
let chartMode = 'pace';
let pitPlanActive = true;
const LAP_SECONDS = 107.228;
const ELI_LAP_SECONDS = 107.591;
const MARA_TYRE_AGE_AT_START = 12;
const ELI_TYRE_AGE_AT_START = 8;
const START_LAP = 28;
const TIME_CAP_SECONDS = 13 * 60 + 42;
const TRACK_GAP_PER_POSITION = 0.05;
let elapsedSeconds = 0;
let lastFrameTime = 0;
let lastDisplayedSecond = -1;
let raceFinished = false;

const fieldCars = [
  { position: 1, name: 'Jules Mercer', number: 1, lapSeconds: 107.14 },
  { position: 2, name: 'Alba Rossi', number: 18, lapSeconds: 107.19 },
  { position: 3, name: 'Luca Moreau', number: 4, lapSeconds: 107.20 },
  { position: 4, name: 'Mara Voss', number: 27, lapSeconds: LAP_SECONDS, driverKey: 'mara' },
  { position: 5, name: 'Theo Park', number: 81, lapSeconds: 107.25 },
  { position: 6, name: 'Felix Ward', number: 44, lapSeconds: 107.28 },
  { position: 7, name: 'Eli Navarro', number: 63, lapSeconds: ELI_LAP_SECONDS, driverKey: 'eli' },
  { position: 8, name: 'Niko Vale', number: 14, lapSeconds: 107.31 },
  { position: 9, name: 'Samir Khan', number: 22, lapSeconds: 107.18 },
  { position: 10, name: 'Iris Novak', number: 2, lapSeconds: 107.27 },
  { position: 11, name: 'Tom Bell', number: 77, lapSeconds: 107.22 },
  { position: 12, name: 'Mateo Cruz', number: 11, lapSeconds: 107.34 },
  { position: 13, name: 'Leo Hart', number: 55, lapSeconds: 107.30 },
  { position: 14, name: 'Finn Okada', number: 30, lapSeconds: 107.40 },
  { position: 15, name: 'Noah Price', number: 20, lapSeconds: 107.35 },
  { position: 16, name: 'Hugo Silva', number: 23, lapSeconds: 107.44 },
  { position: 17, name: 'Aria Laurent', number: 10, lapSeconds: 107.48 },
  { position: 18, name: 'Benji Stone', number: 31, lapSeconds: 107.52 },
  { position: 19, name: 'Milo Chen', number: 6, lapSeconds: 107.55 },
  { position: 20, name: 'Kai Morgan', number: 99, lapSeconds: 107.61 },
];

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
    const motion = document.createElementNS(svgNamespace, 'animateMotion');
    const motionPathReference = document.createElementNS(svgNamespace, 'mpath');
    const phase = ((0.37 - (driver.position - 4) * TRACK_GAP_PER_POSITION) % 1 + 1) % 1;
    const lapDuration = driver.lapSeconds / 3;
    motion.setAttribute('dur', `${lapDuration}s`);
    motion.setAttribute('begin', `-${(phase * lapDuration).toFixed(2)}s`);
    motion.setAttribute('repeatCount', 'indefinite');
    motion.setAttribute('rotate', 'auto');
    motionPathReference.setAttribute('href', '#circuitMotionPath');
    motionPathReference.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#circuitMotionPath');
    motion.append(motionPathReference);
    marker.append(motion);
    driver.marker = marker;
    markerLayer.append(marker);
  });
}

function updateRaceReadouts() {
  const previousLap = lap;
  lap = Math.min(44, START_LAP + Math.floor(elapsedSeconds / LAP_SECONDS));
  const completedLaps = lap - START_LAP;
  maraAge = MARA_TYRE_AGE_AT_START + completedLaps;
  eliAge = ELI_TYRE_AGE_AT_START + completedLaps;
  $('#lapReadout').textContent = `LAP ${lap} / 44`;
  $('#progressFill').style.width = `${(lap / 44) * 100}%`;
  $('#maraAge').textContent = `${maraAge} LAPS`;
  $('#eliAge').textContent = `${eliAge} LAPS`;
  const toStop = Math.max(31 - lap, 0);
  $('#stopCountdown').textContent = toStop ? `${toStop} lap${toStop === 1 ? '' : 's'}` : 'BOX THIS LAP';
  const timeLeft = Math.max(0, TIME_CAP_SECONDS - elapsedSeconds);
  lastDisplayedSecond = Math.floor(elapsedSeconds);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = Math.floor(timeLeft % 60);
  $('#raceClock').textContent = timeLeft > 0 ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} TO 40:00 CAP` : '40:00 TIME CAP';
  if (lap > previousLap) showToast(`Lap ${lap}. Tyres +${lap - previousLap}. Spa remains Spa.`);
  if (lap >= 44 || timeLeft <= 0) {
    raceFinished = true;
    $('.status-pill').innerHTML = '<b></b> CHEQUERED FLAG';
    $('.status-pill').style.color = 'var(--paper)';
    $('.status-pill b').style.background = 'var(--paper)';
    $('#advanceLap').textContent = lap >= 44 ? 'RACE COMPLETE' : 'TIME CAP';
    $('#advanceLap').disabled = true;
    $('#simulationState').textContent = 'CHEQUERED FLAG';
    showToast('That is the flag. Someone tell the tyres they can stop now.');
  }
}

$('#advanceLap').addEventListener('click', () => {
  if (!raceFinished && lap < 44) {
    elapsedSeconds += LAP_SECONDS;
    updateRaceReadouts();
  }
});

function animateRace(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
  lastFrameTime = timestamp;
  if (!raceFinished) {
    elapsedSeconds += delta;
    if (Math.floor(elapsedSeconds) !== lastDisplayedSecond) updateRaceReadouts();
  }
  requestAnimationFrame(animateRace);
}

addFieldDots();
updateRaceReadouts();
requestAnimationFrame(animateRace);

$$('.turn').forEach((turn) => {
  const activate = () => {
    $$('.turn.selected').forEach((node) => node.classList.remove('selected'));
    turn.classList.add('selected');
    const [name, note] = turnNotes[turn.dataset.turn] || [`Turn ${turn.dataset.turn}`, 'Corner note pending. The map says corner; the pit wall agrees.'];
    $('#turnReadout').innerHTML = `<span class="turn-readout-icon">⌖</span><span><b>Turn ${turn.dataset.turn} · ${name}</b><small>${note}</small></span><span class="map-north">N ↑</span>`;
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

const chartData = {
  pace: {
    title: 'Lap time · last 10 laps', stat: '<b>1:47.2</b> <i>−0.4s vs. field</i>',
    labels: ['19', '21', '23', '25', '27', '28'],
    a: [66, 59, 62, 45, 50, 37, 43, 27, 32, 21], b: [78, 73, 70, 77, 57, 61, 53, 55, 37, 42],
  },
  position: {
    title: 'Race position · last 10 laps', stat: '<b>P4 / P7</b> <i>both holding</i>',
    labels: ['19', '21', '23', '25', '27', '28'],
    a: [25, 25, 42, 42, 42, 42, 42, 42, 42, 42], b: [58, 58, 58, 58, 58, 58, 58, 58, 58, 58],
  },
  sector: {
    title: 'Sector pace · lap 28', stat: '<b>−0.575s</b> <i>team delta</i>',
    labels: ['S1', 'S2', 'S3'], a: [55, 49, 31], b: [61, 44, 60],
  },
};

function drawChart(mode) {
  chartMode = mode;
  const data = chartData[mode];
  $('#chartTitle').textContent = data.title;
  $('#chartStat').innerHTML = data.stat;
  const width = 620, height = 145, left = 30, right = 606, top = 10, bottom = 119;
  const x = (index) => left + index * ((right - left) / (data.labels.length - 1));
  const points = (values) => values.map((y, i) => `${x(i)},${top + y}`).join(' ');
  const gridLines = [25, 55, 85, 115].map((y) => `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`).join('');
  const axes = data.labels.map((label, i) => `<text class="chart-axis" text-anchor="middle" x="${x(i)}" y="138">${mode === 'pace' ? `L${label}` : label}</text>`).join('');
  const markers = (values, className) => values.map((value, i) => `<circle class="${className}" cx="${x(i)}" cy="${top + value}" r="3.5"><title>${mode === 'pace' ? `Lap ${data.labels[i]}` : data.labels[i]}</title></circle>`).join('');
  $('#chartArea').innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${data.title} comparison chart">${gridLines}<polyline class="chart-line-yellow" points="${points(data.a)}"/><polyline class="chart-line-red" points="${points(data.b)}"/>${markers(data.a, 'chart-point-yellow')}${markers(data.b, 'chart-point-red')}${axes}</svg>`;
  $$('.chart-tab').forEach((button) => {
    const selected = button.dataset.chart === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

$$('.chart-tab').forEach((button) => button.addEventListener('click', () => drawChart(button.dataset.chart)));
drawChart('pace');

$('#incidentToggle').addEventListener('click', () => {
  const button = $('#incidentToggle');
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  $('#incidentDetail').classList.toggle('open', !expanded);
});

$('#pitPlan').addEventListener('click', () => {
  pitPlanActive = !pitPlanActive;
  const button = $('#pitPlan');
  button.textContent = pitPlanActive ? '✓' : '×';
  button.classList.toggle('unplanned', !pitPlanActive);
  $('.plan-badge').textContent = pitPlanActive ? 'PLAN A' : 'PLAN B?';
  $('.strategy-note b').textContent = pitPlanActive ? 'Box window: laps 31–33' : 'Pit window removed';
  $('.strategy-note small').innerHTML = pitPlanActive ? 'Next stop in <strong id="stopCountdown">3 laps</strong>. Hold position, keep it tidy.' : '<strong>Fresh look required.</strong> Wall says: maybe stay out.';
  showToast(pitPlanActive ? 'Pit window restored. The pit wall breathes again.' : 'Plan changed. Someone has opened three spreadsheets.');
});

$('#mapReset').addEventListener('click', () => {
  $$('.turn.selected').forEach((node) => node.classList.remove('selected'));
  $('#turnReadout').innerHTML = '<span class="turn-readout-icon">⌖</span><span><b>Pick a corner</b><small>Tap a turn marker for the engineer\'s note.</small></span><span class="map-north">N ↑</span>';
  $$('.team-car-dot').forEach((marker) => { marker.style.opacity = '1'; });
  showToast('Map reset. Spa remains stubbornly the same shape.');
});

$('#soundToggle').setAttribute('aria-label', 'Toggle focus mode');
$('#soundToggle').title = 'Toggle focus mode';
$('#soundToggle').textContent = '◎';
$('#soundToggle').addEventListener('click', (event) => {
  document.body.classList.toggle('focus-mode');
  const active = document.body.classList.contains('focus-mode');
  event.currentTarget.classList.toggle('is-on', active);
  showToast(active ? 'Focus mode on. Map and strategy have the floor.' : 'Full desk restored.');
});

$('#menuButton').addEventListener('click', (event) => {
  const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
  event.currentTarget.setAttribute('aria-expanded', String(!expanded));
  document.body.classList.toggle('nav-open', !expanded);
});

$$('.topbar a, .brand').forEach((link) => link.addEventListener('click', () => {
  document.body.classList.remove('nav-open');
  $('#menuButton').setAttribute('aria-expanded', 'false');
}));
