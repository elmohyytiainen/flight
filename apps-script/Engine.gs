// GENERATED from web/engine.js by scripts/build.js. Do not edit here.
/*
 * FlightEngine v5 — progression + flight calculations.
 *
 * Pure functions: reads settings, slots, exercises, choices, sessions, overrides and stamps
 * and returns results. Nothing is stored, so history can be replayed any time.
 * Runs in the web app (engine.js) and in Apps Script (pasted as Engine.gs). Plain ES5.
 *
 * Program model
 *   Slot     = a target muscle (Chest, Upper back, ...) with Day A (Heavy) and Day B (Volume)
 *              sets, rep ranges, rest and effort rules. Slots sharing `pair` run as a superset.
 *   Exercise = one variation inside a slot (rank 1 = recommended). She picks one per slot.
 *
 * Progression (v5)
 *   - One history and ONE strength estimate per exercise, fed by every set on both days
 *     (Epley, using the reps in reserve each set was prescribed and her Too easy / Too hard taps).
 *   - Each day keeps its own working weight, but the weight is chosen from the shared estimate:
 *     it goes up as soon as the estimate says she can still do the bottom of that day's range
 *     plus one rep of margin, at the next increment. A good Friday lifts Monday too, but the
 *     margin keeps a high-rep Friday from pushing Monday up before she is ready.
 *   - At the same weight, every set that isn't at the top yet gets one more rep.
 *   - All sets at the top always earns at least one increment. "Too hard" holds the weight.
 *   - Small lifts (one step is more than 8% of the load: raises, curls, light dumbbells) move on
 *     a top set: the first set at the top of the range and the average within one rep. Reaching it
 *     on either day lifts the other day too, if that day's range doesn't go higher.
 *     After a jump on a small lift she may land up to 3 reps under the range (and never under
 *     3/4 of its bottom) without the weight dropping back. She builds the reps up at the new weight.
 *   - An increase is not taken straight back: the first miss at a new weight holds it once
 *     (aiming for the bottom of the range) unless she was far off. The next miss drops it.
 *   - Otherwise the weight only drops through her performance, a coach override or an easier week.
 *   - Several lifts declining over two weeks -> an easier week is offered.
 *
 * Flight: every rep on a completed working set earns kmPerRep.
 */
