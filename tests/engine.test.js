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
