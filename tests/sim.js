// A simulated athlete for the scenario tests.
// Workouts go through FlightCore.applyOp, the same path the Sheet backend uses, so the tests
// exercise the real save → replay → plan loop rather than a copy of it.
global.FlightEngine = require('../web/engine.js');
const C = require('../web/core.js');
const E = global.FlightEngine;

// Starting one-rep-max guesses per exercise (in the kg the app shows, e.g. per hand).
const START_1RM = {
  'back-squat': 45, 'incline-db-press': 12, 'lat-pulldown': 38, 'cable-row': 40,
  'lateral-raise': 6, 'cable-crunch': 30, 'incline-curl': 9, 'rope-pressdown': 18
};

function rng(seed) { // small deterministic PRNG so failures reproduce
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function newData() {
  const data = {};
  Object.keys(C.TABS).forEach(t => { data[C.KEY[t]] = []; });
  data.settings = {};
  C.seedSettings({ athleteKey: 'a'.repeat(24), coachKey: 'c'.repeat(24), coachEmail: '' })
    .forEach(r => { data.settings[r.key] = r.value; });
  data.slots = C.seedSlots();
  data.exercises = C.seedExercises();
  data.postcards = C.seedPostcards();
  return data;
}

const result = data => E.replay(C.toEngineInput(data));

/**
 * Runs `weeks` of training.
 *  hitRate   chance each set reaches its target (else falls 1–2 short)
 *  gainPerWk true strength gain per week (0.01 = +1%); negative = run down
 *  days      which weekdays she trains: [1, 5] = Mon + Fri
 *  fb        feedback tapped on every set ('', 'easy', 'ok', 'hard')
 *  skipWeeks week indexes with no training (a break)
 */
function simulate(o = {}) {
  const opt = Object.assign({ seed: 1, weeks: 12, hitRate: 0.85, gainPerWk: 0.01, days: [1, 5], fb: '', skipWeeks: [] }, o);
  const rand = rng(opt.seed);
  const data = opt.data || newData();
  const true1rm = Object.assign({}, START_1RM);
  const log = []; // { date, day, mode, items: [{ ex, kg, targets, reps }] }
  let date = data.settings.startDate;

  for (let w = 0; w < opt.weeks; w++) {
    for (let d = 0; d < 7; d++, date = E.addDays(date, 1)) {
      if (opt.skipWeeks.includes(w) || !opt.days.includes(E.weekday(date))) continue;
      const res = result(data);
      const p = E.plan(res, date);
      const sets = [], entry = { date, day: p.day, mode: p.mode, items: [] };
      p.items.forEach(it => {
        const ex = it.exercise.id, rm = true1rm[ex] || 20;
        const step = Number(it.exercise.stepKg) || 1;
        // First time (no weight given): she picks one she can do the bottom of the range with.
        const kg = it.kg != null ? it.kg : Math.max(step, Math.round(rm / (1 + (it.min + 2) / 30) / step) * step);
        const can = Math.max(1, Math.floor(30 * (rm / kg - 1))); // Epley, reps to failure
        const done = [];
        it.targets.forEach((t, i) => {
          const hit = rand() < opt.hitRate;
          // a test set (last set of the test week, or after "Too easy"): keep going while 1–2 reps are left
          const test = it.calibrate && i === it.targets.length - 1;
          const reps = test ? Math.max(1, can - i - (hit ? 1 : 2))
            : Math.max(1, Math.min(can - i, hit ? t : t - 1 - Math.floor(rand() * 2)));
          done.push(reps);
          sets.push({ slot: it.slot, ex, set: i + 1, kg, reps, done: true, fb: opt.fb, rir: it.rir[i], target: t });
        });
        entry.items.push({ ex, kg, targets: it.targets, reps: done });
      });
      const out = C.applyOp(data, { type: 'saveSession', session: { id: date + p.day, date, day: p.day, effort: 3, sets } },
        'athlete', date + 'T18:00:00Z');
      if (!out) throw new Error('saveSession returned nothing');
      log.push(entry);
    }
    Object.keys(true1rm).forEach(k => { true1rm[k] *= 1 + opt.gainPerWk; });
  }
  return { data, log, res: result(data), nextDate: date };
}

/** Working weights for one exercise on one day ('A' or 'B'), in order. */
const weights = (log, ex, day) => log.filter(s => !day || s.day === day)
  .map(s => (s.items.find(i => i.ex === ex) || {}).kg).filter(k => k != null);

module.exports = { simulate, newData, result, weights, START_1RM, C, E };