var FlightEngine = (function () {
  'use strict';

  var DEFAULTS = {
    routeKm: 1697,
    kmPerRep: 0.38,
    introWeeks: 1,
    trainingWeekdays: [1, 5],
    startDate: '2026-11-23',
    deloadSessions: 2,
    fatigueLifts: 3,
    completeShare: 0.8,
    goals: ''
  };

  // ---------- helpers ----------
  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function isTrue(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
  function isFalse(v) { return v === false || String(v).toUpperCase() === 'FALSE'; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function roundToStep(kg, step) {
    if (!step || step <= 0) return round1(kg);
    return Math.round(Math.round(kg / step) * step * 100) / 100;
  }
  function floorToStep(kg, step) {
    if (!step || step <= 0) return round1(kg);
    return Math.round(Math.floor(kg / step + 1e-9) * step * 100) / 100;
  }
  function parseDate(s) { var p = String(s).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(ms) {
    var d = new Date(ms), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDays(ds, n) { return fmtDate(parseDate(ds) + n * 864e5); }
  function weekday(ds) { return new Date(parseDate(ds)).getUTCDay(); }
  function weekOf(ds, start) { return Math.floor(Math.floor((parseDate(ds) - parseDate(start)) / 864e5) / 7) + 1; }
  function fill(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

  function dayOf(v) {
    v = str(v).toUpperCase();
    if (/BOTH|ALL/.test(v)) return 'AB';
    var a = v.indexOf('A') >= 0, b = v.indexOf('B') >= 0;
    return a && b ? 'AB' : b ? 'B' : a ? 'A' : 'AB';
  }

  function normSettings(s) {
    s = s || {};
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    for (var key in s) if (s[key] !== '' && s[key] !== null && s[key] !== undefined) out[key] = s[key];
    ['routeKm', 'kmPerRep', 'introWeeks', 'deloadSessions', 'fatigueLifts', 'completeShare'].forEach(function (k) {
      out[k] = num(out[k], DEFAULTS[k]);
    });
    if (typeof out.trainingWeekdays === 'string') out.trainingWeekdays = out.trainingWeekdays.split(/[,; ]+/).filter(Boolean).map(Number);
    if (typeof out.trainingWeekdays === 'number') out.trainingWeekdays = [out.trainingWeekdays];
    if (!out.trainingWeekdays || !out.trainingWeekdays.length) out.trainingWeekdays = DEFAULTS.trainingWeekdays;
    out.startDate = String(out.startDate).slice(0, 10);
    return out;
  }

  // ---------- program ----------
  function normSlot(r, idx) {
    function side(d) {
      return { sets: Math.max(0, num(r['sets' + d], 0)), min: num(r['repMin' + d], 8), max: num(r['repMax' + d], 12),
        rest: num(r['rest' + d], 150), rirLast: str(r['rirLast' + d]) };
    }
    return {
      key: str(r.slot), muscle: str(r.muscle) || str(r.slot), idx: idx,
      order: { A: num(r.orderA, idx + 1), B: num(r.orderB, num(r.orderA, idx + 1)) },
      pair: str(r.pair), A: side('A'), B: side('B'),
      stableOnly: isTrue(r.lastRirStableOnly), failureLast: str(r.failureLast).toUpperCase(),
      calibrate: isTrue(r.calibrate), active: !isFalse(r.active), variants: []
    };
  }

  function normExercise(r, idx) {
    return {
      id: str(r.id), slot: str(r.slot), name: str(r.name) || str(r.id), rank: num(r.rank, idx + 1),
      stepKg: num(r.stepKg, 2.5), loadMult: num(r.loadMult, 1), baseKg: num(r.baseKg, 0),
      kgLabel: str(r.kgLabel) || 'kg', assisted: isTrue(r.assisted), stable: isTrue(r.stable),
      rir: str(r.rir), startKg: num(r.startKg, null), cue: str(r.cue), video: str(r.video),
      active: !isFalse(r.active)
    };
  }

  function buildProgram(slotRows, exRows) {
    var slots = (slotRows || []).map(normSlot).filter(function (s) { return s.key && s.active; });
    var byKey = {}, exById = {};
    slots.forEach(function (s) { byKey[s.key] = s; });
    (exRows || []).map(normExercise).forEach(function (e) {
      if (!e.id || !e.active || !byKey[e.slot]) return;
      exById[e.id] = e;
      byKey[e.slot].variants.push(e);
    });
    slots = slots.filter(function (s) { return s.variants.length; });
    slots.forEach(function (s) { s.variants.sort(function (a, b) { return a.rank - b.rank; }); });
    return { slots: slots, byKey: byKey, exById: exById };
  }

  function slotsOn(prog, day) {
    return prog.slots.filter(function (s) { return s[day].sets > 0; })
      .sort(function (a, b) { return a.order[day] - b.order[day] || a.idx - b.idx; });
  }

  function setsFor(n, mode) {
    if (mode === 'deload') return Math.max(1, Math.ceil(n / 2));
    if (mode === 'intro' || mode === 'back') return Math.max(1, n - 1);
    return n;
  }

  // ---------- strength estimates (Epley) ----------
  function loadOf(e, kg) { return e.assisted ? Math.max(1, e.baseKg - kg) : e.baseKg + kg; }
  function oneRm(e, kg, reps, rir) { var a = loadOf(e, kg); return a > 0 ? a * (1 + (reps + (rir || 0)) / 30) : 0; }
  function rirNum(r) {
    var m = String(r === undefined || r === null ? '1' : r).match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?/);
    if (!m) return 1;
    return m[2] !== undefined ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
  }
  function fbAdj(fb) { return fb === 'easy' ? 3 : fb === 'hard' ? -0.5 : 0; /* easy = 3+ more reps were there */ }
  /** Reps she should manage at kg with `rir` left, from the strength estimate. */
  function predReps(e, est, kg, rir) { var a = loadOf(e, kg); return a > 0 ? Math.floor(est / a * 30 - 30 - rir + 1e-9) : 0; }
  /** Working weight for `reps` with 1 in reserve. */
  function kgFor(e, est, reps) {
    var load = est / (1 + (reps + 1) / 30);
    var kg = e.assisted ? Math.max(0, Math.ceil((e.baseKg - load) / e.stepKg - 1e-9) * e.stepKg) : Math.max(0, floorToStep(load - e.baseKg, e.stepKg));
    return Math.round(kg * 100) / 100;
  }

  /** Extra increments a calibration set earns (1–3) while targets stay inside the range. */
  function stepsUp(e, side, kg, reps) {
    if (e.assisted || loadOf(e, kg) <= 0) return 1;
    var rm = oneRm(e, kg, reps, 1);
    for (var k = 3; k >= 2; k--) {
      var b = loadOf(e, kg + k * e.stepKg);
      if (rm / b * 30 - 30 - 1 >= side.min) return k;
    }
    return 1;
  }

  // ---------- comparing two results ----------
  function fmtKg(x) { return String(Math.round(x * 100) / 100); }

  function compare(e, prev, cur) {
    if (!prev || !cur) return null;
    var dk = cur.kg - prev.kg;
    if (e.assisted) dk = -dk;
    var avgPrev = prev.total / prev.sets, avgCur = cur.total / cur.sets;
    if (dk > 0.001) {
      if (avgCur >= avgPrev - 1e-9) return fmtKg(dk) + ' kg ' + (e.assisted ? 'less assistance' : 'more') + ' for the same reps';
      return fmtKg(dk) + ' kg ' + (e.assisted ? 'less assistance' : 'more than last time');
    }
    if (Math.abs(dk) < 0.001 && cur.sets === prev.sets && cur.total > prev.total) {
      var n = cur.total - prev.total;
      return n + ' more rep' + (n === 1 ? '' : 's') + ' at the same weight';
    }
    return null;
  }

  function declined(e, prev, cur) {
    if (!prev || !cur) return false;
    var dk = cur.kg - prev.kg;
    if (e.assisted) dk = -dk;
    if (dk < -0.001) return true;
    return Math.abs(dk) < 0.001 && cur.sets === prev.sets && cur.total < prev.total;
  }

  // ---------- replay ----------
  function sortSessions(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return String(a.savedAt || a.id) < String(b.savedAt || b.id) ? -1 : 1;
    });
  }

  var BREAK_DAYS = 14;
  /** Session mode: easier week, intro week, first workout back after a 2-week break, or normal. */
  function modeFor(st, dateStr, deloadLeft, lastDate) {
    if (deloadLeft > 0) return 'deload';
    var week = weekOf(dateStr, st.startDate);
    if (week >= 1 && week <= st.introWeeks) return 'intro';
    if (lastDate && (Date.parse(dateStr) - Date.parse(lastDate)) / 864e5 >= BREAK_DAYS) return 'back';
    return 'normal';
  }

  function newState() {
    return { kg: null, lastKg: null, lastReps: null, hard: false, topAll: false, overridden: false,
      grace: 0, held: false, floor: null, crossTop: null };
  }

  /** A small lift: one step is a big share of the load (raises, curls, light dumbbells). */
  function isSmall(e, kg) { var a = loadOf(e, kg); return !e.assisted && a > 0 && e.stepKg / a > 0.08; }
  /** How far under the range a small lift may land right after a jump. */
  function jumpFloor(side) { return Math.max(1, side.min - 3, Math.ceil(side.min * 0.75)); }

  /**
   * Goals from the Settings text, e.g. "assisted-chinup:0, incline-db-press:20, hip-thrust:60x5".
   * Each is exercise id : weight (assistance for assisted lifts) and optional x reps (default 1).
   */
  function parseGoals(text, prog) {
    var out = [];
    String(text || '').split(/[,;\n]+/).forEach(function (part) {
      var m = part.trim().match(/^([\w-]+)\s*:\s*(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*(\d+))?$/i);
      if (!m) return;
      var e = prog.exById[m[1]];
      if (!e) return;
      var g = { id: m[1] + '@' + m[2] + (m[3] ? 'x' + m[3] : ''), ex: e.id, kg: Number(m[2].replace(',', '.')), reps: m[3] ? Number(m[3]) : 1 };
      g.label = goalLabel(e, g);
      out.push(g);
    });
    return out;
  }
  function goalLabel(e, g) {
    var base = e.assisted ? e.name.replace(/^assisted\s+/i, '') : e.name;
    base = base.charAt(0).toUpperCase() + base.slice(1);
    var reps = g.reps > 1 ? ' × ' + g.reps : '';
    if (e.assisted) return g.kg === 0 ? base + ' without assistance' + reps : base + ' with ' + fmtKg(g.kg) + ' kg assistance' + reps;
    return base + ' at ' + fmtKg(g.kg) + ' ' + e.kgLabel + reps;
  }
  function fmtKg(k) { return String(Math.round(k * 100) / 100); }
  /** False for a set that is almost certainly a typo (e.g. 80 instead of 8 kg). */
  function plausible(e, ref, kg, reps) {
    if (reps > 60) return false;
    if (ref === null || ref === undefined || ref <= 0) return true;
    if (e.assisted) return kg === 0 || !(ref >= 5 && kg < ref / 2.5); // 0 = a real unassisted attempt
    return kg <= ref * 2.5 + 2 * e.stepKg;
  }
  function meets(e, g, kg, reps) { return reps >= g.reps && (e.assisted ? kg <= g.kg + 1e-9 : kg >= g.kg - 1e-9); }

  /**
   * input = { settings, slots, exercises, choices, sessions, overrides, stamps }
   * session = { id, date, day:'A'|'B', minutes, sets:[{slot, ex, set, kg, reps, done, fb, skip}], effort, note }
   */
  function replay(input) {
    var st = normSettings(input.settings);
    var prog = buildProgram(input.slots, input.exercises);
    var sessions = sortSessions(input.sessions || []);
    var overrides = (input.overrides || []).slice().sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });
    var deloads = (input.stamps || []).filter(function (s) { return s.type === 'deload'; })
      .map(function (s) { return String(s.date).slice(0, 10); }).sort();
    var states = {}, hist = {}, est = {}, pbs = {}, milestones = [], oi = 0, di = 0, deloadLeft = 0, lastDeload = null;
    var declines = [];
    var goals = parseGoals(st.goals, prog).map(function (g) { return { id: g.id, ex: g.ex, kg: g.kg, reps: g.reps, label: g.label,
      reached: null, best: null, start: null }; });

    function stOf(ex, day) { var k = ex + '|' + day; if (!states[k]) states[k] = newState(); return states[k]; }
    function applyOverridesBefore(ds) {
      while (oi < overrides.length && String(overrides[oi].date).slice(0, 10) < ds) {
        var o = overrides[oi++];
        if (!prog.exById[o.ex]) continue;
        var days = o.day ? [dayOf(o.day)] : ['A', 'B'];
        if (days[0] === 'AB') days = ['A', 'B'];
        days.forEach(function (d) {
          var s = stOf(o.ex, d);
          s.kg = num(o.kg, s.kg); s.lastReps = null; s.lastKg = null; s.topAll = false; s.hard = false; s.overridden = true;
          s.grace = 0; s.held = false; s.floor = null; s.crossTop = null;
        });
      }
    }

    var cum = 0, landedOn = null, totalVolume = 0, totalReps = 0, completedCount = 0, out = [];

    sessions.forEach(function (sess) {
      applyOverridesBefore(sess.date);
      while (di < deloads.length && deloads[di] <= sess.date) { deloadLeft = st.deloadSessions; lastDeload = deloads[di]; di++; }
      var week = weekOf(sess.date, st.startDate);
      var mode = modeFor(st, sess.date, deloadLeft, out.length ? out[out.length - 1].date : null);
      if (deloadLeft > 0) deloadLeft--;
      var sets = sess.sets || [];
      var prescribed = 0, doneN = 0, reps = 0, volume = 0, ups = [], steps = {}, improvements = [], prs = [], goalsHit = [];

      slotsOn(prog, sess.day).forEach(function (slot) {
        var side = slot[sess.day];
        var e = null, most = 0;
        slot.variants.forEach(function (v) {
          var n = sets.filter(function (x) { return x.ex === v.id && x.done && !x.skip; }).length;
          if (n > most) { most = n; e = v; }
        });
        var p = setsFor(side.sets, mode);
        prescribed += p;
        if (!e) return;
        var done = sets.filter(function (x) { return x.ex === e.id && x.done && !x.skip; })
          .sort(function (a, b) { return num(a.set, 0) - num(b.set, 0); });
        var all = done;
        var ref = stOf(e.id, sess.day).kg !== null ? stOf(e.id, sess.day).kg : stOf(e.id, sess.day === 'A' ? 'B' : 'A').kg;
        done = done.filter(function (x) { return plausible(e, ref, num(x.kg, 0), num(x.reps, 0)); });
        doneN += Math.min(all.length, p);
        all.forEach(function (x) {
          reps += num(x.reps, 0);
          if (!e.assisted) volume += num(x.kg, 0) * num(x.reps, 0) * e.loadMult;
        });
        if (!done.length) return;
        var r = progress(e, slot, side, sess.day, done, p, mode, sess.date, stOf(e.id, sess.day));
        if (r.up) { ups.push(e.id); steps[e.id] = r.up; }
        if (r.improvement) improvements.push({ ex: e.id, day: sess.day, text: r.improvement });
        if (r.decline) declines.push({ date: sess.date, ex: e.id, day: sess.day });
        if (r.pr) { prs.push(r.pr); milestones.push({ date: sess.date, day: sess.day, sessionId: sess.id, ex: e.id, kg: r.pr.kg, reps: r.pr.reps }); }
        goals.forEach(function (g) {
          if (g.ex !== e.id) return;
          done.forEach(function (x) {
            var k = num(x.kg, 0), rp = num(x.reps, 0);
            if (rp < 1) return;
            if (g.start === null) g.start = k;
            if (g.best === null || (e.assisted ? k < g.best : k > g.best)) g.best = k;
            if (!g.reached && meets(e, g, k, rp)) {
              g.reached = { date: sess.date, sessionId: sess.id, day: sess.day, kg: k, reps: rp };
              goalsHit.push({ id: g.id, ex: g.ex, label: g.label, kg: k, reps: rp });
            }
          });
        });
      });

      var completed = prescribed > 0 && doneN / prescribed >= st.completeShare - 1e-9;
      if (completed) completedCount++;
      var km = round1(reps * st.kmPerRep);
      var before = cum;
      cum = Math.min(st.routeKm, round1(cum + km));
      if (!landedOn && cum >= st.routeKm) landedOn = sess.date;
      totalVolume += volume;
      totalReps += reps;
      out.push({
        id: sess.id, date: sess.date, day: sess.day, week: week, mode: mode, minutes: num(sess.minutes, null),
        prescribed: prescribed, done: doneN, completed: completed, reps: reps, km: km,
        volume: Math.round(volume), upgrades: ups, steps: steps, improvements: improvements, prs: prs, goals: goalsHit,
        cumBefore: before, cumKm: cum, effort: sess.effort, note: sess.note, photo: !!sess.photo
      });
    });

    applyOverridesBefore('9999-12-31');
    // a deload accepted after the last session applies to the next ones
    while (di < deloads.length) { deloadLeft = st.deloadSessions; lastDeload = deloads[di]; di++; }

    function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function progress(e, slot, side, day, done, prescribed, mode, date, s) {
      var kgs = done.map(function (x) { return num(x.kg, 0); });
      var reps = done.map(function (x) { return num(x.reps, 0); });
      var fbs = done.map(function (x) { return str(x.fb); });
      var workKg = kgs[kgs.length - 1];
      var atIdx = [];
      for (var i = 0; i < kgs.length; i++) if (kgs[i] === workKg) atIdx.push(i);
      var at = atIdx.map(function (j) { return reps[j]; });
      var mixed = at.length < done.length;
      var complete = done.length >= prescribed && !mixed;
      var out = {};

      // personal best: the heaviest weight she has ever done a working set with (least assistance for assisted lifts)
      var top = null;
      done.forEach(function (x, j4) {
        if (num(x.reps, 0) < 1) return;
        var k = kgs[j4];
        if (top === null || (e.assisted ? k < top.kg : k > top.kg) || (k === top.kg && reps[j4] > top.reps)) top = { kg: k, reps: reps[j4] };
      });
      if (top && (top.kg > 0 || e.assisted)) {
        var pb = hasOwn(pbs, e.id) ? pbs[e.id] : null;
        if (pb !== null && (e.assisted ? top.kg < pb : top.kg > pb)) out.pr = { ex: e.id, kg: top.kg, reps: top.reps };
        if (pb === null || (e.assisted ? top.kg < pb : top.kg > pb)) pbs[e.id] = top.kg;
      }

      var h = hasOwn(hist, e.id) ? hist[e.id] : (hist[e.id] = []);
      var prev = null, prev2 = null;
      for (var j = h.length - 1; j >= 0; j--) {
        if (h[j].day !== day || h[j].mode === 'deload') continue;
        if (!prev) prev = h[j]; else { prev2 = h[j]; break; }
      }
      var entry = { date: date, day: day, mode: mode, kg: workKg, reps: reps, kgs: kgs, fbs: fbs, total: sum(at), sets: at.length };
      // a lower weight the app itself prescribed after missed reps is not a decline
      var plannedDown = s.missed && s.lastKg !== null && (e.assisted ? workKg > s.lastKg : workKg < s.lastKg);
      if (prev && mode !== 'deload') {
        out.improvement = compare(e, prev, entry);
        // sustained: worse than last time AND worse than the time before (two weeks for a weekly lift)
        out.decline = !plannedDown && !!prev2 && declined(e, prev, entry) && declined(e, prev2, entry);
      }
      h.push(entry);

      if (mode === 'deload') { entry.est = hasOwn(est, e.id) ? est[e.id] : null; if (s.kg === null) s.kg = workKg; return out; }

      // the shared strength estimate: best set of the day, both days feed it
      var best = 0;
      done.forEach(function (x, j2) {
        // "Too easy" on a set that missed its goal contradicts itself: ignore it
        var adj = x.fb === 'easy' && (reps[j2] < side.min || reps[j2] < num(x.target, 0)) ? 0 : fbAdj(x.fb);
        var v = oneRm(e, kgs[j2], Math.min(reps[j2], 15), Math.max(0, rirNum(x.rir) + adj));
        if (v > best) best = v;
      });
      if (best > 0) {
        var old = hasOwn(est, e.id) ? est[e.id] : 0;
        est[e.id] = !old || best >= old ? best : old * 0.6 + best * 0.4;
      }
      entry.est = hasOwn(est, e.id) ? est[e.id] : null;

      var hard = atIdx.some(function (j3) { return fbs[j3] === 'hard'; });
      // "Too hard" while still making every rep: hold once, but not twice in a row
      var hardMet = hard && complete && at.every(function (r, q) { return r >= (s.lastKg === workKg && s.lastReps ? Math.min(s.lastReps[q] || 0, side.max) : side.min); });
      if (hard && hardMet && s.hardMet) { hard = false; hardMet = false; }
      s.hardMet = hardMet;
      var easy = atIdx.filter(function (j5) { return fbs[j5] === 'easy'; }).length;
      s.easy = mode === 'normal' && easy * 2 >= atIdx.length && easy > 0;
      var small = isSmall(e, workKg);
      // a new, heavier weight: its first miss is held instead of dropped, and small lifts may land under the range
      var heavier = s.lastKg !== null && (e.assisted ? workKg < s.lastKg - 1e-9 : workKg > s.lastKg + 1e-9);
      if (heavier) { s.grace = 1; s.floor = small ? jumpFloor(side) : null; }
      else if (s.lastKg === null || Math.abs(workKg - s.lastKg) > 1e-9) { s.grace = 0; s.floor = null; }
      var lo = s.floor || side.min;
      function most(f) { return at.filter(f).length * 2 > at.length; }
      // below the bottom of the range on most sets: the weight comes down next time
      var below = most(function (r) { return r < lo; });
      var farOff = most(function (r) { return r < lo - 2; });
      s.held = below && s.grace > 0 && !farOff;
      s.missed = below && !s.held;
      if (below) s.grace = 0; // the one forgiven miss at this weight is used up
      if (s.floor && at.every(function (r) { return r >= side.min; })) s.floor = null; // back in the range
      s.overridden = false;
      s.kg = workKg; s.lastKg = workKg; s.hard = hard;
      s.lastReps = complete ? reps.slice() : fill(prescribed, Math.min.apply(null, at));
      s.topAll = mode === 'normal' && complete && !hard && (small
        ? at[0] >= side.max && sum(at) >= at.length * (side.max - 1)
        : at.every(function (r) { return r >= side.max; }));
      if (s.topAll && small) {
        // a top set lifts the other day too, unless that day's range goes higher
        var other = day === 'A' ? 'B' : 'A', os = slot[other];
        if (os && os.sets > 0 && os.max <= side.max) {
          var o = stOf(e.id, other);
          o.crossTop = o.crossTop === null ? workKg : Math.max(o.crossTop, workKg);
        }
      }
      var nx = decide(e, side, s, est[e.id], 'normal', side.sets);
      if (nx.up) out.up = nx.up;
      return out;
    }

    // fatigue: several lifts declining within two weeks of the last session
    var fatigue = { offer: false, lifts: [] };
    if (out.length) {
      var lastDate = out[out.length - 1].date, from = addDays(lastDate, -13), seen = {};
      declines.forEach(function (d) {
        if (d.date >= from && !seen[d.ex + '|' + d.day]) { seen[d.ex + '|' + d.day] = 1; fatigue.lifts.push(d); }
      });
      var recentDeload = lastDeload && lastDeload >= addDays(lastDate, -14);
      fatigue.offer = fatigue.lifts.length >= st.fatigueLifts && !recentDeload && deloadLeft === 0;
    }

    return {
      settings: st, prog: prog, sessions: out, states: states, hist: hist, est: est, milestones: milestones, goals: goals, choices: input.choices || [],
      cumKm: cum, landedOn: landedOn, totalVolume: Math.round(totalVolume), totalReps: totalReps,
      completedCount: completedCount, deloadLeft: deloadLeft, fatigue: fatigue
    };
  }

  // ---------- what's next ----------
  function nextDay(result) {
    var done = result.sessions.filter(function (s) { return s.completed; });
    if (!done.length) return 'A';
    return done[done.length - 1].day === 'A' ? 'B' : 'A';
  }

  /** The current choice for a slot on a day: the latest choice made for that day or both days. */
  function choiceFor(result, slotKey, day) {
    var best = null, bestI = -1;
    (result.choices || []).forEach(function (c, i) {
      if (str(c.slot) !== slotKey) return;
      var d = dayOf(c.day);
      if (d !== 'AB' && d !== day) return;
      var e = result.prog.exById[str(c.ex || c.exercise)];
      if (!e || e.slot !== slotKey) return;
      if (!best || str(c.at) > str(best.at) || (str(c.at) === str(best.at) && i > bestI)) { best = c; bestI = i; }
    });
    return best ? { ex: str(best.ex || best.exercise), day: dayOf(best.day), at: str(best.at) } : null;
  }

  function lastUsed(result, slot, day) {
    var best = null, bestDate = '';
    slot.variants.forEach(function (v) {
      (result.hist[v.id] || []).forEach(function (h) { if (h.day === day && h.date >= bestDate) { bestDate = h.date; best = v; } });
    });
    return best;
  }

  /**
   * The working weight and rep targets for one exercise on one day.
   * s = that day's state, est = the shared strength estimate (may be undefined).
   */
  function decide(e, side, s, est, mode, sets) {
    var mid = Math.floor((side.min + side.max) / 2);
    var r = { kg: s ? s.kg : null, targets: null, up: 0, estimated: false, taxi: false };
    if (!s || s.kg === null) {
      if (est) { r.kg = kgFor(e, est, mid); r.estimated = true; }
      else if (e.startKg !== null) r.kg = e.startKg;
      else r.taxi = true;
      r.targets = fill(sets, mid);
      return r;
    }
    var kg = s.kg;
    if (mode === 'deload') { r.targets = fill(sets, side.min); return r; }
    var dir0 = e.assisted ? -1 : 1;
    if (s.missed && est && s.lastKg === kg) {
      var down = kgFor(e, est, mid);
      if (dir0 * (down - kg) >= 0) down = Math.max(0, roundToStep(kg - dir0 * e.stepKg, e.stepKg));
      r.kg = down; r.down = true; r.targets = fill(sets, side.min);
      return r;
    }
    var lo = s.floor && s.lastKg === kg ? s.floor : side.min;
    if (s.held && s.lastKg === kg) {
      r.held = true; r.targets = fill(sets, lo);
      return r;
    }
    if (mode !== 'intro' && mode !== 'back' && !s.hard) {
      var dir = e.assisted ? -1 : 1;
      var small = isSmall(e, kg);
      var need = side.min + 1, steps = 0;
      if (est) {
        for (var k = 1; k <= 3; k++) {
          var kk = kg + dir * k * e.stepKg;
          if (kk < 0 || predReps(e, est, kk, 1) < need) break;
          steps = k;
        }
      }
      if (!steps && (s.topAll || (small && s.crossTop !== null && s.crossTop >= kg - 1e-9))) steps = 1;
      if (steps === 3 && est) {
        // still far too light after three increments: go straight to the weight her strength points to (at most +50% load)
        var jump = kgFor(e, est, mid), cap = e.assisted ? e.baseKg - loadOf(e, kg) * 1.5 : loadOf(e, kg) * 1.5 - e.baseKg;
        if (dir * (jump - (kg + dir * 3 * e.stepKg)) > 0) {
          jump = dir > 0 ? Math.min(jump, floorToStep(cap, e.stepKg)) : Math.max(jump, Math.max(0, Math.ceil(cap / e.stepKg - 1e-9) * e.stepKg));
          if (dir * (jump - kg) > 0) steps = Math.max(3, Math.round(Math.abs(jump - kg) / e.stepKg));
        }
      }
      if (steps) {
        r.kg = Math.max(0, roundToStep(kg + dir * steps * e.stepKg, e.stepKg));
        r.up = steps;
        var p = est ? predReps(e, est, r.kg, 1) : side.min;
        r.targets = fill(sets, Math.max(isSmall(e, r.kg) ? jumpFloor(side) : side.min, Math.min(mid, p)));
        return r;
      }
    }
    if (s.lastReps && s.lastKg === kg) {
      var last = s.lastReps.length === sets ? s.lastReps : fill(sets, Math.min.apply(null, s.lastReps));
      r.targets = last.map(function (t) { return Math.max(lo, Math.min(side.max, s.hard ? t : t + 1)); });
    } else r.targets = fill(sets, side.min);
    return r;
  }

  /** Working weight for `reps` with 1 in reserve, estimated from her latest result on this variation. */
  function estimateKg(result, e, reps) {
    var h = result.hist[e.id];
    if (!h || !h.length) return null;
    var last = h[h.length - 1];
    var best = Math.max.apply(null, last.reps.filter(function (r, i) { return last.kgs[i] === last.kg; }));
    var rm = oneRm(e, last.kg, best, 1);
    if (rm <= 0) return null;
    var load = rm / (1 + (reps + 1) / 30);
    var kg = e.assisted ? e.baseKg - load : load - e.baseKg;
    kg = e.assisted ? Math.max(0, Math.ceil(kg / e.stepKg - 1e-9) * e.stepKg) : Math.max(0, floorToStep(kg, e.stepKg));
    return Math.round(kg * 100) / 100;
  }

  function plusOne(arr, max) {
    var a = arr.slice(), lo = Math.min.apply(null, a);
    if (lo >= max) return a;
    for (var i = 0; i < a.length; i++) if (a[i] === lo) { a[i]++; break; }
    return a;
  }

  function planItem(result, slot, e, day, mode) {
    var side = slot[day];
    var s = result.states[e.id + '|' + day];
    var sets = setsFor(side.sets, mode);
    var dc = decide(e, side, s, result.est ? result.est[e.id] : undefined, mode, sets);
    var kg = dc.kg, estimated = dc.estimated, taxi = dc.taxi, targets = dc.targets;
    var rir = [], failureSet = -1;
    for (var i = 0; i < sets; i++) {
      var r = e.rir || '1';
      if (mode === 'intro' || mode === 'back') r = '2–3';
      else if (mode === 'deload') r = '3–4';
      else if (i === sets - 1 && !e.rir) {
        if (slot.failureLast.indexOf(day) >= 0 || slot.failureLast === 'AB') { r = '0'; failureSet = i; }
        else if (side.rirLast && (!slot.stableOnly || e.stable)) r = side.rirLast;
      }
      rir.push(r);
    }
    var calibrate = !taxi && !estimated && mode === 'normal' && !dc.down && (
      ((slot.calibrate || e.stable) && !e.assisted && targets.every(function (t) { return t >= side.max; })) ||
      !!(s && s.easy));
    return {
      slot: slot.key, muscle: slot.muscle, pair: slot.pair, exercise: e, sets: sets, kg: taxi ? null : kg,
      taxi: taxi, estimated: estimated, targets: targets, rir: rir, failureSet: failureSet, calibrate: calibrate,
      min: side.min, max: side.max, rest: side.rest,
      lastKg: s ? s.lastKg : null, lastReps: s ? s.lastReps : null,
      upSteps: dc.up, down: !!dc.down, held: !!dc.held, overridden: !!(s && s.overridden && !s.lastReps)
    };
  }

  /** The plan for a workout on dateStr (day optional: next in the A/B rotation). */
  function plan(result, dateStr, day) {
    var st = result.settings;
    day = day || nextDay(result);
    var week = weekOf(dateStr, st.startDate);
    var last = result.sessions.length ? result.sessions[result.sessions.length - 1].date : null;
    var mode = modeFor(st, dateStr, result.deloadLeft, last && last < dateStr ? last : null);
    var items = slotsOn(result.prog, day).map(function (slot) {
      var ch = choiceFor(result, slot.key, day);
      var e = ch ? result.prog.exById[ch.ex] : (lastUsed(result, slot, day) || lastUsed(result, slot, day === 'A' ? 'B' : 'A') || slot.variants[0]);
      var it = planItem(result, slot, e, day, mode);
      it.choice = ch;
      it.options = slot.variants.map(function (v) { return v === e ? it : planItem(result, slot, v, day, mode); });
      return it;
    });
    var blocks = [];
    items.forEach(function (it) {
      var b = blocks[blocks.length - 1];
      if (it.pair && b && b.pair === it.pair) b.items.push(it);
      else blocks.push({ pair: it.pair, items: [it] });
    });
    return {
      day: day, date: dateStr, week: week, mode: mode, items: items, blocks: blocks,
      setsTotal: sum(items.map(function (it) { return it.sets; })),
      repsTarget: sum(items.map(function (it) { return sum(it.targets); }))
    };
  }

  /** Predicted landing: average km of the last 4 workouts, stepped along the training weekdays. */
  function eta(result, todayStr, hasSessionToday) {
    var st = result.settings;
    var remaining = st.routeKm - result.cumKm;
    if (remaining <= 0) return { landed: true, date: result.landedOn, sessionsLeft: 0, avgKm: 0 };
    var recent = result.sessions.filter(function (s) { return s.reps > 0; }).slice(-4);
    var avg = recent.length ? sum(recent.map(function (s) { return s.km; })) / recent.length : st.kmPerRep * 200;
    var left = Math.ceil(remaining / avg - 1e-9);
    var d = hasSessionToday ? addDays(todayStr, 1) : todayStr;
    if (d < st.startDate) d = st.startDate;
    var count = 0, guard = 0;
    while (guard++ < 800) {
      if (st.trainingWeekdays.indexOf(weekday(d)) >= 0 && ++count >= left) break;
      d = addDays(d, 1);
    }
    return { landed: false, date: d, sessionsLeft: left, avgKm: round1(avg) };
  }

  /** Change in the strength estimate for one lift: first result vs latest, as a fraction (0.15 = +15%). */
  function strengthChange(result, exId) {
    var h = (result.hist[exId] || []).filter(function (x) { return x.est > 0; });
    if (h.length < 2 || h[h.length - 1].date === h[0].date) return null;
    return { from: h[0].date, change: h[h.length - 1].est / h[0].est - 1, n: h.length };
  }

  function previewSession(input, draft) {
    var copy = {};
    for (var k in input) copy[k] = input[k];
    copy.sessions = (input.sessions || []).filter(function (s) { return s.id !== draft.id; }).concat([draft]);
    var r = replay(copy), mine = null;
    r.sessions.forEach(function (s) { if (s.id === draft.id) mine = s; });
    return { session: mine, result: r };
  }

  return {
    DEFAULTS: DEFAULTS, replay: replay, plan: plan, nextDay: nextDay, eta: eta, previewSession: previewSession,
    normSettings: normSettings, parseGoals: parseGoals, strengthChange: strengthChange, buildProgram: buildProgram, slotsOn: slotsOn, choiceFor: choiceFor,
    compare: compare, estimateKg: estimateKg, plusOne: plusOne, decide: decide, predReps: predReps, dayOf: dayOf,
    weekOf: weekOf, addDays: addDays, weekday: weekday, roundToStep: roundToStep
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FlightEngine;
