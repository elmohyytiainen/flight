/*
 * FlightCore — the backend's logic, independent of where data is stored.
 *
 * Works on `data`, an in-memory copy of the Sheet:
 *   { settings: {key: value}, program: [...], sessions: [...], sets: [...],
 *     overrides: [...], stamps: [...], postcards: [...], cheers: [...] }
 * Each array holds row objects keyed by the tab's column headers (TABS below).
 *
 * applyOp() changes `data` and returns a list of writes, which the storage
 * adapter replays: the Apps Script adapter writes them into the Sheet, the
 * demo adapter into the browser's storage.
 *
 * This exact file runs in the web app (core.js, demo mode only) and in Apps
 * Script (pasted as Core.gs). Needs FlightEngine.
 */
var FlightCore = (function () {
  'use strict';

  var TABS = {
    Settings: ['key', 'value', 'note'],
    Program: ['day', 'order', 'id', 'name', 'sets', 'repMin', 'repMax', 'stepKg', 'loadMult', 'kgLabel',
      'restSec', 'startKg', 'cue', 'video', 'alternatives', 'active'],
    Sessions: ['id', 'date', 'day', 'week', 'effort', 'mood', 'note', 'volumeKg', 'upgrades', 'km', 'cumKm',
      'completed', 'savedAt', 'setsJson'],
    Sets: ['sessionId', 'date', 'day', 'exercise', 'exerciseName', 'set', 'kg', 'reps', 'done', 'swap'],
    Overrides: ['date', 'exercise', 'kg', 'note'],
    Stamps: ['date', 'type'],
    Postcards: ['id', 'km', 'over', 'from', 'place', 'photo', 'message', 'openedAt'],
    Cheers: ['id', 'createdAt', 'text', 'seenAt']
  };

  // Which data key each tab maps to
  var KEY = { Settings: 'settings', Program: 'program', Sessions: 'sessions', Sets: 'sets',
    Overrides: 'overrides', Stamps: 'stamps', Postcards: 'postcards', Cheers: 'cheers' };

  // ---------- seed content (what setup() writes into a fresh Sheet) ----------

  function yt(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q + ' form'); }

  function seedSettings(keys) {
    return [
      ['passengerName', '', 'Her name, printed on the boarding pass'],
      ['flightNo', 'FL 1697', 'Flight number on the boarding pass'],
      ['startDate', '2026-11-23', 'First Monday of Block 1 (week 1 = taxi week)'],
      ['trainingWeekdays', '1,5', 'Weekdays used for the landing estimate: 0=Sun, 1=Mon ... 5=Fri'],
      ['layoverWeek', 7, 'Deload week: 2 sets per exercise, no weight increases. 0 = none'],
      ['routeKm', 1697, 'Tampere-Pirkkala (TMP) to Luxembourg (LUX), great circle'],
      ['kmCruise', 35, 'km for any completed session'],
      ['kmTailwind', 30, 'km at baseline volume; scales with volume / week-1 volume'],
      ['jetPerUpgrade', 5, 'Bonus km per weight upgrade earned in a session'],
      ['jetCap', 15, 'Max bonus km per session'],
      ['vBaseA', '', 'Baseline volume for Day A in kg. Blank = her first completed Day A'],
      ['vBaseB', '', 'Baseline volume for Day B in kg. Blank = her first completed Day B'],
      ['coachEmail', keys.coachEmail || '', 'Where landing reports are emailed. Blank = no email'],
      ['appUrl', keys.appUrl || '', 'Web address of the app (GitHub Pages), used to build the links'],
      ['athleteKey', keys.athleteKey, 'Secret key in her link. Change it and resend the link if it leaks'],
      ['coachKey', keys.coachKey, 'Secret key in your coach link']
    ].map(function (r) { return { key: r[0], value: r[1], note: r[2] }; });
  }

  function ex(day, order, id, name, sets, repMin, repMax, stepKg, loadMult, kgLabel, restSec, startKg, cue, alts) {
    return { day: day, order: order, id: id, name: name, sets: sets, repMin: repMin, repMax: repMax,
      stepKg: stepKg, loadMult: loadMult, kgLabel: kgLabel, restSec: restSec, startKg: startKg,
      cue: cue, video: yt(name), alternatives: alts, active: true };
  }

  function seedProgram() {
    return [
      ex('A', 1, 'hip-thrust', 'Barbell hip thrust', 3, 8, 12, 2.5, 1, 'kg', 120, '',
        'Chin tucked, ribs down. Drive through the heels and pause 1 s at the top.',
        'Hip thrust machine; Smith machine hip thrust; Barbell glute bridge'),
      ex('A', 2, 'incline-db-press', 'Incline dumbbell press', 3, 8, 12, 1, 2, 'kg / hand', 90, '',
        'Bench at about 30 degrees. Lower to the upper chest, elbows slightly tucked.',
        'Incline machine press; Incline Smith machine press'),
      ex('A', 3, 'lat-pulldown', 'Lat pulldown', 3, 8, 12, 2.5, 1, 'kg', 90, '',
        'Lean back a little and pull the bar to your upper chest, leading with the elbows.',
        'Assisted pull-up; Single-arm cable pulldown'),
      ex('A', 4, 'cable-kickback', 'Cable glute kickback', 2, 12, 15, 2.5, 2, 'kg / side', 60, '',
        'Hinge slightly forward. Kick back and up without arching the lower back.',
        'Glute kickback machine; Banded kickback'),
      ex('A', 5, 'db-shoulder-press', 'Seated dumbbell shoulder press', 3, 8, 12, 1, 2, 'kg / hand', 90, '',
        'Back against the bench. Press up and slightly in, ribs down.',
        'Shoulder press machine; Arnold press'),
      ex('A', 6, 'lateral-raise', 'Dumbbell lateral raise', 2, 12, 20, 1, 2, 'kg / hand', 60, '',
        'Lead with the elbows, stop at shoulder height, lower slowly.',
        'Cable lateral raise; Lateral raise machine'),
      ex('A', 7, 'hip-abduction', 'Hip abduction machine', 2, 15, 20, 2.5, 1, 'kg', 60, '',
        'Lean slightly forward and pause when the legs are fully open.',
        'Banded side walk; Cable hip abduction'),
      ex('B', 1, 'rdl', 'Romanian deadlift', 3, 8, 10, 2.5, 1, 'kg', 120, '',
        'Soft knees, push the hips back, bar close to the legs. Stop when the hamstrings stretch.',
        'Dumbbell Romanian deadlift; Smith machine Romanian deadlift'),
      ex('B', 2, 'split-squat', 'Bulgarian split squat', 3, 8, 12, 1, 4, 'kg / hand', 90, '',
        'Slight forward lean, front knee tracks over the toes. Drive through the front heel.',
        'Reverse lunge; Smith machine split squat'),
      ex('B', 3, 'cable-row', 'Seated cable row', 3, 8, 12, 2.5, 1, 'kg', 90, '',
        'Chest up. Pull to the belly button and squeeze the shoulder blades together.',
        'Chest-supported row machine; Single-arm dumbbell row'),
      ex('B', 4, 'db-bench-press', 'Flat dumbbell bench press', 3, 8, 12, 1, 2, 'kg / hand', 90, '',
        'Feet planted, shoulder blades back. Lower to mid-chest.',
        'Chest press machine; Push-up'),
      ex('B', 5, 'back-extension', '45-degree back extension (glute focus)', 2, 12, 15, 2.5, 1, 'kg added', 60, 0,
        'Toes turned out, upper back slightly rounded. Squeeze the glutes to come up.',
        'Reverse hyperextension; Cable pull-through'),
      ex('B', 6, 'cable-curl', 'Cable biceps curl', 2, 10, 15, 2.5, 1, 'kg', 45, '',
        'Elbows pinned to your sides. Superset with the rope pushdown.',
        'Dumbbell curl'),
      ex('B', 7, 'rope-pushdown', 'Rope triceps pushdown', 2, 10, 15, 2.5, 1, 'kg', 60, '',
        'Elbows pinned. Spread the rope apart at the bottom.',
        'Overhead cable extension')
    ];
  }

  function seedPostcards() {
    return [
      ['p1', 90, 'Turku archipelago', 'Tampere', 'Näsinneula tower'],
      ['p2', 255, 'Åland', 'Salo', 'Halikonlahti bay'],
      ['p3', 380, 'Stockholm archipelago', 'Tampere', 'Pyynikki tower'],
      ['p4', 520, 'Gotland, off the left wing', 'Salo', 'Teijo National Park'],
      ['p5', 870, 'Øresund: halfway', 'Tampere', 'Tammerkoski rapids'],
      ['p6', 1190, 'Hamburg', 'Salo', 'Mathildedal village'],
      ['p7', 1530, 'Rhine, Cologne–Bonn', 'Tampere', 'Pispala ridge'],
      ['p8', 1660, 'Moselle valley', 'Salo', 'Market square'],
      ['p9', 1697, 'Luxembourg (LUX)', 'Tampere', 'Tampere–Pirkkala airport']
    ].map(function (r) {
      return { id: r[0], km: r[1], over: r[2], from: r[3], place: r[4], photo: '', message: '', openedAt: '' };
    });
  }

  // ---------- reading ----------

  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function truthy(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

  function parseSets(json) {
    try { var a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }

  function toEngineInput(data) {
    return {
      settings: data.settings,
      program: data.program,
      sessions: data.sessions.map(function (r) {
        return { id: str(r.id), date: str(r.date).slice(0, 10), day: str(r.day).toUpperCase(),
          effort: r.effort === '' ? null : Number(r.effort), mood: str(r.mood), note: str(r.note),
          savedAt: str(r.savedAt), sets: parseSets(r.setsJson) };
      }),
      overrides: data.overrides.map(function (r) {
        return { date: str(r.date).slice(0, 10), ex: str(r.exercise), kg: r.kg };
      })
    };
  }

  function photoUrl(p) {
    p = str(p).trim();
    if (!p) return '';
    var m = p.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]{20,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    return p;
  }

  var PUBLIC_SETTINGS = ['passengerName', 'flightNo', 'startDate', 'trainingWeekdays', 'layoverWeek', 'routeKm',
    'kmCruise', 'kmTailwind', 'jetPerUpgrade', 'jetCap', 'vBaseA', 'vBaseB'];

  /** Everything the app needs, for one role ('athlete' | 'coach'). */
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
      var km = Number(p.km);
      var written = str(p.message).trim() !== '';
      var delivered = written && cum >= km;
      var c = { id: str(p.id), km: km, over: str(p.over), from: str(p.from), place: str(p.place),
        delivered: delivered, deliveredOn: delivered ? crossedOn(km) : '', openedAt: str(p.openedAt) };
      if (delivered || role === 'coach') { c.message = str(p.message); c.photo = photoUrl(p.photo); }
      if (role === 'coach') c.written = written;
      return c;
    });

    return {
      role: role,
      today: today,
      settings: settings,
      program: data.program,
      sessions: input.sessions,
      overrides: input.overrides,
      stamps: data.stamps.map(function (r) { return { date: str(r.date).slice(0, 10), type: str(r.type) }; }),
      postcards: cards,
      cheers: data.cheers.map(function (r) {
        return { id: str(r.id), createdAt: str(r.createdAt), text: str(r.text), seenAt: str(r.seenAt) };
      }),
      summary: { cumKm: cum, completed: result.completedCount, totalVolume: result.totalVolume, landedOn: result.landedOn }
    };
  }

  // ---------- writing ----------

  function bad(msg) { var e = new Error(msg); e.code = 'bad_request'; throw e; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(str(s)); }
  function clip(s, n) { return str(s).slice(0, n); }

  var ROLE_OPS = {
    athlete: ['saveSession', 'stamp', 'postcardOpened', 'cheerSeen'],
    coach: ['cheer', 'override']
  };

  /**
   * Apply one operation. Mutates `data`; returns { writes, notify }.
   * writes: [{tab, kind:'upsert', by, row} | {tab, kind:'deleteWhere', col, value}
   *          | {tab, kind:'append', row} | {tab, kind:'patch', by, value, patch} | {tab:'Settings', kind:'setting', key, value}]
   */
  function applyOp(data, op, role, nowIso) {
    if (!op || !op.type) bad('missing op');
    if ((ROLE_OPS[role] || []).indexOf(op.type) < 0) bad('not allowed: ' + op.type);
    var writes = [], notify = null;

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

    if (op.type === 'saveSession') {
      var s = op.session || {};
      if (!s.id || !isDate(s.date) || (s.day !== 'A' && s.day !== 'B')) bad('invalid session');
      var sets = (s.sets || []).slice(0, 200).map(function (x) {
        return { ex: clip(x.ex, 60), set: Number(x.set) || 0, kg: Number(x.kg) || 0, reps: Number(x.reps) || 0,
          done: !!x.done, swap: clip(x.swap, 80) };
      });
      var row = { id: clip(s.id, 60), date: s.date, day: s.day, week: '', effort: s.effort ? Number(s.effort) : '',
        mood: clip(s.mood, 16), note: clip(s.note, 2000), volumeKg: '', upgrades: '', km: '', cumKm: '',
        completed: '', savedAt: nowIso, setsJson: JSON.stringify(sets) };
      var isNew = upsert('Sessions', 'id', row);

      // flat copy for charts in the Sheet
      data.sets = data.sets.filter(function (r) { return str(r.sessionId) !== row.id; });
      writes.push({ tab: 'Sets', kind: 'deleteWhere', col: 'sessionId', value: row.id });
      var names = {};
      data.program.forEach(function (e) { names[e.id] = e.name; });
      sets.forEach(function (x) {
        var r = { sessionId: row.id, date: row.date, day: row.day, exercise: x.ex,
          exerciseName: x.swap || names[x.ex] || x.ex, set: x.set, kg: x.kg, reps: x.reps, done: x.done, swap: x.swap };
        data.sets.push(r);
        writes.push({ tab: 'Sets', kind: 'append', row: r });
      });

      // refresh computed columns for every session (a change can ripple forward)
      var result = FlightEngine.replay(toEngineInput(data));
      result.sessions.forEach(function (c) {
        var p = { week: c.week, volumeKg: c.volume, upgrades: c.upgrades.join(', '), km: c.km.total,
          cumKm: c.cumKm, completed: c.completed };
        var cur = null;
        data.sessions.forEach(function (r) { if (str(r.id) === c.id) cur = r; });
        if (!cur) return;
        var changed = false;
        for (var k in p) if (str(cur[k]) !== str(p[k])) changed = true;
        if (changed) patch('Sessions', 'id', c.id, p);
      });
      if (isNew) notify = landingReport(data, result, row.id);
    } else if (op.type === 'stamp') {
      if (!isDate(op.date) || ['ballet', 'run'].indexOf(op.stampType) < 0) bad('invalid stamp');
      var exists = data.stamps.some(function (r) { return str(r.date).slice(0, 10) === op.date && r.type === op.stampType; });
      if (op.on && !exists) {
        var st = { date: op.date, type: op.stampType };
        data.stamps.push(st);
        writes.push({ tab: 'Stamps', kind: 'append', row: st });
      } else if (!op.on && exists) {
        data.stamps = data.stamps.filter(function (r) { return !(str(r.date).slice(0, 10) === op.date && r.type === op.stampType); });
        writes.push({ tab: 'Stamps', kind: 'deleteWhere2', cols: ['date', 'type'], values: [op.date, op.stampType] });
      }
    } else if (op.type === 'postcardOpened') {
      patch('Postcards', 'id', clip(op.id, 20), { openedAt: nowIso });
    } else if (op.type === 'cheerSeen') {
      patch('Cheers', 'id', clip(op.id, 40), { seenAt: nowIso });
    } else if (op.type === 'cheer') {
      var text = clip(op.text, 280).trim();
      if (!text) bad('empty cheer');
      var ch = { id: 'c' + Date.now().toString(36), createdAt: nowIso, text: text, seenAt: '' };
      data.cheers.push(ch);
      writes.push({ tab: 'Cheers', kind: 'append', row: ch });
    } else if (op.type === 'override') {
      var known = data.program.some(function (e) { return str(e.id) === op.ex; });
      if (!known || !isFinite(Number(op.kg))) bad('invalid override');
      var ov = { date: str(nowIso).slice(0, 10), exercise: op.ex, kg: Number(op.kg), note: clip(op.note, 200) };
      data.overrides.push(ov);
      writes.push({ tab: 'Overrides', kind: 'append', row: ov });
    }
    return { writes: writes, notify: notify };
  }

  function landingReport(data, result, sessionId) {
    var c = null, n = 0;
    result.sessions.forEach(function (s, i) { if (s.id === sessionId) { c = s; n = i + 1; } });
    if (!c) return null;
    var names = {};
    data.program.forEach(function (e) { names[e.id] = e.name; });
    var st = result.settings;
    var lines = [];
    lines.push(c.completed
      ? 'Workout ' + n + ': the plane flew +' + c.km.total + ' km (cruise ' + c.km.cruise + ', tailwind ' + c.km.tailwind + ', jet stream ' + c.km.jet + ').'
      : 'Workout ' + n + ' logged but not completed (' + c.done + '/' + c.prescribed + ' sets), so the plane is holding.');
    lines.push('Position: ' + Math.round(c.cumKm) + ' / ' + st.routeKm + ' km.');
    lines.push('Day ' + c.day + ', week ' + c.week + (c.layover ? ' (layover)' : '') + '. Volume ' + c.volume + ' kg.');
    if (c.upgrades.length) lines.push('Upgrades: ' + c.upgrades.map(function (id) { return names[id] || id; }).join(', ') + '.');
    if (c.rerouted.length) lines.push('Weight dropped 10% after two hard sessions: ' + c.rerouted.map(function (id) { return names[id] || id; }).join(', ') + '.');
    if (c.effort) lines.push('Effort ' + c.effort + '/5' + (c.mood ? ', mood ' + c.mood : '') + '.');
    if (c.note) lines.push('Her note: "' + c.note + '"');
    var next = data.postcards.filter(function (p) { return Number(p.km) > c.cumKm; })
      .sort(function (a, b) { return Number(a.km) - Number(b.km); })[0];
    if (next) {
      var left = Math.round(Number(next.km) - c.cumKm);
      lines.push('Next postcard: ' + next.place + ' (' + next.from + '), over ' + next.over + ' in ' + left + ' km.' +
        (str(next.message).trim() ? '' : ' It is still empty: write it in the Postcards tab.'));
    }
    return { subject: (c.completed ? '✈ +' + c.km.total + ' km' : 'Holding pattern') + ' — ' + Math.round(c.cumKm) + '/' + st.routeKm + ' km', body: lines.join('\n') };
  }

  return {
    TABS: TABS,
    KEY: KEY,
    seedSettings: seedSettings,
    seedProgram: seedProgram,
    seedPostcards: seedPostcards,
    toEngineInput: toEngineInput,
    buildState: buildState,
    applyOp: applyOp,
    photoUrl: photoUrl
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FlightCore;
