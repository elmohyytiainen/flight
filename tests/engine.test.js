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

// ---------- reaction bubbles on Two answers ----------
test('reaction bubbles: only once both answered, on the other\'s answer, latest wins, the same one again removes it', () => {
  const data = newData(), today = '2026-11-20', at = h => today + 'T' + h + ':00:00Z';
  C.applyOp(data, { type: 'answer', date: today, text: 'Pasta' }, 'coach', at('09'));
  assert.throws(() => C.applyOp(data, { type: 'answerReact', date: today, emoji: '🫶' }, 'coach', at('09')), /answer first/);
  C.applyOp(data, { type: 'answer', date: today, text: 'Pizza' }, 'athlete', at('10'));
  assert.throws(() => C.applyOp(data, { type: 'answerReact', date: today, emoji: '💩' }, 'athlete', at('10')), /invalid reaction/);

  const out = C.applyOp(data, { type: 'answerReact', date: today, emoji: '😂' }, 'athlete', at('11'));
  assert.ok(out.notify && /reacted 😂 to your answer/.test(out.notify.subject) && /You: Pasta/.test(out.notify.body), 'Hyde gets an email');
  let her = C.buildState(data, 'athlete', today).twoAnswers[0], him = C.buildState(data, 'coach', today).twoAnswers[0];
  assert.deepStrictEqual([her.theirsReaction, her.mineReaction, him.mineReaction, him.theirsReaction], ['😂', '', '😂', '']);

  const back = C.applyOp(data, { type: 'answerReact', date: today, emoji: '🥹' }, 'coach', at('12'));
  assert.ok(!back || !back.notify, 'no email for his own reaction');
  C.applyOp(data, { type: 'answerReact', date: today, emoji: '🫶' }, 'athlete', at('13'));   // she changes hers
  her = C.buildState(data, 'athlete', today).twoAnswers[0];
  assert.deepStrictEqual([her.theirsReaction, her.mineReaction], ['🫶', '🥹']);
  C.applyOp(data, { type: 'answerReact', date: today, emoji: '' }, 'athlete', at('14'));     // and takes it away
  assert.strictEqual(C.buildState(data, 'coach', today).twoAnswers[0].mineReaction, '');
});

// ---------- extra exercises ----------
test('extras: half km per rep, capped at a quarter of the workout, and they never touch progression or completion', () => {
  const data = newData();
  const plan = E.plan(result(data), '2026-11-23');
  const base = [];
  plan.items.forEach(it => it.targets.forEach((t, i) => base.push({ slot: it.slot, ex: it.exercise.id, set: i + 1, kg: 10, reps: t, done: true, rir: '1', target: t })));
  const extra = (n, reps) => Array.from({ length: n }, (_, i) => ({ slot: 'x:x-hip-thrust:1', ex: 'x-hip-thrust', set: i + 1, kg: 40, reps, done: true, rir: '1', target: reps }));
  const run = sets => {
    const d = newData();
    C.applyOp(d, { type: 'saveSession', session: { id: 's', date: '2026-11-23', day: 'A', effort: 3, sets } }, 'athlete', '2026-11-23T18:00:00Z');
    return { d, s: result(d).sessions[0], res: result(d) };
  };
  const plain = run(base).s;
  const small = run(base.concat(extra(3, 10))).s;                  // 30 extra reps
  assert.strictEqual(small.extraReps, 30);
  assert.ok(Math.abs(small.km - plain.km - 30 * E.DEFAULTS.kmPerRep * 0.5) < 0.11, small.km + ' vs ' + plain.km);
  const big = run(base.concat(extra(6, 50))).s;                    // 300 extra reps: capped
  assert.ok(Math.abs(big.extraKm - plain.km * 0.25) < 0.11 && big.km <= plain.km * 1.25 + 0.1, big.km + ' vs ' + plain.km);
  assert.strictEqual(small.completed, plain.completed);
  assert.strictEqual(small.prescribed, plain.prescribed);
  assert.deepStrictEqual(small.extras, [{ ex: 'x-hip-thrust', sets: 3 }]);

  const onlyExtras = run(extra(3, 10));                            // no program sets: no km, not a workout
  assert.strictEqual(onlyExtras.s.km, 0);
  assert.strictEqual(onlyExtras.s.completed, false);
  assert.ok(!onlyExtras.res.hist['x-hip-thrust'], 'extras have no progression history');
  const withX = run(base.concat(extra(3, 10)));
  assert.ok(withX.d.sets.some(r => r.exerciseName === 'Extra: Barbell hip thrust'), 'the Sets log names it');
  assert.ok(!E.plan(withX.res, '2026-11-26').items.some(it => it.exercise.id.indexOf('x-') === 0), 'extras never join the plan');
});

