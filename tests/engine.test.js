// Scenario tests for the progression engine and the core data layer.
// They pin the behaviour we want, not exact numbers, so small tuning changes don't break them.
// To see the numbers behind a scenario: node tests/report.js
const test = require('node:test');
const assert = require('node:assert');
const { simulate, newData, result, weights, C, E } = require('./sim.js');

const BIG = ['incline-db-press', 'cable-row', 'hip-thrust-machine'];
const first = a => a[0];
const last = a => a[a.length - 1];
const SEEDS = [1, 2, 3];

test('first plan: intro week, Heavy day, no weights until she picks them', () => {
  const p = E.plan(result(newData()), '2026-11-23');
  assert.strictEqual(p.day, 'A');
  assert.strictEqual(p.mode, 'intro');
  assert.ok(p.items.length >= 6);
  p.items.forEach(it => assert.ok(it.targets.length === it.sets && it.targets.every(t => t >= it.min && t <= it.max)));
});

test('steady athlete: big lifts get heavier on both days within 12 weeks', () => {
  for (const seed of SEEDS) {
    const { log } = simulate({ seed });
    for (const ex of BIG) for (const day of ['A', 'B']) {
      const w = weights(log, ex, day);
      assert.ok(last(w) > first(w), `seed ${seed} ${ex} day ${day}: ${w.join(' ')}`);
    }
  }
});

test('steady athlete: no easier week offered', () => {
  for (const seed of SEEDS) assert.strictEqual(simulate({ seed }).res.fatigue.offer, false, `seed ${seed}`);
});

test('Heavy day is heavier than Volume day', () => {
  const { log } = simulate({ seed: 1 });
  for (const ex of BIG) assert.ok(last(weights(log, ex, 'A')) >= last(weights(log, ex, 'B')), ex);
});

test('Mondays only: still progresses (A/B keeps alternating)', () => {
  const { log } = simulate({ seed: 1, days: [1] });
  assert.deepStrictEqual(log.slice(0, 4).map(s => s.day), ['A', 'B', 'A', 'B']);
  const gained = BIG.filter(ex => last(weights(log, ex, 'A')) > first(weights(log, ex, 'A')));
  assert.ok(gained.length >= 2, 'only ' + gained.join(', '));
});

test('"Too hard" on every set never progresses faster than normal', () => {
  for (const seed of SEEDS) {
    const hard = simulate({ seed, fb: 'hard' }).log, normal = simulate({ seed }).log;
    for (const ex of BIG) assert.ok(last(weights(hard, ex, 'A')) <= last(weights(normal, ex, 'A')), `seed ${seed} ${ex}`);
  }
});

test('run down: weights come down and an easier week is offered', () => {
  const { log, res } = simulate({ seed: 1, gainPerWk: -0.04, hitRate: 0.5 });
  assert.strictEqual(res.fatigue.offer, true);
  for (const ex of BIG) assert.ok(last(weights(log, ex, 'A')) < first(weights(log, ex, 'A')), ex);
});

test('break of 3 weeks: first workout back is gentler, then normal again', () => {
  const { log } = simulate({ seed: 1, skipWeeks: [5, 6, 7] });
  const i = log.findIndex(s => s.mode === 'back');
  assert.ok(i > 0, 'no "back" workout: ' + log.map(s => s.mode).join(','));
  assert.ok(log[i - 1].date < E.addDays(log[i].date, -14));
  assert.strictEqual(last(log).mode, 'normal');
});

test('flight: km only goes up and stays within the route', () => {
  const { res } = simulate({ seed: 1, weeks: 20 });
  let prev = 0;
  res.sessions.forEach(s => { assert.ok(s.cumKm >= prev); prev = s.cumKm; });
  assert.ok(res.cumKm > 0 && res.cumKm <= res.settings.routeKm + 1e-6);
});

test('replay is deterministic: same data, same result', () => {
  const a = simulate({ seed: 7 }), b = simulate({ seed: 7 });
  assert.deepStrictEqual(a.log, b.log);
  assert.strictEqual(JSON.stringify(result(a.data).sessions), JSON.stringify(a.res.sessions));
});

test('athlete cannot do coach actions', () => {
  for (const type of ['override', 'cheer', 'react']) {
    assert.throws(() => C.applyOp(newData(), { type, date: '2026-11-23', exercise: 'cable-row', kg: 30, text: 'x', sessionId: 'x' },
      'athlete', '2026-11-23T10:00:00Z'), /not allowed/);
  }
});

test('invalid sessions are rejected', () => {
  assert.throws(() => C.applyOp(newData(), { type: 'saveSession', session: { id: 'x', date: 'bad', day: 'A' } }, 'athlete', 'x'), /invalid/);
  assert.throws(() => C.applyOp(newData(), { type: 'saveSession', session: { id: 'x', date: '2026-11-23', day: 'C' } }, 'athlete', 'x'), /invalid/);
});

test('state sent to either phone never contains the secret keys', () => {
  const d = newData();
  for (const role of ['athlete', 'coach']) {
    const s = JSON.stringify(C.buildState(d, role, '2026-11-23'));
    assert.ok(!s.includes(d.settings.athleteKey) && !s.includes(d.settings.coachKey), role);
  }
});

// ---------- engine v5: no yo-yo, small lifts move, hold once after an increase ----------
const LIFTS = ['incline-db-press', 'cable-row', 'neutral-pulldown', 'hip-thrust-machine', 'lateral-raise', 'incline-curl'];

