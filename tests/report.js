// Prints the working weights per scenario, so you (or another chatbot) can eyeball the progression.
//   node tests/report.js
const { simulate, weights } = require('./sim.js');
const LIFTS = ['incline-db-press', 'cable-row', 'neutral-pulldown', 'hip-thrust-machine', 'lateral-raise', 'incline-curl'];
const SCENARIOS = {
  'steady (hits 85%, +1%/wk)': {},
  'strong (hits 95%, +2%/wk)': { hitRate: 0.95, gainPerWk: 0.02 },
  'Mondays only': { days: [1] },
  '"Too hard" on every set': { fb: 'hard' },
  'run down (-4%/wk)': { gainPerWk: -0.04, hitRate: 0.5 },
  '3-week break (wk 6-8)': { skipWeeks: [5, 6, 7] }
};
for (const [name, o] of Object.entries(SCENARIOS)) {
  const { log, res } = simulate(o);
  console.log(`\n== ${name}: ${log.length} workouts, ${Math.round(res.cumKm)} km, easier week offered: ${res.fatigue.offer}`);
  console.log('   modes: ' + log.map(s => s.mode[0]).join(''));
  for (const ex of LIFTS) console.log('   ' + ex.padEnd(19) + 'Heavy: ' + weights(log, ex, 'A').join(' ') + '  |  Volume: ' + weights(log, ex, 'B').join(' '));
}