test('extras catalogue: common exercises, unique ids, no clash with the program', () => {
  const ids = E.EXTRAS.map(x => x.id);
  assert.ok(E.EXTRAS.length >= 40);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id.indexOf('x-') === 0));
  E.EXTRAS.forEach(x => assert.ok(E.EXTRA_GROUPS.includes(x.group) && x.stepKg > 0 && x.kgLabel, x.id));
});

// ---------- logging a workout afterwards for a past day ----------
test('a workout logged afterwards slots into history on its date, and the email says so', () => {
  const data = newData();
  data.settings.coachEmail = 'coach@example.com';
  const sessionFor = (date, day, reps) => {
    const p = E.plan(result(data), date, day), sets = [];
    p.items.forEach(it => it.targets.forEach((t, i) => sets.push({ slot: it.slot, ex: it.exercise.id, set: i + 1, kg: 20, reps: reps || t, done: true, rir: '1', target: t })));
    return { id: date + '-x', date, day, effort: 3, sets };
  };
  C.applyOp(data, { type: 'saveSession', session: sessionFor('2026-11-26', 'A') }, 'athlete', '2026-11-26T18:00:00Z');
  // a few days later she logs Monday the 23rd, which she forgot: as of that day nothing was logged yet, so it's an A
  const before = E.replay(Object.assign({}, data, { sessions: data.sessions.filter(s => s.date < '2026-11-23') }));
  const retroDay = E.nextDay(before);
  const out = C.applyOp(data, { type: 'saveSession', session: Object.assign(sessionFor('2026-11-23', retroDay, 9), { retro: true }) }, 'athlete', '2026-11-28T10:00:00Z');
  const res = result(data);
  assert.deepStrictEqual(res.sessions.map(s => s.date), ['2026-11-23', '2026-11-26']);
  assert.ok(res.sessions.every(s => s.completed));
  assert.ok(res.sessions[1].cumKm > res.sessions[0].cumKm, 'km add up in date order');
  assert.ok(out && out.notify && /Workout 1 \(logged afterwards for 2026-11-23/.test(out.notify.body), out && out.notify && out.notify.body.split('\n')[0]);
  const left = Math.round(res.settings.routeKm - res.cumKm);
  assert.ok(out.notify.body.indexOf(left + ' km until') >= 0, 'km left counts every workout, not just up to that day');
});

test('a workout can\'t be logged for a future day', () => {
  const data = newData();
  assert.throws(() => C.applyOp(data, { type: 'saveSession', session: { id: 'f', date: '2026-12-05', day: 'A', effort: 3, sets: [] } }, 'athlete', '2026-11-28T10:00:00Z'), /future/);
  C.applyOp(data, { type: 'saveSession', session: { id: 't', date: '2026-11-29', day: 'A', effort: 3, sets: [] } }, 'athlete', '2026-11-28T23:30:00Z'); // tomorrow in UTC terms is fine (time zones)
});

// ---------- the week plan: two workouts a week, any days ----------
const doSession = (data, date, opts) => {
  opts = opts || {};
  const p = E.plan(result(data), date), sets = [];
  p.items.forEach(it => it.targets.forEach((t, i) => sets.push({ slot: it.slot, ex: it.exercise.id, set: i + 1, kg: it.kg != null ? it.kg : 20,
    reps: opts.reps && opts.reps[it.exercise.id] != null ? opts.reps[it.exercise.id] : t, done: true, rir: it.rir[i], target: t })));
  return { plan: p, out: C.applyOp(data, { type: 'saveSession', session: { id: date, date, day: p.day, effort: 3, sets } }, 'athlete', date + 'T18:00:00Z') };
};

test('week plan: Tuesday instead of Monday leaves nothing looking missed', () => {
  const data = newData();                                         // startDate Mon 23 Nov, Mon + Fri
  assert.deepStrictEqual(E.weekPlan(result(data), '2026-11-23', '2026-11-23'), ['2026-11-23', '2026-11-27']);
  // Monday passed without a workout: on Tuesday she is behind, so today is planned (not Monday)
  assert.deepStrictEqual(E.weekPlan(result(data), '2026-11-23', '2026-11-24'), ['2026-11-24', '2026-11-27']);
  assert.strictEqual(E.nextPlanned(result(data), '2026-11-24'), '2026-11-24');
  doSession(data, '2026-11-24');
  assert.deepStrictEqual(E.weekPlan(result(data), '2026-11-23', '2026-11-24'), ['2026-11-27']);
  assert.strictEqual(E.nextPlanned(result(data), '2026-11-25'), '2026-11-27');
  doSession(data, '2026-11-27');
  assert.deepStrictEqual(E.weekPlan(result(data), '2026-11-23', '2026-11-27'), []);
  assert.deepStrictEqual(E.plannedDays(result(data), '2026-11-28', '2026-12-06').map(p => p.date), ['2026-11-30', '2026-12-04']);
});

test('week plan: Thursday instead of Friday; Friday is gone once Thursday is done', () => {
  const data = newData();
  doSession(data, '2026-11-23');
  // on Thursday she is on track: Friday is still the plan (the app offers "Train today instead")
  assert.deepStrictEqual(E.weekPlan(result(data), '2026-11-23', '2026-11-26'), ['2026-11-27']);
  doSession(data, '2026-11-26');
  const res = result(data);
  assert.deepStrictEqual(E.weekPlan(res, '2026-11-23', '2026-11-26'), []);
  assert.strictEqual(E.nextPlanned(res, '2026-11-26'), '2026-11-30');
  assert.deepStrictEqual(E.plannedDays(res, '2026-11-26', '2026-12-06').map(p => p.day), ['A', 'B']);
  // only Monday done and it's Saturday: one is left, so today is planned
  const d2 = newData();
  doSession(d2, '2026-11-23');
  assert.deepStrictEqual(E.weekPlan(result(d2), '2026-11-23', '2026-11-28'), ['2026-11-28']);
  assert.deepStrictEqual(E.weekPlan(result(d2), '2026-11-23', '2026-11-30'), [], 'a past week is never planned');
});

test('back to back: missed reps the day after a workout keep the same weights and goals', () => {
  const run = misses => {
    const data = newData();
    data.settings.coachEmail = 'coach@example.com';
    doSession(data, '2026-11-23');
    const before = E.plan(result(data), '2026-11-24').items.find(it => it.exercise.id === 'back-squat');
    const r = doSession(data, '2026-11-24', misses ? { reps: { 'back-squat': 6 } } : {});
    const after = E.plan(result(data), '2026-11-27').items.find(it => it.exercise.id === 'back-squat');
    return { data, before, after, out: r.out };
  };
  const tired = run(true);
  const s = result(tired.data).sessions[1];
  assert.ok(s.backToBack && s.completed, 'it still counts as a workout');
  assert.deepStrictEqual(s.tired, ['back-squat']);
  assert.deepStrictEqual([tired.after.kg, tired.after.targets], [tired.before.kg, tired.before.targets], 'same weight and goals again');
  assert.ok(!tired.after.held && !tired.after.down, 'not held or lowered');
  assert.ok(/Back to back with the last workout, so the missed reps on Back squat don't count/.test(tired.out.notify.body), tired.out.notify.body);
  assert.ok(E.backToBack(result(tired.data), '2026-11-25') && !E.backToBack(result(tired.data), '2026-11-26'));
  // a good day back to back still moves things on
  const good = run(false);
  assert.ok(good.after.targets.some((t, i) => t > good.before.targets[i]) || good.after.kg > good.before.kg, 'progress after a good back-to-back day');
  // the same miss with a normal gap is not forgiven like that
  const data = newData();
  doSession(data, '2026-11-23');
  const b = E.plan(result(data), '2026-11-27').items.find(it => it.exercise.id === 'back-squat');
  doSession(data, '2026-11-27', { reps: { 'back-squat': 6 } });
  const a = E.plan(result(data), '2026-11-30').items.find(it => it.exercise.id === 'back-squat');
  assert.ok(a.held || a.down || a.targets.join() !== b.targets.join(), 'a normal miss still counts');
});

// ---------- send love: hearts from her top bar, a daily total email to the coach ----------
test('love: only she can send hearts; resending the same heart counts once; the coach sees the running total', () => {
  const data = newData();
  const love = (id, date, size, now) => C.applyOp(data, { type: 'love', id, date, size }, 'athlete', now || date + 'T20:00:00Z');
  love('a', '2026-11-20', 1); love('b', '2026-11-20', 2); love('b', '2026-11-20', 2); love('c', '2026-11-21', 3);
  assert.strictEqual(data.love.length, 3, 'a queued heart sent twice counts once');
  assert.ok(!love('d', '2026-11-21', 1).notify, 'no email per heart');
  assert.throws(() => C.applyOp(data, { type: 'love', id: 'x', date: '2026-11-21', size: 1 }, 'coach', '2026-11-21T20:00:00Z'), /not allowed/);
  assert.throws(() => love('e', '2026-11-21', 5), /invalid love/);
  assert.throws(() => love('f', '2026-11-25', 1, '2026-11-21T20:00:00Z'), /future/);
  const coach = C.buildState(data, 'coach', '2026-11-21').love;
  assert.deepStrictEqual([coach.total, coach.today, coach.todayBig], [4, 2, 1]);
  assert.strictEqual(C.buildState(data, 'athlete', '2026-11-21').love.total, 4, 'she sees her running total too');
});

test('love: one email a day with yesterday\'s total, sent once', () => {
  const data = newData();
  data.settings.herName = 'Pinja';
  const love = (id, date, size) => C.applyOp(data, { type: 'love', id, date, size }, 'athlete', date + 'T20:00:00Z');
  assert.strictEqual(C.loveDigest(data, '2026-11-21'), null, 'nothing sent, nothing to email');
  love('a', '2026-11-20', 1); love('b', '2026-11-20', 2); love('c', '2026-11-20', 3); love('d', '2026-11-21', 1);
  const d = C.loveDigest(data, '2026-11-21');
  assert.strictEqual(d.note.subject, '💗 Pinja sent you 3 hearts yesterday');
  assert.ok(/3 hearts 💗 yesterday \(1 big, 1 huge\)\./.test(d.note.body) && /Total so far: 3 💗/.test(d.note.body), d.note.body);
  assert.deepStrictEqual(d.write, { tab: 'Settings', kind: 'setting', key: 'loveReportedDay', value: '2026-11-20' });
  data.settings.loveReportedDay = d.write.value;
  assert.strictEqual(C.loveDigest(data, '2026-11-21'), null, 'the same day is not emailed twice; today\'s hearts wait');
  // a few days without anyone opening the app: one email covering them, today's heart still waits
  love('e', '2026-11-22', 1); love('f', '2026-11-23', 1); love('g', '2026-11-24', 1);
  const d2 = C.loveDigest(data, '2026-11-24');
  assert.strictEqual(d2.note.subject, '💗 Pinja sent you 3 hearts since Sat 21 Nov');
  assert.ok(/Sat 21 Nov: 1 heart\nSun 22 Nov: 1 heart\nMon 23 Nov: 1 heart/.test(d2.note.body) && /Total so far: 6 💗/.test(d2.note.body), d2.note.body);
});

test('love milestones: 50, 100, 250 … and the daily email says when she passed one', () => {
  assert.deepStrictEqual([1, 49, 50, 100, 250, 500, 750, 1000, 1250, 1500, 2000].filter(C.isLoveMilestone), [50, 100, 250, 500, 750, 1000, 1500, 2000]);
  const data = newData();
  data.settings.herName = 'Pinja';
  for (let i = 0; i < 48; i++) C.applyOp(data, { type: 'love', id: 'a' + i, date: '2026-11-20', size: 1 }, 'athlete', '2026-11-20T20:00:00Z');
  data.settings.loveReportedDay = '2026-11-20';
  for (let i = 0; i < 3; i++) C.applyOp(data, { type: 'love', id: 'b' + i, date: '2026-11-21', size: 1 }, 'athlete', '2026-11-21T20:00:00Z');
  const d = C.loveDigest(data, '2026-11-22');
  assert.strictEqual(d.note.subject, '🎉 💗 Pinja sent you 3 hearts yesterday');
  assert.ok(d.note.body.startsWith('🎉 Pinja passed 50 hearts!\n\n3 hearts 💗 yesterday.'), d.note.body);
});

// ---------- the coach fixes or deletes a saved workout ----------
const coachFix = (data, op, now) => C.applyOp(data, op, 'coach', now || '2026-12-01T10:00:00Z');

test('edit and delete: only a workout that exists, never empty, never in the future', () => {
  const data = newData();
  doSession(data, '2026-11-23');
  const sets = C.toEngineInput(data).sessions[0].sets;
  for (const who of ['coach', 'athlete']) {
    assert.throws(() => C.applyOp(data, { type: 'deleteSession', id: 'nope' }, who, '2026-12-01T10:00:00Z'), /no such workout/);
    assert.throws(() => C.applyOp(data, { type: 'editSession', id: 'nope', sets }, who, '2026-12-01T10:00:00Z'), /no such workout/);
    assert.throws(() => C.applyOp(data, { type: 'editSession', id: '2026-11-23', sets: sets.map(x => Object.assign({}, x, { done: false })) }, who, '2026-12-01T10:00:00Z'), /delete the workout instead/);
    assert.throws(() => C.applyOp(data, { type: 'editSession', id: '2026-11-23', date: '2026-12-09', sets }, who, '2026-12-01T10:00:00Z'), /future/);
  }
});

test('she can fix or delete her own workout too, and the coach gets a note saying what changed', () => {
  const data = newData();
  doSession(data, '2026-11-23');
  doSession(data, '2026-11-27');
  const sets = C.toEngineInput(data).sessions[0].sets;
  const i = sets.findIndex(x => x.ex === 'back-squat' && x.set === 2), j = sets.findIndex(x => x.ex === 'lat-pulldown' && x.set === 3);
  const fixed = sets.map((x, k) => k === i ? Object.assign({}, x, { kg: x.kg + 2.5, reps: 9 }) : k === j ? Object.assign({}, x, { done: false }) : x);
  const out = C.applyOp(data, { type: 'editSession', id: '2026-11-23', date: '2026-11-22', sets: fixed }, 'athlete', '2026-12-01T10:00:00Z');
  assert.ok(out.notify && /fixed her workout of 2026-11-23/.test(out.notify.subject), out.notify && out.notify.subject);
  assert.ok(/Moved from 2026-11-23 to 2026-11-22/.test(out.notify.body), out.notify.body);
  assert.ok(/Back squat set 2: .+ → 9 × /.test(out.notify.body), out.notify.body);
  assert.ok(/Lat pulldown set 3: taken out/.test(out.notify.body), out.notify.body);
  // nothing changed: no email
  const again = C.toEngineInput(data).sessions.find(s => s.id === '2026-11-23');
  assert.strictEqual(C.applyOp(data, { type: 'editSession', id: '2026-11-23', sets: again.sets }, 'athlete', '2026-12-01T10:00:00Z').notify, null);
  // she deletes one: the coach hears about it
  const del = C.applyOp(data, { type: 'deleteSession', id: '2026-11-27' }, 'athlete', '2026-12-01T10:00:00Z');
  assert.ok(del.notify && /deleted a workout/.test(del.notify.subject) && /2026-11-27/.test(del.notify.body) && /km to LUX now/.test(del.notify.body), del.notify && del.notify.body);
  assert.deepStrictEqual(result(data).sessions.map(s => s.id), ['2026-11-23']);
});

test('deleting a workout: its sets and reactions go, km and the Sheet columns after it recalculate', () => {
  const data = newData();
  doSession(data, '2026-11-23');
  doSession(data, '2026-11-27');
  C.applyOp(data, { type: 'react', sessionId: '2026-11-23', emoji: '🔥' }, 'coach', '2026-11-23T20:00:00Z');
  const before = result(data);
  assert.strictEqual(before.sessions.length, 2);
  const out = coachFix(data, { type: 'deleteSession', id: '2026-11-23' });
  const after = result(data);
  assert.deepStrictEqual(after.sessions.map(s => s.id), ['2026-11-27']);
  assert.strictEqual(after.sessions[0].day, 'B', 'the stored A/B of the other workout is kept');
  assert.ok(after.cumKm < before.cumKm);
  assert.ok(!data.sets.some(r => r.sessionId === '2026-11-23'));
  assert.ok(!data.reactions.some(r => r.sessionId === '2026-11-23'));
  assert.ok(out.writes.some(w => w.tab === 'Sessions' && w.kind === 'deleteWhere' && w.value === '2026-11-23'));
  assert.ok(out.writes.some(w => w.tab === 'Sets' && w.kind === 'deleteWhere'));
  assert.ok(out.writes.some(w => w.tab === 'Reactions' && w.kind === 'deleteWhere'));
  // the Sheet's derived columns follow: the 27th is now the only workout, so its cumKm is its own km
  const row = data.sessions.find(r => r.id === '2026-11-27');
  assert.strictEqual(Number(row.cumKm), after.sessions[0].km);
  assert.strictEqual(out.notify, null, 'no email for a coach fix');
});

test('editing a workout: a typo in the weight is fixed and the next goals follow; the date can move; other fields are kept', () => {
  const data = newData();
  doSession(data, '2026-11-23');
  const raw = data.sessions[0];
  raw.photo = 'drive-file-id'; raw.note = 'felt good';
  const sets = C.toEngineInput(data).sessions[0].sets;
  const pulldown = sets.filter(x => x.ex === 'lat-pulldown');
  const fixed = sets.map(x => x.ex === 'lat-pulldown' && x.set === 1 ? Object.assign({}, x, { kg: 400 }) : x); // a typo: 400 kg
  coachFix(data, { type: 'editSession', id: '2026-11-23', sets: fixed });
  const typo = E.plan(result(data), '2026-11-27').items.find(it => it.exercise.id === 'lat-pulldown');
  // fix it back: the plan returns to what the real weights give
  coachFix(data, { type: 'editSession', id: '2026-11-23', sets });
  const ok = E.plan(result(data), '2026-11-27').items.find(it => it.exercise.id === 'lat-pulldown');
  assert.ok(typo.kg !== ok.kg || typo.targets.join() !== ok.targets.join(), 'the typo changed the next plan, the fix undid it');
  assert.strictEqual(ok.kg, pulldown[0].kg);
  // take a set out and move the date
  const fewer = sets.map(x => x.ex === 'lat-pulldown' && x.set === 3 ? Object.assign({}, x, { done: false }) : x);
  coachFix(data, { type: 'editSession', id: '2026-11-23', date: '2026-11-24', sets: fewer });
  const s = result(data).sessions[0];
  assert.strictEqual(s.date, '2026-11-24');
  assert.strictEqual(s.done, sets.filter(x => x.done).length - 1);
  assert.strictEqual(data.sets.filter(r => r.sessionId === '2026-11-23').length, s.done);
  assert.ok(data.sets.every(r => r.sessionId !== '2026-11-23' || r.date === '2026-11-24'));
  const row = data.sessions[0];
  assert.strictEqual(row.photo, 'drive-file-id');
  assert.strictEqual(row.note, 'felt good');
  assert.strictEqual(row.day, 'A');
});

test('saving a workout again keeps its photo link', () => {
  const data = newData();
  const { out } = doSession(data, '2026-11-23');
  data.sessions[0].photo = 'drive-file-id';
  const s = C.toEngineInput(data).sessions[0];
  C.applyOp(data, { type: 'saveSession', session: { id: s.id, date: s.date, day: s.day, effort: 3, sets: s.sets } }, 'athlete', '2026-11-23T18:05:00Z');
  assert.strictEqual(data.sessions[0].photo, 'drive-file-id');
  assert.ok(out.notify);
});

test('postcard captions: kept from her until the card is delivered, like the photo', () => {
  const data = newData();
  data.postcards.forEach((p, i) => { p.message = 'note ' + i; p.photo = 'https://example.com/p' + i + '.jpg'; p.caption = 'me, ' + (6 + i); });
  doSession(data, '2026-11-23');
  doSession(data, '2026-11-27'); // the first card is at 90 km
  const her = C.buildState(data, 'athlete', '2026-11-28').postcards, coach = C.buildState(data, 'coach', '2026-11-28').postcards;
  const got = her.filter(c => c.delivered), sealed = her.filter(c => !c.delivered);
  assert.ok(got.length >= 1 && sealed.length >= 1);
  assert.ok(got.every(c => /^me, \d+$/.test(c.caption) && c.photo));
  assert.ok(sealed.every(c => c.caption === undefined && c.photo === undefined));
  assert.ok(coach.every(c => c.caption));
});

test('postcard covers: a card\'s own Drive link, else the default from Settings, else none (the drawn cover); numbered on the route', () => {
  const data = newData();
  data.postcards.forEach((p, i) => { p.message = 'note ' + i; });
  data.postcards[0].cover = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing';
  const coach = () => C.buildState(data, 'coach', '2026-11-28').postcards;
  assert.strictEqual(coach()[0].cover, 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345&sz=w1200');
  assert.strictEqual(coach()[1].cover, '');
  data.settings.defaultCover = 'https://drive.google.com/open?id=9ZyXwVuTsRqPoNmLkJiHgFeDcBa98765';
  const c = coach();
  assert.ok(c[0].cover.indexOf('1AbCd') > 0, 'its own cover wins');
  assert.ok(c.slice(1).every(x => x.cover.indexOf('9ZyXw') > 0), 'the rest get the default');
  assert.deepStrictEqual(c.map(x => x.no), c.map((x, i) => i + 1));
  assert.ok(c.every(x => x.of === c.length));
  // her: no cover until the card is delivered
  assert.ok(C.buildState(data, 'athlete', '2026-11-28').postcards.every(x => !x.delivered && x.cover === undefined));
  // Upgrade adds the setting to an older Sheet
  const old = newData(); delete old.settings.defaultCover;
  assert.ok(C.upgradePlan(old).settings.some(s => s.key === 'defaultCover' && s.add));
});

test('seen hints are kept in the Sheet per role, merged, and each sees only their own', () => {
  const data = newData();
  const her = set => C.applyOp(data, { type: 'seen', set }, 'athlete', '2026-11-28T10:00:00Z');
  const out = her({ lovelabel: 1, loveTips: 2 });
  assert.ok(out.writes.some(w => w.kind === 'setting' && w.key === 'herSeen'));
  her({ loveTips: 3, 'dev:p1': 1 });
  C.applyOp(data, { type: 'seen', set: { love: 42 } }, 'coach', '2026-11-28T10:00:00Z');
  assert.deepStrictEqual(C.buildState(data, 'athlete', '2026-11-28').seen, { lovelabel: 1, loveTips: 3, 'dev:p1': 1 });
  assert.deepStrictEqual(C.buildState(data, 'coach', '2026-11-28').seen, { love: 42 });
  assert.strictEqual(C.buildState(data, 'athlete', '2026-11-28').settings.herSeen, undefined, 'not sent as a setting');
  assert.throws(() => her({ 'bad key!': 1 }), /invalid seen/);
  assert.throws(() => her({ ok: { nested: true } }), /invalid seen/);
});

test('moods: each sets their own, the other sees it; the latest wins, empty clears; heads-up moods email Elmo once', () => {
  const data = newData();
  const set = (role, mood, note, at) => C.applyOp(data, { type: 'mood', mood, note }, role, at);
  assert.deepStrictEqual(C.buildState(data, 'athlete', '2026-11-28').moods, { mine: null, theirs: null });
  const a = set('athlete', 'missing', '  counting the days  ', '2026-11-28T08:00:00Z');
  assert.ok(a.writes.some(w => w.tab === 'Moods' && w.kind === 'append'));
  assert.ok(a.notify && /is missing you/.test(a.notify.subject) && /counting the days/.test(a.notify.body), a.notify && a.notify.subject);
  assert.strictEqual(set('athlete', 'missing', 'still', '2026-11-28T09:00:00Z').notify, null, 'same mood again: no second email');
  assert.strictEqual(set('athlete', 'happy', '', '2026-11-28T10:00:00Z').notify, null, 'everyday moods: no email');
  assert.strictEqual(set('coach', 'stressed', 'long day', '2026-11-28T11:00:00Z').notify, null, 'his moods never email');
  const her = C.buildState(data, 'athlete', '2026-11-28').moods, his = C.buildState(data, 'coach', '2026-11-28').moods;
  assert.deepStrictEqual(her.mine, { mood: 'happy', note: '', at: '2026-11-28T10:00:00Z', seen: false, seenAt: '', reply: null });
  assert.deepStrictEqual(her.theirs, { mood: 'stressed', note: 'long day', at: '2026-11-28T11:00:00Z', replied: null });
  assert.deepStrictEqual([his.theirs.mood, his.theirs.note, his.theirs.at], [her.mine.mood, her.mine.note, her.mine.at]);
  set('athlete', '', 'ignored', '2026-11-28T12:00:00Z');
  assert.strictEqual(C.buildState(data, 'coach', '2026-11-28').moods.theirs, null, 'cleared');
  assert.ok(set('athlete', 'hug', '', '2026-11-28T13:00:00Z').notify, 'after a clear, a heads-up mood emails again');
  assert.throws(() => set('athlete', 'grumpy', '', '2026-11-28T14:00:00Z'), /invalid mood/);
  const spicy = set('athlete', 'spicy', '', '2026-11-28T15:00:00Z').notify;
  assert.ok(/🌶️ .+ is in the mood/.test(spicy.subject) && /3 hours/.test(spicy.body), 'the email says the mood\'s own hours');
});

test('moods v2: twelve moods in grid order, each with its own reply and hours; heads-up moods unchanged plus 📞', () => {
  assert.deepStrictEqual(C.MOODS.map(m => m.e), ['😊', '🥰', '🥺', '🤗', '🌶️', '📞', '💪', '😌', '🥂', '😴', '🤯', '🤒']);
  assert.deepStrictEqual(C.MOODS.filter(m => m.mail).map(m => m.id), ['missing', 'hug', 'spicy', 'call', 'stressed', 'sick']);
  C.MOODS.forEach(m => assert.ok(m.reply && m.hours > 0 && m.say && m.label, m.id));
  const hours = Object.fromEntries(C.MOODS.map(m => [m.id, m.hours]));
  assert.deepStrictEqual([hours.call, hours.spicy, hours.sleepy, hours.sick, hours.happy], [2, 3, 10, 24, 12]);
  const data = newData();
  const out = C.applyOp(data, { type: 'mood', mood: 'call', note: 'after 8?' }, 'athlete', '2026-11-28T18:00:00Z');
  assert.ok(/📞 .+ would love a call/.test(out.notify.subject) && /2 hours/.test(out.notify.body) && /Calling soon/.test(out.notify.body), out.notify.body);
});

test('mood replies: one tap answers the other\'s current mood, once; she emails Elmo; both see it', () => {
  const data = newData();
  const mood = (role, m, at) => C.applyOp(data, { type: 'mood', mood: m, note: m === 'missing' ? 'counting the days' : '' }, role, at);
  const reply = (role, moodAt, at) => C.applyOp(data, { type: 'moodReply', moodAt }, role, at);
  assert.throws(() => reply('coach', '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z'), /no mood to reply to/);
  mood('athlete', 'missing', '2026-11-28T08:00:00Z');
  assert.throws(() => reply('coach', '2026-11-28T07:00:00Z', '2026-11-28T08:30:00Z'), /that mood has changed/);
  const his = reply('coach', '2026-11-28T08:00:00Z', '2026-11-28T08:30:00Z');
  assert.ok(his.writes.some(w => w.tab === 'MoodReplies' && w.kind === 'append' && w.row.reply === 'Missing you too 🥺' && w.row.to === 'athlete'));
  assert.strictEqual(his.notify, null, 'his replies never email');
  assert.strictEqual(reply('coach', '2026-11-28T08:00:00Z', '2026-11-28T08:31:00Z').writes.length, 0, 'once per mood');
  assert.deepStrictEqual(C.buildState(data, 'athlete', '2026-11-28').moods.mine.reply, { text: 'Missing you too 🥺', at: '2026-11-28T08:30:00Z' });
  assert.deepStrictEqual(C.buildState(data, 'coach', '2026-11-28').moods.theirs.replied, { text: 'Missing you too 🥺', at: '2026-11-28T08:30:00Z' });
  // her reply to his mood: an email to Elmo
  mood('coach', 'hug', '2026-11-28T09:00:00Z');
  const hers = reply('athlete', '2026-11-28T09:00:00Z', '2026-11-28T09:05:00Z');
  assert.ok(/🤗 .+ replied: Sending a big hug 🤗/.test(hers.notify.subject) && /Need a hug/.test(hers.notify.body), hers.notify.subject);
  // a new mood starts fresh: no reply yet, and the old reply doesn't carry over
  mood('athlete', 'missing', '2026-11-28T10:00:00Z');
  assert.strictEqual(C.buildState(data, 'athlete', '2026-11-28').moods.mine.reply, null);
  assert.strictEqual(C.buildState(data, 'coach', '2026-11-28').moods.theirs.replied, null);
});

test('mood seen receipt: the other opening the sheet while the mood is up shows as seen, with the time', () => {
  const data = newData();
  C.applyOp(data, { type: 'mood', mood: 'sleepy' }, 'athlete', '2026-11-28T21:00:00Z');
  assert.strictEqual(C.buildState(data, 'athlete', '2026-11-28').moods.mine.seen, false);
  C.applyOp(data, { type: 'seen', set: { moodSeen: '2026-11-28T21:00:00Z', moodSeenAt: '2026-11-28T21:12:00Z' } }, 'coach', '2026-11-28T21:12:00Z');
  const mine = C.buildState(data, 'athlete', '2026-11-28').moods.mine;
  assert.deepStrictEqual([mine.seen, mine.seenAt], [true, '2026-11-28T21:12:00Z']);
  assert.strictEqual(C.buildState(data, 'coach', '2026-11-28').moods.mine, null, 'his own: none set');
  C.applyOp(data, { type: 'mood', mood: 'happy' }, 'athlete', '2026-11-29T07:30:00Z');
  assert.strictEqual(C.buildState(data, 'athlete', '2026-11-29').moods.mine.seen, false, 'a new mood is unseen again');
});

test('answer reactions: 🫶 replaces ❤️, plus 🤔 and 🫢', () => {
  assert.deepStrictEqual(C.QA_EMOJIS, ['🥰', '😂', '🥹', '😘', '🔥', '🌶️', '🫶', '🤔', '🫢']);
});