test('steady athlete: a weight never goes up and straight back down', () => {
  for (const seed of SEEDS) {
    const { log } = simulate({ seed, weeks: 16 });
    for (const ex of LIFTS) for (const day of ['A', 'B']) {
      const w = weights(log, ex, day);
      for (let i = 1; i < w.length - 1; i++) {
        assert.ok(!(w[i] > w[i - 1] && w[i + 1] < w[i]), `seed ${seed} ${ex} day ${day}: ${w.join(' ')}`);
      }
    }
  }
});

test('small lifts (raises, curls) get heavier', () => {
  for (const seed of SEEDS) {
    const strong = simulate({ seed, hitRate: 0.95, gainPerWk: 0.02 }).log;
    const steady = simulate({ seed, weeks: 16 }).log;
    for (const ex of ['lateral-raise', 'incline-curl']) {
      assert.ok(last(weights(strong, ex, 'A')) > first(weights(strong, ex, 'A')), `strong seed ${seed} ${ex}`);
      assert.ok(last(weights(steady, ex, 'A')) > first(weights(steady, ex, 'A')), `steady seed ${seed} ${ex}`);
    }
  }
});

test('"Too hard" on every set for weeks: an easier week is offered', () => {
  assert.strictEqual(simulate({ seed: 1, fb: 'hard' }).res.fatigue.offer, true);
});

test('after an increase: one miss holds the new weight, a second miss drops it', () => {
  const data = newData();
  const chestSets = (date, kg, reps) => ({ id: date + 'A', date, day: 'A', effort: 3,
    sets: reps.map((r, i) => ({ slot: 'chest', ex: 'incline-db-press', set: i + 1, kg, reps: r, done: true, rir: '1', target: 4 })) });
  const save = s => C.applyOp(data, { type: 'saveSession', session: s }, 'athlete', s.date + 'T18:00:00Z');
  const chest = date => E.plan(result(data), date, 'A').items.find(it => it.slot === 'chest');

  save(chestSets('2026-11-30', 10, [6, 6, 6, 6]));             // top of the range on every set
  assert.strictEqual(chest('2026-12-07').kg, 11);
  save(chestSets('2026-12-07', 11, [2, 2, 2, 1]));              // a rough first day at the new weight
  const held = chest('2026-12-14');
  assert.strictEqual(held.kg, 11);
  assert.strictEqual(held.held, true);
  save(chestSets('2026-12-14', 11, [2, 2, 2, 1]));              // still not there
  assert.ok(chest('2026-12-21').kg < 11);
});

test('chest is locked to the incline dumbbell press; glutes can be a Bulgarian split squat', () => {
  const p = E.plan(result(newData()), '2026-11-30', 'A');
  const chest = p.items.find(it => it.slot === 'chest'), glutes = p.items.find(it => it.slot === 'glutes');
  assert.deepStrictEqual(chest.options.map(o => o.exercise.id), ['incline-db-press']);
  assert.ok(glutes.options.some(o => o.exercise.id === 'bulgarian-split-squat'));
  assert.ok(glutes.options.find(o => o.exercise.id === 'bulgarian-split-squat').rir.every(r => r !== '0'));
});

test('upgrade retires the other chest options in an existing Sheet', () => {
  const data = newData();
  data.exercises.push({ id: 'incline-smith-press', slot: 'chest', name: 'Incline Smith machine press', rank: 2, active: true });
  const w = C.exerciseSync(data);
  assert.ok(w.some(x => x.value === 'incline-smith-press' && x.patch && x.patch.active === false));
  assert.ok(!w.some(x => x.kind === 'append' && x.row.id === 'incline-smith-press'));
});

// ---------- postcard replies ----------
test('postcard replies: only on delivered cards, by her, and the coach gets an email', () => {
  const { data } = simulate({ seed: 1, weeks: 3 });
  const st = C.buildState(data, 'athlete', '2026-12-14');
  data.postcards.forEach(p => { p.message = 'Hei!'; });
  const res = result(data);
  const delivered = data.postcards.find(p => Number(p.km) <= res.cumKm);
  const sealed = data.postcards.find(p => Number(p.km) > res.cumKm);
  assert.ok(delivered && sealed && st);
  const out = C.applyOp(data, { type: 'postcardReply', id: delivered.id, emoji: '🥰', text: 'Miss you' }, 'athlete', '2026-12-14T10:00:00Z');
  assert.strictEqual(delivered.replyText, 'Miss you');
  assert.ok(out.notify && /replied/.test(out.notify.subject) && /Miss you/.test(out.notify.body));
  const card = C.buildState(data, 'coach', '2026-12-14').postcards.find(c => c.id === delivered.id);
  assert.strictEqual(card.replyEmoji, '🥰');
  assert.throws(() => C.applyOp(data, { type: 'postcardReply', id: sealed.id, emoji: '❤️' }, 'athlete', 'x'), /not delivered/);
  assert.throws(() => C.applyOp(data, { type: 'postcardReply', id: delivered.id, emoji: '', text: ' ' }, 'athlete', 'x'), /invalid/);
  assert.throws(() => C.applyOp(data, { type: 'postcardReply', id: delivered.id, emoji: '❤️' }, 'coach', 'x'), /not allowed/);
});
