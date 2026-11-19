// Scenario tests for the progression engine and the core data layer.
// They pin the behaviour we want, not exact numbers, so small tuning changes don't break them.
// To see the numbers behind a scenario: node tests/report.js
const test = require('node:test');
const assert = require('node:assert');
const { simulate, newData, result, weights, C, E } = require('./sim.js');

const BIG = ['back-squat', 'incline-db-press', 'lat-pulldown'];
const first = a => a[0];
const last = a => a[a.length - 1];
const SEEDS = [1, 2, 3];

test('first plan: no test week, a normal Day A; she picks the weights and the last set is a test set', () => {
  const p = E.plan(result(newData()), '2026-11-23');
  assert.strictEqual(p.day, 'A');
  assert.strictEqual(p.mode, 'normal');
  assert.strictEqual(p.setsTotal, 19);
  p.items.forEach(it => {
    assert.strictEqual(it.sets, it.main ? 3 : 2, it.slot);                                      // every set
    assert.ok(it.taxi && it.targets.length === it.sets && it.targets.every(t => t >= it.min && t <= it.max), it.slot);
    assert.ok(it.rir.every(r => r === (it.exercise.id === 'back-squat' ? '1–2' : '1')), it.slot); // a normal, hard workout
    assert.strictEqual(it.calibrate, true, it.slot);                                             // first time: test set
  });
});

test('main lifts get heavier: all three for a strong athlete, most of them for a steady one', () => {
  for (const seed of SEEDS) {
    const strong = simulate({ seed, hitRate: 0.95, gainPerWk: 0.02 }).log, steady = simulate({ seed });
    for (const ex of BIG) assert.ok(last(weights(strong, ex)) > first(weights(strong, ex)), `strong seed ${seed} ${ex}: ${weights(strong, ex).join(' ')}`);
    const gained = BIG.filter(ex => last(weights(steady.log, ex)) > first(weights(steady.log, ex)));
    assert.ok(gained.length >= 2, `steady seed ${seed}: only ${gained.join(', ')}`);
    for (const ex of BIG) assert.ok(E.strengthChange(steady.res, ex).change > 0.03, `steady seed ${seed} ${ex}: strength estimate`);
  }
});

test('steady athlete: no easier week offered', () => {
  for (const seed of SEEDS) assert.strictEqual(simulate({ seed }).res.fatigue.offer, false, `seed ${seed}`);
});

test('same range on both days: one working weight per lift, Day B carries on from Day A', () => {
  const { log, res } = simulate({ seed: 1 });
  for (const ex of BIG) assert.strictEqual(res.states[ex + '|A'], res.states[ex + '|B'], ex);
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1].items.find(x => x.ex === 'lat-pulldown'), b = log[i].items.find(x => x.ex === 'lat-pulldown');
    if (log[i].mode !== 'normal' || a.reps.some(r => r < 12) || a.kg !== b.kg) continue;
    assert.fail('all sets at the top but the next workout (other day) kept the weight: ' + log[i].date);
  }
});

test('Mondays only: still progresses (A/B keeps alternating)', () => {
  const { log } = simulate({ seed: 1, days: [1] });
  assert.deepStrictEqual(log.slice(0, 4).map(s => s.day), ['A', 'B', 'A', 'B']);
  const gained = BIG.filter(ex => last(weights(log, ex)) > first(weights(log, ex)));
  assert.ok(gained.length >= 1, 'none of the main lifts got heavier');
});

test('"Too hard" on every set never progresses faster than normal', () => {
  for (const seed of SEEDS) {
    const hard = simulate({ seed, fb: 'hard' }).log, normal = simulate({ seed }).log;
    for (const ex of BIG) assert.ok(last(weights(hard, ex)) <= last(weights(normal, ex)), `seed ${seed} ${ex}`);
  }
});

