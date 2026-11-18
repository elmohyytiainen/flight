/*
 * FlightCore v3 — the backend's logic, independent of where data is stored.
 *
 * Works on `data`, an in-memory copy of the Sheet: { settings: {key: value}, slots, exercises,
 * choices, sessions, sets, overrides, stamps, postcards, cheers } (arrays of row objects).
 * applyOp() changes `data` and returns writes for the storage adapter (Sheet or demo storage).
 *
 * Runs in the web app (core.js, demo mode) and in Apps Script (pasted as Core.gs). Needs FlightEngine.
 */
var FlightCore = (function () {
  'use strict';

  var TABS = {
    Settings: ['key', 'value', 'note'],
    Slots: ['slot', 'muscle', 'orderA', 'orderB', 'pair', 'setsA', 'repMinA', 'repMaxA', 'setsB', 'repMinB', 'repMaxB',
      'restA', 'restB', 'rirLastA', 'rirLastB', 'lastRirStableOnly', 'failureLast', 'calibrate', 'active'],
    Exercises: ['id', 'slot', 'name', 'rank', 'stepKg', 'loadMult', 'baseKg', 'kgLabel', 'assisted', 'stable', 'rir',
      'startKg', 'cue', 'video', 'active'],
    Choices: ['at', 'slot', 'day', 'exercise'],
    Sessions: ['id', 'date', 'day', 'week', 'minutes', 'effort', 'note', 'reps', 'km', 'cumKm', 'volumeKg', 'upgrades',
      'completed', 'savedAt', 'setsJson', 'photo'],
    Sets: ['sessionId', 'date', 'day', 'slot', 'exercise', 'exerciseName', 'set', 'kg', 'reps', 'done', 'feedback'],
    Overrides: ['date', 'exercise', 'kg', 'note'],
    Stamps: ['date', 'type'],
    Postcards: ['id', 'km', 'over', 'from', 'place', 'photo', 'message', 'openedAt'],
    Cheers: ['id', 'createdAt', 'text', 'seenAt'],
    Reactions: ['id', 'at', 'sessionId', 'emoji', 'text', 'seenAt']
  };
  var KEY = { Settings: 'settings', Slots: 'slots', Exercises: 'exercises', Choices: 'choices', Sessions: 'sessions',
    Sets: 'sets', Overrides: 'overrides', Stamps: 'stamps', Postcards: 'postcards', Cheers: 'cheers', Reactions: 'reactions' };

  // ---------- seeds ----------
  function yt(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q + ' form'); }

  var SETTING_NOTES = {
    herName: 'Her name, written on the postcards',
    travellerName: 'Who flies to LUX when the bar fills (shown on the boarding pass and in the app)',
    flightNo: 'Flight number on the boarding pass',
    dayAName: 'Label for Day A (Monday)',
    dayBName: 'Label for Day B (Friday)',
    startDate: 'First Monday of the program',
    introWeeks: 'Intro weeks at the start: one set fewer, 2–3 reps in reserve, no weight increases. 0, 1 or 2',
    trainingWeekdays: 'Weekdays for the landing estimate and calendar: 0=Sun, 1=Mon ... 5=Fri',
    routeKm: 'Tampere-Pirkkala (TMP) to Luxembourg (LUX), great circle',
    kmPerRep: 'km earned per rep on a confirmed working set',
    coachEmail: 'Where workout reports are emailed. Blank = no email',
    appUrl: 'Web address of the app (GitHub Pages), used to build the links',
    athleteKey: 'Secret key in her link. Change it and resend the link if it leaks',
    coachKey: 'Secret key in your coach link',
    goals: 'Goal milestones: exercise id : kg (assistance for assisted lifts), optional x reps. Example: assisted-chinup:0, incline-db-press:20, hip-thrust:60x5'
  };
  var FLIGHT_NO = 'AY 1697';
  var GOALS = 'assisted-chinup:0, incline-db-press:20';

  function seedSettings(keys) {
    return [
      ['herName', keys.herName || ''], ['travellerName', 'Elmo'], ['flightNo', FLIGHT_NO],
      ['dayAName', 'Heavy'], ['dayBName', 'Volume'], ['startDate', '2026-11-23'], ['introWeeks', 1],
      ['trainingWeekdays', '1,5'], ['routeKm', 1697], ['kmPerRep', FlightEngine.DEFAULTS.kmPerRep],
      ['coachEmail', keys.coachEmail || ''], ['appUrl', keys.appUrl || ''],
      ['athleteKey', keys.athleteKey], ['coachKey', keys.coachKey], ['goals', GOALS]
    ].map(function (r) { return { key: r[0], value: r[1], note: SETTING_NOTES[r[0]] || '' }; });
  }

  function slot(o) {
    return { slot: o.slot, muscle: o.muscle, orderA: o.oA, orderB: o.oB, pair: o.pair || '',
      setsA: o.a[0], repMinA: o.a[1], repMaxA: o.a[2], setsB: o.b[0], repMinB: o.b[1], repMaxB: o.b[2],
      restA: o.restA, restB: o.restB, rirLastA: o.rirA || '', rirLastB: o.rirB || '',
      lastRirStableOnly: !!o.stableOnly, failureLast: o.failure || '', calibrate: !!o.calibrate, active: true };
  }

  /** Monday Heavy, Friday Volume. Monday starts with the push, Friday with the pull. */
  function seedSlots() {
    return [
      slot({ slot: 'chest', muscle: 'Chest and front delts', oA: 1, oB: 3, a: [4, 4, 6], b: [4, 8, 12], restA: 210, restB: 150, rirB: '0–1', stableOnly: true }),
      slot({ slot: 'upper-back', muscle: 'Upper back', oA: 2, oB: 1, a: [3, 5, 8], b: [3, 8, 12], restA: 210, restB: 150, rirB: '0–1', stableOnly: true }),
      slot({ slot: 'lats', muscle: 'Lats', oA: 3, oB: 2, a: [2, 6, 8], b: [3, 10, 15], restA: 150, restB: 150, rirB: '0–1', stableOnly: true }),
      slot({ slot: 'glutes', muscle: 'Glutes', oA: 4, oB: 4, a: [2, 6, 10], b: [2, 10, 15], restA: 150, restB: 150 }),
      slot({ slot: 'side-delts', muscle: 'Side delts', oA: 5, oB: 5, pair: 'delts-abs', a: [2, 12, 20], b: [2, 12, 20], restA: 90, restB: 90,
        rirA: '0–1', rirB: '0–1', failure: 'AB', calibrate: true }),
      slot({ slot: 'abs', muscle: 'Abs', oA: 6, oB: 6, pair: 'delts-abs', a: [2, 8, 12], b: [2, 12, 18], restA: 90, restB: 90, calibrate: true }),
      slot({ slot: 'biceps', muscle: 'Biceps', oA: 7, oB: 7, pair: 'arms', a: [2, 8, 12], b: [2, 10, 15], restA: 90, restB: 90,
        rirA: '0–1', rirB: '0–1', calibrate: true }),
      slot({ slot: 'triceps', muscle: 'Triceps', oA: 8, oB: 8, pair: 'arms', a: [2, 8, 12], b: [2, 10, 15], restA: 90, restB: 90,
        rirA: '0–1', rirB: '0–1', calibrate: true })
    ];
  }

  function ex(slotKey, rank, id, name, o) {
    o = o || {};
    return { id: id, slot: slotKey, name: name, rank: rank, stepKg: o.step || 2.5, loadMult: o.mult || 1, baseKg: o.base || 0,
      kgLabel: o.label || 'kg', assisted: !!o.assisted, stable: !!o.stable, rir: o.rir || '',
      startKg: o.start === undefined ? '' : o.start, cue: o.cue || '', video: yt(name), active: true };
  }

  function seedExercises() {
    return [
      // Chest is locked to the incline dumbbell press: chest and front delts in one movement.
      ex('chest', 1, 'incline-db-press', 'Incline dumbbell press', { step: 1, mult: 2, label: 'kg / hand',
        cue: 'Bench at about 30 degrees. Lower to the upper chest, elbows about 45 degrees out. Hits chest and front delts.' }),
      ex('upper-back', 1, 'cable-row', 'Seated cable row', { stable: true,
        cue: 'Chest up, slight lean forward at the start. Pull to the lower ribs and squeeze the shoulder blades together.' }),
      ex('upper-back', 2, 'one-arm-db-row', 'One-arm dumbbell row', { step: 1, label: 'kg',
        cue: 'One knee and hand on a flat bench, back flat. Row the dumbbell to the hip. Count reps per arm.' }),
      ex('upper-back', 3, 'wide-cable-row', 'Wide-grip seated cable row', { stable: true,
        cue: 'Wide grip, chest up. Pull to the lower chest with the elbows flared slightly.' }),
      ex('upper-back', 4, 'machine-row', 'Chest-supported machine row', { stable: true,
        cue: 'Only if your gym has one. Chest on the pad, pull the elbows back and squeeze for a moment.' }),
      ex('lats', 1, 'neutral-pulldown', 'Neutral-grip lat pulldown', { stable: true,
        cue: 'Lean back a little and pull the handle to the upper chest, leading with the elbows.' }),
      ex('lats', 2, 'overhand-pulldown', 'Overhand pulldown', { stable: true,
        cue: 'Grip just outside the shoulders. Pull to the upper chest, keep the ribs down.' }),
      ex('lats', 3, 'assisted-chinup', 'Assisted chin-up', { assisted: true, base: 60, label: 'kg assistance', step: 2.5,
        cue: 'Underhand grip. Chin over the bar, all the way down each rep. Less assistance = progress.' }),
      ex('glutes', 1, 'hip-thrust-machine', 'Machine hip thrust', { stable: true,
        cue: 'Pad low on the hips, chin tucked. Drive through the heels and pause 1 s at the top.' }),
      ex('glutes', 2, 'hip-thrust', 'Barbell hip thrust', {
        cue: 'Chin tucked, ribs down. Drive through the heels and pause 1 s at the top.' }),
      ex('glutes', 3, 'bulgarian-split-squat', 'Bulgarian split squat', { step: 2, mult: 2, label: 'kg / hand', rir: '1–2',
        cue: 'Back foot on a bench, front foot far enough forward that you sink straight down. Lean the chest forward a little ' +
          'and go down until the back knee is just above the floor. Push up through the front heel. All reps on one leg, ' +
          'then the other; count reps per leg.' }),
      ex('glutes', 4, 'back-extension', 'Glute-biased 45° back extension', { base: 35, label: 'kg added', start: 0,
        cue: 'Toes turned out, upper back slightly rounded. Squeeze the glutes to come up.' }),
      ex('glutes', 5, 'rdl', 'Romanian deadlift', { rir: '1–2',
        cue: 'Soft knees, hips back, bar close to the legs. Stop when the hamstrings stretch. Never grind these.' }),
      ex('side-delts', 1, 'lateral-raise', 'Dumbbell lateral raise', { step: 1, mult: 2, label: 'kg / hand',
        cue: 'Lead with the elbows, stop at shoulder height, lower slowly.' }),
      ex('side-delts', 2, 'machine-lateral-raise', 'Machine lateral raise', { stable: true,
        cue: 'Pads just above the elbows. Raise to shoulder height without shrugging.' }),
      ex('side-delts', 3, 'cable-lateral-raise', 'Cable lateral raise', { stable: true, mult: 2, label: 'kg / side',
        cue: 'Cable at hand height, one arm at a time. Lead with the elbow, stop at shoulder height.' }),
      ex('abs', 1, 'cable-crunch', 'Kneeling cable crunch', { stable: true,
        cue: 'Hips stay still. Curl the ribs towards the hips and breathe out hard at the bottom.' }),
      ex('abs', 2, 'machine-crunch', 'Machine crunch', { stable: true,
        cue: 'Curl the ribs towards the hips, slow on the way back.' }),
      ex('abs', 3, 'decline-crunch', 'Weighted decline crunch', { base: 30, label: 'kg added', start: 0,
        cue: 'Hold a plate on the chest. Curl up, don\'t yank with the hip flexors.' }),
      ex('biceps', 1, 'incline-curl', 'Incline dumbbell curl', { step: 1, mult: 2, label: 'kg / hand',
        cue: 'Bench at about 60 degrees, arms hanging. Curl without swinging the elbows forward.' }),
      ex('biceps', 2, 'preacher-curl', 'Preacher curl', { stable: true,
        cue: 'Armpits snug on the pad. Lower all the way, curl without lifting the elbows.' }),
      ex('biceps', 3, 'cable-curl', 'Cable curl', { stable: true,
        cue: 'Elbows pinned to your sides. Squeeze at the top, slow on the way down.' }),
      ex('triceps', 1, 'rope-pressdown', 'Rope pressdown', { stable: true,
        cue: 'Elbows pinned. Spread the rope apart at the bottom.' }),
      ex('triceps', 2, 'bar-pressdown', 'Straight-bar pressdown', { stable: true,
        cue: 'Elbows pinned, wrists straight. Lock out fully each rep.' }),
      ex('triceps', 3, 'overhead-extension', 'Overhead cable extension', { stable: true,
        cue: 'Face away from the cable, elbows by the ears. Stretch fully, then extend.' })
    ];
  }

  // Childhood-photo route: cards from the places along the way, plus two notes from home for the long gaps.
  var POSTCARDS = [
    ['p1', 90, 'Southwest Finland', 'Tampere', 'Helaraitti'],
    ['p2', 120, 'Salo', 'Salo', 'Halikonlahti bay'],
    ['p4', 170, 'Turku archipelago', 'Turku', 'Aura river'],
    ['p5', 250, 'Åland', 'Mariehamn', 'Åland islands'],
    ['p7', 380, 'Stockholm archipelago', 'Stockholm', 'Gamla stan'],
    ['p3', 640, 'Öland, off the left wing', 'Tampere', 'Pyynikki tower'],
    ['p8', 900, 'Øresund', 'Copenhagen', 'Nyhavn'],
    ['p9', 1050, 'Fehmarn Belt', 'Billund', 'Legoland'],
    ['p6', 1330, 'Hanover', 'Salo', 'Mathildedal village'],
    ['p10', 1600, 'the Eifel', 'Brussels', 'Grand-Place'],
    ['p11', 1697, 'Luxembourg (LUX)', 'Luxembourg', 'Old town']
  ];
  // The previous route, to recognise rows nobody has edited.
  var OLD_POSTCARDS = {
    p1: [90, 'Turku archipelago', 'Tampere', 'Helaraitti'], p2: [255, 'Åland', 'Salo', 'Halikonlahti bay'],
    p3: [380, 'Stockholm archipelago', 'Tampere', 'Pyynikki tower'], p4: [520, 'Gotland, off the left wing', 'Salo', 'Teijo National Park'],
    p5: [870, 'Øresund: halfway', 'Tampere', 'Tammerkoski rapids'], p6: [1190, 'Hamburg', 'Salo', 'Mathildedal village'],
    p7: [1530, 'Rhine, Cologne–Bonn', 'Tampere', 'Pispala ridge'], p8: [1660, 'Moselle valley', 'Salo', 'Market square'],
    p9: [1697, 'Luxembourg (LUX)', 'Tampere', 'Tampere–Pirkkala airport']
  };
  var KEEP_MEANING = { p1: 1, p2: 1, p3: 1, p6: 1 }; // same card, only moved along the route

  function seedPostcards() {
    return POSTCARDS.map(function (r) { return { id: r[0], km: r[1], over: r[2], from: r[3], place: r[4], photo: '', message: '', openedAt: '' }; });
  }

  /**
   * Moves a Sheet to the childhood-photo route without losing anything written.
   * A row is changed only while it still holds the old defaults; a repurposed row also has to be empty.
   * Edited rows stay as they are, and the new card is added next to them with a fresh id.
   */
  function postcardSync(data) {
    var writes = [], have = {}, maxId = POSTCARDS.length;   // fresh ids never clash with the route's own
    data.postcards.forEach(function (r) {
      have[str(r.id)] = r;
      var m = str(r.id).match(/^p(\d+)$/); if (m) maxId = Math.max(maxId, Number(m[1]));
    });
    function same(r, o, fields) {
      var cur = [Number(r.km), str(r.over).trim(), str(r.from).trim(), str(r.place).trim()];
      return fields.every(function (i) { return i === 3 && str(r.id) === 'p1' ? ['Helaraitti', 'Näsinneula tower'].indexOf(cur[3]) >= 0 : cur[i] === o[i]; });
    }
    function exists(n) {
      return data.postcards.some(function (r) { return Number(r.km) === n.km && str(r.from).trim() === n.from; });
    }
    seedPostcards().forEach(function (n) {
      var r = have[n.id], o = OLD_POSTCARDS[n.id];
      var row = { id: n.id, km: n.km, over: n.over, from: n.from, place: n.place, photo: '', message: '', openedAt: '' };
      if (!r) { if (!exists(n)) writes.push({ tab: 'Postcards', kind: 'append', row: row }); return; }
      if (!o) return; // already a new-route card
      if (KEEP_MEANING[n.id]) {
        if (same(r, o, [0, 1])) writes.push({ tab: 'Postcards', kind: 'patch', by: 'id', value: n.id, patch: { km: n.km, over: n.over } });
        return;
      }
      if (same(r, o, [0, 1, 2, 3]) && !str(r.message).trim() && !str(r.photo).trim()) {
        writes.push({ tab: 'Postcards', kind: 'patch', by: 'id', value: n.id, patch: { km: n.km, over: n.over, from: n.from, place: n.place } });
      } else if (!exists(n)) {
        row.id = 'p' + (++maxId);           // the old card has his words in it: keep it, add the new one beside it
        writes.push({ tab: 'Postcards', kind: 'append', row: row });
      }
    });
    return writes;
  }

  var RETIRED = ['machine-chest-press', 'low-incline-db-press', 'flat-db-press', 'weighted-dip', 'db-row',
    'incline-smith-press', 'incline-bb-press', 'incline-machine-press']; // chest locked to the incline DB press (Nov 2026)

  /**
   * Keeps an existing Exercises tab in step with the seed: adds new exercises, retires old ones
   * (active = FALSE, history kept), and updates rank. Returns writes.
   */
  function exerciseSync(data) {
    var writes = [], have = {};
    data.exercises.forEach(function (r) { have[str(r.id)] = r; });
    seedExercises().forEach(function (s) {
      var cur = have[s.id];
      if (!cur) writes.push({ tab: 'Exercises', kind: 'append', row: s });
      else if (String(cur.rank) !== String(s.rank)) writes.push({ tab: 'Exercises', kind: 'patch', by: 'id', value: s.id, patch: { rank: s.rank } });
    });
    RETIRED.forEach(function (id) {
      if (have[id] && String(have[id].active).toUpperCase() !== 'FALSE') writes.push({ tab: 'Exercises', kind: 'patch', by: 'id', value: id, patch: { active: false } });
    });
    data.slots.forEach(function (r) {
      if (str(r.slot) === 'chest' && str(r.muscle) === 'Chest') writes.push({ tab: 'Slots', kind: 'patch', by: 'slot', value: 'chest', patch: { muscle: 'Chest and front delts' } });
    });
    return writes;
  }

  /** What upgrade() changes in a Sheet made with an older version. Only untouched defaults change. */
  function upgradePlan(data) {
    var s = data.settings, out = { settings: [], postcards: [], unused: [] };
    function want(key, value, olds) {
      var cur = s[key], missing = cur === undefined;
      if (missing || (olds && olds.some(function (o) { return String(cur).trim() === String(o); })))
        if (String(cur) !== String(value)) out.settings.push({ key: key, value: value, note: SETTING_NOTES[key] || '', add: missing });
    }
    want('herName', s.passengerName || '');
    want('travellerName', 'Elmo');
    want('flightNo', FLIGHT_NO, ['', 'FL 1697']);
    want('dayAName', 'Heavy', ['Push first']);
    want('dayBName', 'Volume', ['Pull first']);
    want('introWeeks', 1);
    want('kmPerRep', FlightEngine.DEFAULTS.kmPerRep);
    want('goals', GOALS);
    ['passengerName', 'layoverWeek', 'kmCruise', 'kmTailwind', 'jetPerUpgrade', 'jetCap', 'vBaseA', 'vBaseB'].forEach(function (k) {
      if (s[k] !== undefined) out.unused.push(k);
    });
    data.postcards.forEach(function (p) {
      if (String(p.id) === 'p1' && String(p.place).trim() === 'Näsinneula tower') out.postcards.push({ id: 'p1', patch: { place: 'Helaraitti' } });
    });
    return out;
  }

  // ---------- reading ----------
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function parseSets(json) { try { var a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

  function toEngineInput(data) {
    return {
      settings: data.settings, slots: data.slots, exercises: data.exercises,
      choices: data.choices.map(function (r) { return { at: str(r.at), slot: str(r.slot), day: str(r.day), ex: str(r.exercise) }; }),
      sessions: data.sessions.map(function (r) {
        return { id: str(r.id), date: str(r.date).slice(0, 10), day: str(r.day).toUpperCase(), minutes: r.minutes,
          effort: r.effort === '' ? null : Number(r.effort), note: str(r.note), savedAt: str(r.savedAt), sets: parseSets(r.setsJson),
          photo: str(r.photo) !== '' };
      }),
      overrides: data.overrides.map(function (r) { return { date: str(r.date).slice(0, 10), ex: str(r.exercise), kg: r.kg }; }),
      stamps: data.stamps.map(function (r) { return { date: str(r.date).slice(0, 10), type: str(r.type) }; })
    };
  }

  function photoUrl(p) {
    p = str(p).trim();
    if (!p) return '';
    var m = p.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]{20,})/);
    return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200' : p;
  }
  // A tiny version of a sealed card's photo: enough for a blurred hint, not enough to see it.
  function teaserUrl(p) {
    p = str(p).trim();
    if (!p) return '';
    var m = p.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]{20,})/);
    return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w24' : p;
  }

  var PUBLIC_SETTINGS = ['herName', 'travellerName', 'flightNo', 'dayAName', 'dayBName', 'startDate', 'introWeeks',
    'trainingWeekdays', 'routeKm', 'kmPerRep', 'goals'];

  function buildState(data, role, today) {
    var input = toEngineInput(data);
    var result = FlightEngine.replay(input);
    var cum = result.cumKm;
    var settings = {};
    PUBLIC_SETTINGS.forEach(function (k) { settings[k] = data.settings[k] === undefined ? '' : data.settings[k]; });
    function crossedOn(km) {
      for (var i = 0; i < result.sessions.length; i++) if (result.sessions[i].cumKm >= km) return result.sessions[i].date;
      return '';
    }
    var cards = data.postcards.slice().sort(function (a, b) { return Number(a.km) - Number(b.km); }).map(function (p) {
      var km = Number(p.km), written = str(p.message).trim() !== '', delivered = written && cum >= km;
      var c = { id: str(p.id), km: km, over: str(p.over), from: str(p.from), place: str(p.place),
        delivered: delivered, deliveredOn: delivered ? crossedOn(km) : '', openedAt: str(p.openedAt) };
      if (delivered || role === 'coach') { c.message = str(p.message); c.photo = photoUrl(p.photo); }
      if (role === 'coach') c.written = written;
      c._photo = p.photo;
      return c;
    });
    // Only the next sealed card on the route gets a blurred teaser.
    var nextUp = cards.filter(function (c) { return !c.delivered && c.km > cum; })[0];
    if (nextUp && str(nextUp._photo).trim()) nextUp.teaser = teaserUrl(nextUp._photo);
    cards.forEach(function (c) { delete c._photo; });
    return {
      role: role, today: today, settings: settings, slots: data.slots, exercises: data.exercises,
      choices: input.choices, sessions: input.sessions, overrides: input.overrides, stamps: input.stamps,
      postcards: cards,
      cheers: data.cheers.map(function (r) { return { id: str(r.id), createdAt: str(r.createdAt), text: str(r.text), seenAt: str(r.seenAt) }; }),
      reactions: (data.reactions || []).map(function (r) {
        return { id: str(r.id), at: str(r.at), sessionId: str(r.sessionId), emoji: str(r.emoji), text: str(r.text), seenAt: str(r.seenAt) };
      }),
      summary: { cumKm: cum, completed: result.completedCount, reps: result.totalReps, landedOn: result.landedOn }
    };
  }

  // ---------- writing ----------
  function bad(msg) { var e = new Error(msg); e.code = 'bad_request'; throw e; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(str(s)); }
  function clip(s, n) { return str(s).slice(0, n); }

  var ROLE_OPS = {
    athlete: ['saveSession', 'stamp', 'postcardOpened', 'cheerSeen', 'choice', 'deload', 'photo', 'reactionSeen'],
    coach: ['cheer', 'override', 'choice', 'deload', 'react']
  };

  function applyOp(data, op, role, nowIso) {
    if (!data.reactions) data.reactions = [];
    if (!op || !op.type) bad('missing op');
    if ((ROLE_OPS[role] || []).indexOf(op.type) < 0) bad('not allowed: ' + op.type);
    var writes = [], notify = null, photo = null;
    var exById = {};
    data.exercises.forEach(function (e) { exById[str(e.id)] = e; });

    function upsert(tab, by, row) {
      var arr = data[KEY[tab]], found = false;
      for (var i = 0; i < arr.length; i++) if (str(arr[i][by]) === str(row[by])) { arr[i] = row; found = true; }
      if (!found) arr.push(row);
      writes.push({ tab: tab, kind: 'upsert', by: by, row: row });
      return !found;
    }
    function patch(tab, by, value, p) {
      data[KEY[tab]].forEach(function (r) { if (str(r[by]) === str(value)) for (var k in p) r[k] = p[k]; });
      writes.push({ tab: tab, kind: 'patch', by: by, value: value, patch: p });
    }
    function append(tab, row) { data[KEY[tab]].push(row); writes.push({ tab: tab, kind: 'append', row: row }); }

    if (op.type === 'saveSession') {
      var s = op.session || {};
      if (!s.id || !isDate(s.date) || (s.day !== 'A' && s.day !== 'B')) bad('invalid session');
      var sets = (s.sets || []).slice(0, 200).map(function (x) {
        return { slot: clip(x.slot, 40), ex: clip(x.ex, 60), set: Number(x.set) || 0, kg: Number(x.kg) || 0,
          reps: Number(x.reps) || 0, done: !!x.done, fb: ['easy', 'ok', 'hard'].indexOf(x.fb) >= 0 ? x.fb : '', skip: !!x.skip,
          rir: clip(x.rir, 6), target: Number(x.target) || 0 };
      });
      var row = { id: clip(s.id, 60), date: s.date, day: s.day, week: '', minutes: Number(s.minutes) || '',
        effort: s.effort ? Number(s.effort) : '', note: clip(s.note, 2000), reps: '', km: '', cumKm: '', volumeKg: '',
        upgrades: '', completed: '', savedAt: nowIso, setsJson: JSON.stringify(sets) };
      var isNew = upsert('Sessions', 'id', row);
      data.sets = data.sets.filter(function (r) { return str(r.sessionId) !== row.id; });
      writes.push({ tab: 'Sets', kind: 'deleteWhere', col: 'sessionId', value: row.id });
      sets.filter(function (x) { return x.done; }).forEach(function (x) {
        append('Sets', { sessionId: row.id, date: row.date, day: row.day, slot: x.slot, exercise: x.ex,
          exerciseName: exById[x.ex] ? exById[x.ex].name : x.ex, set: x.set, kg: x.kg, reps: x.reps, done: x.done,
          feedback: x.fb === 'easy' ? 'Too easy' : x.fb === 'ok' ? 'Just right' : x.fb === 'hard' ? 'Too hard' : '' });
      });
      var result = FlightEngine.replay(toEngineInput(data));
      result.sessions.forEach(function (c) {
        var p = { week: c.week, reps: c.reps, km: c.km, cumKm: c.cumKm, volumeKg: c.volume,
          upgrades: c.upgrades.map(function (id) { return exById[id] ? exById[id].name : id; }).join(', '), completed: c.completed };
        var cur = null;
        data.sessions.forEach(function (r) { if (str(r.id) === c.id) cur = r; });
        if (!cur) return;
        var changed = false;
        for (var k in p) if (str(cur[k]) !== str(p[k])) changed = true;
        if (changed) patch('Sessions', 'id', c.id, p);
      });
      if (isNew) notify = report(data, result, row.id);
    } else if (op.type === 'stamp') {
      if (!isDate(op.date) || ['ballet', 'run'].indexOf(op.stampType) < 0) bad('invalid stamp');
      var has = data.stamps.some(function (r) { return str(r.date).slice(0, 10) === op.date && r.type === op.stampType; });
      if (op.on && !has) append('Stamps', { date: op.date, type: op.stampType });
      else if (!op.on && has) {
        data.stamps = data.stamps.filter(function (r) { return !(str(r.date).slice(0, 10) === op.date && r.type === op.stampType); });
        writes.push({ tab: 'Stamps', kind: 'deleteWhere2', cols: ['date', 'type'], values: [op.date, op.stampType] });
      }
    } else if (op.type === 'deload') {
      var d = isDate(op.date) ? op.date : str(nowIso).slice(0, 10);
      var dup = data.stamps.some(function (r) { return str(r.date).slice(0, 10) === d && r.type === 'deload'; });
      if (!dup) append('Stamps', { date: d, type: 'deload' });
    } else if (op.type === 'choice') {
      var e = exById[str(op.ex)];
      if (!e || str(e.slot) !== str(op.slot)) bad('invalid choice');
      var day = FlightEngine.dayOf(op.day);
      append('Choices', { at: str(op.at) || nowIso, slot: str(op.slot), day: day, exercise: str(op.ex) });
    } else if (op.type === 'photo') {
      // the image itself is stored by the adapter (Drive in Apps Script, browser storage in the demo)
      var known = data.sessions.some(function (r) { return str(r.id) === str(op.sessionId); });
      var url = str(op.dataUrl);
      if (!known || !/^data:image\/(jpeg|png|webp);base64,/.test(url) || url.length > 3000000) bad('invalid photo');
      photo = { sessionId: str(op.sessionId), dataUrl: url };
    } else if (op.type === 'react') {
      var sid = str(op.sessionId), emo = clip(op.emoji, 8).trim(), txt = clip(op.text, 280).trim();
      if (!data.sessions.some(function (r) { return str(r.id) === sid; }) || (!emo && !txt)) bad('invalid reaction');
      append('Reactions', { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: nowIso, sessionId: sid, emoji: emo, text: txt, seenAt: '' });
    } else if (op.type === 'reactionSeen') {
      patch('Reactions', 'id', clip(op.id, 40), { seenAt: nowIso });
    } else if (op.type === 'postcardOpened') {
      patch('Postcards', 'id', clip(op.id, 20), { openedAt: nowIso });
    } else if (op.type === 'cheerSeen') {
      patch('Cheers', 'id', clip(op.id, 40), { seenAt: nowIso });
    } else if (op.type === 'cheer') {
      var text = clip(op.text, 280).trim();
      if (!text) bad('empty cheer');
      append('Cheers', { id: 'c' + Date.now().toString(36), createdAt: nowIso, text: text, seenAt: '' });
    } else if (op.type === 'override') {
      if (!exById[str(op.ex)] || !isFinite(Number(op.kg))) bad('invalid override');
      append('Overrides', { date: str(nowIso).slice(0, 10), exercise: str(op.ex), kg: Number(op.kg), note: clip(op.note, 200) });
    }
    return { writes: writes, notify: notify, photo: photo };
  }

  function report(data, result, sessionId) {
    var c = null, n = 0;
    result.sessions.forEach(function (s, i) { if (s.id === sessionId) { c = s; n = i + 1; } });
    if (!c) return null;
    var names = {};
    data.exercises.forEach(function (e) { names[str(e.id)] = str(e.name); });
    var st = result.settings, who = str(data.settings.travellerName) || 'Elmo';
    var dayName = str(data.settings[c.day === 'A' ? 'dayAName' : 'dayBName']) || 'Day ' + c.day;
    var left = Math.max(0, Math.round(st.routeKm - c.cumKm));
    var lines = [];
    lines.push('Workout ' + n + ' (' + dayName + (c.mode === 'deload' ? ', easier week' : c.mode === 'intro' ? ', intro week' : c.mode === 'back' ? ', first workout after a break' : '') +
      (c.minutes ? ', ' + c.minutes + ' min' : '') + '): ' + c.reps + ' reps, +' + c.km + ' km.');
    lines.push(left > 0 ? left + ' km until ' + who + ' flies to Luxembourg.' : 'Flight unlocked: ' + who + ' to LUX!');
    lines.push(c.done + '/' + c.prescribed + ' working sets.');
    if (c.improvements.length) lines.push('Improvements: ' + c.improvements.map(function (x) { return (names[x.ex] || x.ex) + ': ' + x.text; }).join('; ') + '.');
    if (c.goals && c.goals.length) lines.push('🎯 GOAL REACHED: ' + c.goals.map(function (g) { return g.label; }).join(', ') + '!');
    if (c.prs.length) lines.push('New personal best: ' + c.prs.map(function (p) { return (names[p.ex] || p.ex) + ' ' + p.kg + ' kg × ' + p.reps; }).join(', ') + ' >:)');
    if (c.upgrades.length) lines.push('Heavier next time: ' + c.upgrades.map(function (id) { return names[id] || id; }).join(', ') + '.');
    var recent = result.sessions.slice(-3).map(function (x) { return x.id; }), hardN = 0, hardMet = 0, total = 0;
    data.sessions.forEach(function (row) {
      if (recent.indexOf(str(row.id)) < 0) return;
      parseSets(row.setsJson).forEach(function (x) {
        if (!x.done || x.skip) return;
        total++;
        if (x.fb === 'hard') { hardN++; if (Number(x.target) > 0 && Number(x.reps) >= Number(x.target)) hardMet++; }
      });
    });
    if (recent.length === 3 && total >= 20 && hardN >= total * 0.6 && hardMet >= hardN * 0.8)
      lines.push('Heads-up: she has tapped "Too hard" on most sets for 3 workouts but still made the goal reps. Weights go up slowly while she does that, so worth a chat (or set a weight in the coach view).');
    if (result.fatigue.offer) lines.push('Several lifts dipped over the last two weeks. The app offers her an easier week.');
    if (c.effort) lines.push('Effort ' + c.effort + '/5.');
    if (c.note) lines.push('Her note: "' + c.note + '"');
    var next = data.postcards.filter(function (p) { return Number(p.km) > c.cumKm; }).sort(function (a, b) { return Number(a.km) - Number(b.km); })[0];
    if (next) lines.push('Next postcard: ' + next.place + ' (' + next.from + ') in ' + Math.round(Number(next.km) - c.cumKm) + ' km.' +
      (str(next.message).trim() ? '' : ' It is still empty: write it in the Postcards tab.'));
    return { subject: (c.goals && c.goals.length ? '🎯 Goal reached! ' : '') + '✈ +' + c.km + ' km, ' + left + ' km to LUX', body: lines.join('\n'), sessionId: sessionId };
  }

  return {
    TABS: TABS, KEY: KEY, seedSettings: seedSettings, seedSlots: seedSlots, seedExercises: seedExercises,
    seedPostcards: seedPostcards, postcardSync: postcardSync, upgradePlan: upgradePlan, exerciseSync: exerciseSync, toEngineInput: toEngineInput, buildState: buildState,
    applyOp: applyOp, photoUrl: photoUrl, teaserUrl: teaserUrl
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FlightCore;
