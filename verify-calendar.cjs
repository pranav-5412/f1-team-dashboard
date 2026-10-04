// Cross-check circuits-data.js against the published 2026 F1 calendar.
// Source of truth: the 2026 FIA Formula One World Championship calendar
// (Wikipedia, sourced to the FIA/WMSC release) as of 28 Sep 2026.
//
// Official round order matters: the original 24-round calendar lost the Saudi
// and Bahrain April rounds to the Iran war, and the Bahrain race was reinstated
// as a Malaysia-hosted event in October, so rounds 4+ shifted down by two.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'circuits-data.js'), 'utf8');
const records = src.split('\n')
  .filter((l) => l.trim().startsWith('{ slug:'))
  .map((line) => {
    const body = line.replace(/,\s*$/, '');
    const field = (name) => {
      const m = body.match(new RegExp(`${name}: '([^']*)'`));
      if (m) return m[1];
      const n = body.match(new RegExp(`${name}: ([\\d.]+)`));
      return n ? Number(n[1]) : undefined;
    };
    return {
      slug: (body.match(/slug: '([^']+)'/) || [])[1],
      name: field('name'),
      length: field('length'),
      laps: field('laps'),
      date: field('date'),
    };
  });

// round, official GP name, circuit, length km, laps, race date (2026)
const OFFICIAL = [
  [1, 'Australian Grand Prix', 'Albert Park, Melbourne', 5.278, 58, '2026-03-08'],
  [2, 'Chinese Grand Prix', 'Shanghai International Circuit', 5.451, 56, '2026-03-15'],
  [3, 'Japanese Grand Prix', 'Suzuka Circuit', 5.807, 53, '2026-03-29'],
  [4, 'Miami Grand Prix', 'Miami International Autodrome', 5.412, 57, '2026-05-03'],
  [5, 'Canadian Grand Prix', 'Circuit Gilles Villeneuve, Montreal', 4.361, 70, '2026-05-24'],
  [6, 'Monaco Grand Prix', 'Circuit de Monaco', 3.337, 78, '2026-06-07'],
  [7, 'Barcelona-Catalunya Grand Prix', 'Circuit de Barcelona-Catalunya', 4.657, 66, '2026-06-14'],
  [8, 'Austrian Grand Prix', 'Red Bull Ring, Spielberg', 4.326, 71, '2026-06-28'],
  [9, 'British Grand Prix', 'Silverstone Circuit', 5.891, 52, '2026-07-05'],
  [10, 'Belgian Grand Prix', 'Spa-Francorchamps', 7.004, 44, '2026-07-19'],
  [11, 'Hungarian Grand Prix', 'Hungaroring', 4.381, 70, '2026-07-26'],
  [12, 'Dutch Grand Prix', 'Circuit Zandvoort', 4.259, 72, '2026-08-23'],
  [13, 'Italian Grand Prix', 'Monza Circuit', 5.793, 53, '2026-09-06'],
  [14, 'Spanish Grand Prix', 'Madring, Madrid', 5.414, 57, '2026-09-13'],
  [15, 'Azerbaijan Grand Prix', 'Baku City Circuit', 6.003, 51, '2026-09-26'],
  [16, 'Bahrain Grand Prix', 'Sepang International Circuit', 5.543, 56, '2026-10-04'],
  [17, 'Singapore Grand Prix', 'Marina Bay Street Circuit', 4.927, 62, '2026-10-11'],
  [18, 'United States Grand Prix', 'Circuit of the Americas, Austin', 5.513, 56, '2026-10-25'],
  [19, 'Mexico City Grand Prix', 'Autodromo Hermanos Rodriguez', 4.304, 71, '2026-11-01'],
  [20, 'Sao Paulo Grand Prix', 'Interlagos Circuit', 4.309, 71, '2026-11-08'],
  [21, 'Las Vegas Grand Prix', 'Las Vegas Strip Circuit', 6.201, 50, '2026-11-21'],
  [22, 'Qatar Grand Prix', 'Lusail International Circuit', 5.419, 57, '2026-11-29'],
  [23, 'Abu Dhabi Grand Prix', 'Yas Marina Circuit', 5.281, 58, '2026-12-06'],
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const problems = [];

if (records.length !== OFFICIAL.length) {
  problems.push(`circuit count is ${records.length}, official calendar has ${OFFICIAL.length}`);
}

OFFICIAL.forEach(([round, gp, circuit, km, laps, iso], i) => {
  const rec = records[i];
  if (!rec) {
    problems.push(`round ${round} (${gp}) has no record`);
    return;
  }
  const when = new Date(`${iso}T12:00:00Z`);
  const weekday = DAYS[when.getUTCDay()];
  const longDate = `${weekday}, ${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}`;

  if (rec.date !== longDate) {
    problems.push(`round ${round} ${rec.slug}: date is "${rec.date}", official is "${longDate}" (${iso}, a ${weekday})`);
  }
  if (Math.abs(parseFloat(rec.length) - km) > 0.0015) {
    problems.push(`round ${round} ${rec.slug}: length ${rec.length} vs official ${km}km`);
  }
  if (rec.laps !== laps) {
    problems.push(`round ${round} ${rec.slug}: ${rec.laps} laps vs official ${laps}`);
  }
  // Most rounds are on a Sunday, but not all: in 2026 Azerbaijan moved to a
  // Saturday for Remembrance Day and Las Vegas is a Saturday too. The check is
  // that our copy names the weekday the date actually falls on.
  if (weekday !== 'Sunday' && !rec.date.startsWith(weekday)) {
    problems.push(`round ${round} ${rec.slug}: ${iso} is a ${weekday} but the copy does not say so`);
  }
});

const saturdayRounds = OFFICIAL
  .filter(([, , , , , iso]) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 6)
  .map(([round, gp]) => `${round} ${gp}`);

console.log(`records in file : ${records.length}`);
console.log(`official rounds : ${OFFICIAL.length}`);
console.log(`saturday races  : ${saturdayRounds.join(', ') || 'none'}`);
console.log('');
if (problems.length === 0) {
  console.log('calendar matches');
} else {
  problems.forEach((p) => console.log(`  ${p}`));
  console.log(`\n${problems.length} discrepancy(ies)`);
  process.exitCode = 1;
}