test('run down: weights come down and an easier week is offered', () => {
  const { log } = simulate({ seed: 1, gainPerWk: -0.04, hitRate: 0.5 });
  assert.ok([6, 8, 10].some(w => simulate({ seed: 1, gainPerWk: -0.04, hitRate: 0.5, weeks: w }).res.fatigue.offer));
  for (const ex of BIG) assert.ok(last(weights(log, ex)) < first(weights(log, ex)), ex);
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

// ---------- no yo-yo, small lifts move, hold once after an increase ----------
const LIFTS = ['back-squat', 'incline-db-press', 'lat-pulldown', 'cable-row', 'lateral-raise', 'incline-curl'];

test('steady athlete: a weight never goes up and straight back down', () => {
  for (const seed of SEEDS) {
    const { log } = simulate({ seed, weeks: 16 });
    for (const ex of LIFTS) {
      const w = weights(log, ex);
      for (let i = 1; i < w.length - 1; i++) {
        assert.ok(!(w[i] > w[i - 1] && w[i + 1] < w[i]), `seed ${seed} ${ex}: ${w.join(' ')}`);
      }
    }
  }
});

test('small lifts (raises, curls) get heavier', () => {
  for (const seed of SEEDS) {
    const strong = simulate({ seed, hitRate: 0.95, gainPerWk: 0.02 }).log;
    const steady = simulate({ seed, weeks: 16 }).log;
    for (const ex of ['lateral-raise', 'incline-curl']) {
      assert.ok(last(weights(strong, ex)) > first(weights(strong, ex)), `strong seed ${seed} ${ex}`);
      assert.ok(last(weights(steady, ex)) > first(weights(steady, ex)), `steady seed ${seed} ${ex}`);
    }
  }
});

test('"Too hard" on every set for weeks: an easier week is offered', () => {
  assert.strictEqual(simulate({ seed: 1, fb: 'hard' }).res.fatigue.offer, true);
});

test('after an increase: one miss holds the new weight, a second miss drops it', () => {
  const data = newData();
  const chestSets = (date, kg, reps) => ({ id: date + 'A', date, day: 'A', effort: 3,
    sets: reps.map((r, i) => ({ slot: 'chest', ex: 'incline-db-press', set: i + 1, kg, reps: r, done: true, rir: '1', target: 12 })) });
  const save = s => C.applyOp(data, { type: 'saveSession', session: s }, 'athlete', s.date + 'T18:00:00Z');
  const chest = date => E.plan(result(data), date, 'A').items.find(it => it.slot === 'chest');

  save(chestSets('2026-11-30', 10, [12, 12, 12]));            // top of the range on every set
  assert.strictEqual(chest('2026-12-03').kg, 11);
  save(chestSets('2026-12-03', 11, [5, 5, 4]));               // a rough first day at the new weight
  const held = chest('2026-12-07');
  assert.strictEqual(held.kg, 11);
  assert.strictEqual(held.held, true);
  save(chestSets('2026-12-07', 11, [5, 5, 4]));               // still not there
  assert.ok(chest('2026-12-10').kg < 11);
});

test('forced progression: one more rep on every set, more weight once every set is at the top', () => {
  const data = newData();
  const save = (date, day, kg, reps, rir) => C.applyOp(data, { type: 'saveSession', session: { id: date + day, date, day, effort: 3,
    sets: reps.map((r, i) => ({ slot: 'lats', ex: 'lat-pulldown', set: i + 1, kg, reps: r, done: true, rir: rir || '1', target: 0 })) } },
    'athlete', date + 'T18:00:00Z');
  const lats = (date, day) => E.plan(result(data), date, day).items.find(it => it.slot === 'lats');
  save('2026-11-30', 'A', 30, [10, 9, 9]);
  let p = lats('2026-12-03', 'B');                             // the other day carries on from it
  assert.deepStrictEqual([p.kg, p.targets], [30, [11, 10, 10]]);
  save('2026-12-03', 'B', 30, [12, 12, 11]);
  assert.deepStrictEqual(lats('2026-12-07', 'A').targets, [12, 12, 12]);
  save('2026-12-07', 'A', 30, [12, 12, 12]);
  p = lats('2026-12-10', 'B');
  assert.strictEqual(p.kg, 32.5);
  assert.ok(p.targets.every(t => t >= 8 && t <= 10), p.targets.join(','));
});

test('the first workout sets the weights: a strong test set means heavier next time, otherwise one more rep', () => {
  const run = testReps => {
    const data = newData();
    C.applyOp(data, { type: 'saveSession', session: { id: 't', date: '2026-11-23', day: 'A', effort: 3,
      sets: testReps.map((r, i) => ({ slot: 'chest', ex: 'incline-db-press', set: i + 1, kg: 10, reps: r, done: true, rir: '1', target: 10 })) } },
      'athlete', '2026-11-23T18:00:00Z');
    const it = E.plan(result(data), '2026-11-26', 'B').items.find(x => x.slot === 'chest');
    assert.strictEqual(it.calibrate, false);                    // only the first time
    return it;
  };
  const strong = run([10, 10, 16]);
  assert.ok(strong.kg > 10, 'after a strong test set: ' + strong.kg);
  const ok = run([10, 10, 10]);
  assert.deepStrictEqual([ok.kg, ok.targets], [10, [11, 11, 11]]);
});

test('the program: three main lifts first, the same workout on both days, accessories to vary', () => {
  const res = result(newData());
  const a = E.plan(res, '2026-11-30', 'A'), b = E.plan(res, '2026-11-30', 'B');
  assert.deepStrictEqual(a.items.map(it => it.slot), b.items.map(it => it.slot));
  assert.deepStrictEqual(a.items.slice(0, 3).map(it => it.exercise.id), ['back-squat', 'incline-db-press', 'lat-pulldown']);
  assert.ok(a.items.slice(0, 3).every(it => it.main && it.sets === 3 && it.min === 8 && it.max === 12));
  assert.ok(a.items.slice(3).every(it => !it.main && it.sets === 2 && it.options.length >= 2));
  assert.deepStrictEqual(a.items[1].options.map(o => o.exercise.id), ['incline-db-press', 'incline-bb-press']);
  assert.ok(a.items[0].options.some(o => o.exercise.id === 'leg-press') && a.items[0].options.some(o => o.exercise.id === 'hack-squat'));
  assert.ok(a.items[0].rir.every(r => r !== '0' && r !== '0–1'));
  assert.ok(!a.items.some(it => it.slot === 'glutes'));
});

test('accessories can differ per day: a Day B choice leaves Day A alone', () => {
  const data = newData();
  C.applyOp(data, { type: 'choice', slot: 'biceps', day: 'B', ex: 'cable-curl', at: '2026-11-20T10:00:00Z' }, 'athlete', '2026-11-20T10:00:00Z');
  const res = result(data);
  assert.strictEqual(E.plan(res, '2026-11-30', 'A').items.find(it => it.slot === 'biceps').exercise.id, 'incline-curl');
  assert.strictEqual(E.plan(res, '2026-11-30', 'B').items.find(it => it.slot === 'biceps').exercise.id, 'cable-curl');
});

test('upgrade retires the other chest options in an existing Sheet', () => {
  const data = newData();
  data.exercises.push({ id: 'incline-smith-press', slot: 'chest', name: 'Incline Smith machine press', rank: 2, active: true });
  const w = C.exerciseSync(data);
  assert.ok(w.some(x => x.value === 'incline-smith-press' && x.patch && x.patch.active === false));
  assert.ok(!w.some(x => x.kind === 'append' && x.row.id === 'incline-smith-press'));
});

test('program sync: an old Sheet gets the new program once, a new one is left alone', () => {
  const old = newData();
  delete old.settings.programVersion;
  old.slots = [{ slot: 'chest', muscle: 'Chest', setsA: 4, repMinA: 4, repMaxA: 6, active: true }, { slot: 'glutes', muscle: 'Glutes', active: true }];
  old.exercises = [{ id: 'incline-bb-press', slot: 'chest', name: 'Incline barbell press', rank: 3, stepKg: 5, active: false }];
  const w = C.programSync(old);
  const chest = w.find(x => x.tab === 'Slots' && x.value === 'chest');
  assert.deepStrictEqual([chest.patch.setsA, chest.patch.repMinA, chest.patch.repMaxA, chest.patch.main], [3, 8, 12, true]);
  assert.ok(w.some(x => x.tab === 'Slots' && x.kind === 'append' && x.row.slot === 'legs'));
  assert.ok(w.some(x => x.tab === 'Slots' && x.value === 'glutes' && x.patch.active === false));
  const bb = w.find(x => x.tab === 'Exercises' && x.value === 'incline-bb-press');
  assert.ok(bb.patch.active === true && bb.patch.rank === 2 && !('stepKg' in bb.patch));   // gym steps are kept
  assert.ok(w.some(x => x.kind === 'setting' && x.key === 'programVersion' && x.value === C.PROGRAM_VERSION));
  assert.deepStrictEqual(C.programSync(newData()), []);
  assert.ok(!C.exerciseSync(old).some(x => x.value === 'incline-bb-press' && x.patch && x.patch.active === false));
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

// ---------- two answers ----------
test('two answers: each sees the other\'s answer only after answering the same day', () => {
  const data = newData();
  const today = '2026-11-20';
  const q = C.questionFor(data, today);
  assert.ok(q && typeof q === 'string');
  C.applyOp(data, { type: 'answer', date: today, text: 'Pasta' }, 'coach', today + 'T09:00:00Z');
  let her = C.buildState(data, 'athlete', today).twoAnswers[0];
  assert.strictEqual(her.date, today);
  assert.strictEqual(her.question, q);
  assert.strictEqual(her.theirs, '');            // not revealed before she answers
  assert.strictEqual(her.theirsAnswered, true);
  assert.strictEqual(her.canAnswer, true);
  const out = C.applyOp(data, { type: 'answer', date: today, text: 'Pizza' }, 'athlete', today + 'T10:00:00Z');
  assert.ok(out.notify && /Pasta/.test(out.notify.body) && /Pizza/.test(out.notify.body));
  her = C.buildState(data, 'athlete', today).twoAnswers[0];
  assert.strictEqual(her.mine, 'Pizza');
  assert.strictEqual(her.theirs, 'Pasta');
  assert.strictEqual(C.buildState(data, 'coach', today).twoAnswers[0].theirs, 'Pizza');
  assert.throws(() => C.applyOp(data, { type: 'answer', date: today, text: 'again' }, 'athlete', today + 'T11:00:00Z'), /already/);
  assert.throws(() => C.applyOp(data, { type: 'answer', date: '2026-12-30', text: 'x' }, 'athlete', today + 'T11:00:00Z'), /closed/);
  // a question pinned to a date wins
  data.questions = [{ question: 'Pinned one?', date: '2026-11-21', active: true }];
  assert.strictEqual(C.questionFor(data, '2026-11-21'), 'Pinned one?');
});

test('two answers streak: days in a row both answered; today never breaks it', () => {
  const data = newData();
  const both = d => { data.answers.push({ date: d, role: 'athlete', text: 'a' }, { date: d, role: 'coach', text: 'b' }); };
  both('2026-11-16'); both('2026-11-17'); both('2026-11-18');
  data.answers.push({ date: '2026-11-19', role: 'coach', text: 'only him' });   // today, she hasn't answered yet
  let k = C.buildState(data, 'athlete', '2026-11-19').qaStreak;
  assert.deepStrictEqual([k.current, k.best, k.today], [3, 3, false]);
  data.answers.push({ date: '2026-11-19', role: 'athlete', text: 'now me' });
  k = C.buildState(data, 'athlete', '2026-11-19').qaStreak;
  assert.deepStrictEqual([k.current, k.today], [4, true]);
  k = C.buildState(data, 'athlete', '2026-11-21').qaStreak;                    // missed the 20th
  assert.deepStrictEqual([k.current, k.best], [0, 4]);
});

// ---------- moving a workout (e.g. Thursday instead of Friday) ----------
test('second workout on a Thursday: it is Day B, and the landing estimate skips that Friday', () => {
  const data = newData();
  const doWorkout = date => {
    const p = E.plan(result(data), date);
    const sets = [];
    p.items.forEach(it => it.targets.forEach((t, i) => sets.push({ slot: it.slot, ex: it.exercise.id, set: i + 1, kg: it.kg != null ? it.kg : 10,
      reps: t, done: true, rir: it.rir[i], target: t })));
    C.applyOp(data, { type: 'saveSession', session: { id: date, date, day: p.day, effort: 3, sets } }, 'athlete', date + 'T18:00:00Z');
    return p;
  };
  doWorkout('2026-11-23');
  const thu = doWorkout('2026-11-26');
  assert.deepStrictEqual([thu.day, thu.mode], ['B', 'normal']);
  const res = result(data);
  assert.ok(res.sessions.every(s => s.completed));
  assert.strictEqual(E.nextDay(res), 'A');
  res.settings.routeKm = res.cumKm + 1;                       // one workout left
  assert.strictEqual(E.eta(res, '2026-11-26', true).date, '2026-11-30');
});

test('both workouts are called "Workout": Upgrade renames untouched defaults only, and the email reads cleanly', () => {
  const d = newData();
  assert.strictEqual(d.settings.dayAName, 'Workout');
  assert.strictEqual(d.settings.dayBName, 'Workout');
  d.settings.dayAName = 'Day A'; d.settings.dayBName = 'Monday';            // an old default, and one Hyde wrote himself
  const plan = C.upgradePlan(d).settings.map(s => s.key + '=' + s.value);
  assert.ok(plan.includes('dayAName=Workout') && !plan.some(x => x.startsWith('dayBName')), plan.join(', '));
  const { data } = simulate({ seed: 1, weeks: 1 });
  data.settings.coachEmail = 'coach@example.com';
  const out = C.applyOp(data, { type: 'saveSession', session: { id: 'x', date: '2026-12-01', day: 'A', effort: 3, minutes: 50,
    sets: [{ slot: 'chest', ex: 'incline-db-press', set: 1, kg: 9, reps: 10, done: true, rir: '1', target: 10 }] } }, 'athlete', '2026-12-01T18:00:00Z');
  const body = (out && out.notify && out.notify.body) || '';
  assert.ok(/Workout \d+ \(50 min\):/.test(body), body.split('\n')[0]);
});
