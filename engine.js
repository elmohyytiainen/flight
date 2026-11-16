/*
 * FlightEngine — progression + flight calculations.
 *
 * Pure functions only: it reads the program, settings, overrides and the
 * session log and returns results. Nothing here stores anything, so the
 * whole history can be replayed at any time (e.g. after a setting changes).
 *
 * This exact file runs in two places:
 *   - the web app (loaded as engine.js)
 *   - the Apps Script backend (pasted as Engine.gs)
 * Keep it plain ES5-compatible JavaScript with no imports.
 */
var FlightEngine = (function () {
  'use strict';

  var DEFAULTS = {
    routeKm: 1697,
    kmCruise: 35,
    kmTailwind: 30,
    jetPerUpgrade: 5,
    jetCap: 15,
    completeShare: 0.8,
    layoverWeek: 7,
    layoverSets: 2,
    trainingWeekdays: [1, 5], // Monday, Friday (0 = Sunday)
    startDate: '2026-11-23',
    vBaseA: 0,
    vBaseB: 0
  };

  // ---------- small helpers ----------

  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  function roundToStep(kg, step) {
    if (!step || step <= 0) return round1(kg);
    var n = Math.round(kg / step) * step;
    return Math.round(n * 100) / 100;
  }

  function parseDate(s) {
    // 'YYYY-MM-DD' -> UTC midnight ms
    var p = String(s).slice(0, 10).split('-');
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    var m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function addDays(dateStr, n) { return fmtDate(parseDate(dateStr) + n * 864e5); }

  function weekday(dateStr) { return new Date(parseDate(dateStr)).getUTCDay(); }

  function weekOf(dateStr, startStr) {
    var diff = Math.floor((parseDate(dateStr) - parseDate(startStr)) / 864e5);
    return Math.floor(diff / 7) + 1;
  }

  function normSettings(s) {
    s = s || {};
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    for (var key in s) {
      if (s[key] === '' || s[key] === null || s[key] === undefined) continue;
      out[key] = s[key];
    }
    ['routeKm', 'kmCruise', 'kmTailwind', 'jetPerUpgrade', 'jetCap', 'completeShare',
      'layoverWeek', 'layoverSets', 'vBaseA', 'vBaseB'].forEach(function (k) {
      out[k] = num(out[k], DEFAULTS[k]);
    });
    if (typeof out.trainingWeekdays === 'string') {
      out.trainingWeekdays = out.trainingWeekdays.split(/[,; ]+/).filter(Boolean).map(Number);
    }
    if (!out.trainingWeekdays || !out.trainingWeekdays.length) out.trainingWeekdays = DEFAULTS.trainingWeekdays;
    out.startDate = String(out.startDate).slice(0, 10);
    return out;
  }

  function normExercise(e) {
    var alts = e.alternatives;
    if (typeof alts === 'string') alts = alts.split(';').map(function (x) { return x.trim(); }).filter(Boolean);
    return {
      id: String(e.id),
      day: String(e.day).trim().toUpperCase(),
      order: num(e.order, 0),
      name: String(e.name || e.id),
      sets: Math.max(1, num(e.sets, 3)),
      repMin: num(e.repMin, 8),
      repMax: num(e.repMax, 12),
      stepKg: num(e.stepKg, 2.5),
      loadMult: num(e.loadMult, 1),
      kgLabel: e.kgLabel || 'kg',
      restSec: num(e.restSec, 90),
      startKg: num(e.startKg, null),
      cue: e.cue || '',
      video: e.video || '',
      alternatives: alts || [],
      active: !(e.active === false || String(e.active).toUpperCase() === 'FALSE')
    };
  }

  function dayExercises(program, day) {
    return program.filter(function (e) { return e.active && e.day === day; })
      .sort(function (a, b) { return a.order - b.order; });
  }

  function sortSessions(sessions) {
    return sessions.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return String(a.savedAt || a.id) < String(b.savedAt || b.id) ? -1 : 1;
    });
  }

  function isLayover(week, st) { return st.layoverWeek > 0 && week === st.layoverWeek; }

  // ---------- replay ----------

  /**
   * input = { settings, program, sessions, overrides }
   * session = { id, date:'YYYY-MM-DD', day:'A'|'B', sets:[{ex, set, kg, reps, done, swap}], effort, mood, note }
   * override = { date, ex, kg }  (applies to sessions strictly after its date)
   */
  function replay(input) {
    var st = normSettings(input.settings);
    var program = (input.program || []).map(normExercise);
    var byId = {};
    program.forEach(function (e) { byId[e.id] = e; });
    var sessions = sortSessions(input.sessions || []);
    var overrides = (input.overrides || []).slice().sort(function (a, b) {
      return String(a.date) < String(b.date) ? -1 : 1;
    });
    var oi = 0;

    var exState = {};
    function stateOf(id) {
      if (!exState[id]) {
        var e = byId[id];
        exState[id] = {
          kg: e && e.startKg !== null ? e.startKg : null,
          missStreak: 0, bestKg: null, lastKg: null, lastReps: null,
          justUpgraded: false, rerouted: false, history: []
        };
      }
      return exState[id];
    }
    function applyOverridesBefore(dateStr) {
      while (oi < overrides.length && String(overrides[oi].date).slice(0, 10) < dateStr) {
        var o = overrides[oi++];
        if (!byId[o.ex]) continue;
        var s = stateOf(o.ex);
        s.kg = num(o.kg, s.kg);
        s.justUpgraded = false;
        s.missStreak = 0;
        s.overridden = true;
      }
    }

    var vBase = { A: st.vBaseA || 0, B: st.vBaseB || 0 };
    var cum = 0, landedOn = null, totalVolume = 0, completedCount = 0;
    var out = [];

    sessions.forEach(function (sess) {
      applyOverridesBefore(sess.date);
      var week = weekOf(sess.date, st.startDate);
      var layover = isLayover(week, st);
      var exs = dayExercises(program, sess.day);
      var sets = sess.sets || [];
      var prescribedTotal = 0, doneTotal = 0, volume = 0;
      var upgrades = [], prs = [], rerouted = [];

      exs.forEach(function (e) {
        var prescribed = layover ? Math.min(e.sets, st.layoverSets) : e.sets;
        prescribedTotal += prescribed;
        var mine = sets.filter(function (x) { return x.ex === e.id; })
          .sort(function (a, b) { return num(a.set, 0) - num(b.set, 0); });
        var done = mine.filter(function (x) { return x.done; }).slice(0, prescribed);
        doneTotal += done.length;
        if (!done.length) return;
        var swapped = mine.some(function (x) { return x.swap; });
        done.forEach(function (x) { volume += num(x.kg, 0) * num(x.reps, 0) * e.loadMult; });
        if (swapped) return; // a swap counts for volume but doesn't move progression

        var s = stateOf(e.id);
        var workKg = Math.min.apply(null, done.map(function (x) { return num(x.kg, 0); }));
        var reps = done.map(function (x) { return num(x.reps, 0); });
        var allTop = done.length >= prescribed && reps.every(function (r) { return r >= e.repMax; });
        var anyBelow = reps.some(function (r) { return r < e.repMin; });

        if (s.bestKg !== null && workKg > s.bestKg) prs.push(e.id);
        s.bestKg = s.bestKg === null ? workKg : Math.max(s.bestKg, workKg);
        s.lastKg = workKg;
        s.lastReps = reps;
        s.justUpgraded = false;
        s.rerouted = false;
        s.overridden = false;

        if (layover) {
          s.kg = workKg;
        } else if (allTop) {
          s.kg = roundToStep(workKg + e.stepKg, e.stepKg);
          s.justUpgraded = true;
          s.missStreak = 0;
          upgrades.push(e.id);
        } else if (anyBelow) {
          s.missStreak += 1;
          if (s.missStreak >= 2) {
            s.kg = Math.max(0, roundToStep(workKg * 0.9, e.stepKg));
            s.missStreak = 0;
            s.rerouted = true;
            rerouted.push(e.id);
          } else {
            s.kg = workKg;
          }
        } else {
          s.kg = workKg;
          s.missStreak = 0;
        }
        s.history.push({ date: sess.date, kg: workKg, reps: reps });
      });

      var completed = prescribedTotal > 0 && doneTotal / prescribedTotal >= st.completeShare - 1e-9;
      var km = { cruise: 0, tailwind: 0, jet: 0, total: 0 };
      if (completed) {
        if (!vBase[sess.day]) vBase[sess.day] = volume;
        var ratio = vBase[sess.day] > 0 ? volume / vBase[sess.day] : 1;
        km.cruise = st.kmCruise;
        km.tailwind = round1(st.kmTailwind * ratio);
        km.jet = Math.min(st.jetPerUpgrade * upgrades.length, st.jetCap);
        km.total = round1(km.cruise + km.tailwind + km.jet);
        completedCount += 1;
      }
      var before = cum;
      cum = Math.min(st.routeKm, round1(cum + km.total));
      if (!landedOn && cum >= st.routeKm) landedOn = sess.date;
      totalVolume += volume;

      out.push({
        id: sess.id, date: sess.date, day: sess.day, week: week, layover: layover,
        prescribed: prescribedTotal, done: doneTotal, completed: completed,
        volume: Math.round(volume), upgrades: upgrades, prs: prs, rerouted: rerouted,
        km: km, cumBefore: before, cumKm: cum,
        effort: sess.effort, mood: sess.mood, note: sess.note
      });
    });

    applyOverridesBefore('9999-12-31');

    return {
      settings: st, program: program, sessions: out, exState: exState,
      cumKm: cum, landedOn: landedOn, totalVolume: Math.round(totalVolume),
      completedCount: completedCount, vBase: vBase
    };
  }

  // ---------- what's next ----------

  function nextDay(result) {
    var done = result.sessions.filter(function (s) { return s.completed; });
    if (!done.length) return 'A';
    return done[done.length - 1].day === 'A' ? 'B' : 'A';
  }

  /** The plan for a session on `dateStr` (day optional: defaults to the next in the A/B rotation). */
  function plan(result, dateStr, day) {
    var st = result.settings;
    day = day || nextDay(result);
    var week = weekOf(dateStr, st.startDate);
    var layover = isLayover(week, st);
    var exs = dayExercises(result.program, day);
    var items = exs.map(function (e) {
      var s = result.exState[e.id] || { kg: e.startKg, lastReps: null, justUpgraded: false, history: [] };
      var sets = layover ? Math.min(e.sets, st.layoverSets) : e.sets;
      var taxi = s.kg === null || s.kg === undefined;
      var targets = [];
      for (var i = 0; i < sets; i++) {
        var r;
        if (taxi) r = Math.round((e.repMin + e.repMax) / 2);
        else if (s.justUpgraded || s.rerouted || s.overridden || !s.lastReps) r = e.repMin;
        else {
          var last = s.lastReps[i] !== undefined ? s.lastReps[i] : s.lastReps[s.lastReps.length - 1];
          r = Math.min(e.repMax, Math.max(e.repMin, last + 1));
        }
        targets.push(r);
      }
      return {
        exercise: e, sets: sets, kg: taxi ? null : s.kg, taxi: taxi, targets: targets,
        lastKg: s.lastKg, lastReps: s.lastReps, upgraded: !!s.justUpgraded,
        rerouted: !!s.rerouted, overridden: !!s.overridden
      };
    });
    var setsTotal = items.reduce(function (a, it) { return a + it.sets; }, 0);
    return { day: day, date: dateStr, week: week, layover: layover, items: items, setsTotal: setsTotal };
  }

  /** Predicted landing: average of the last 4 completed sessions, stepped along the training weekdays. */
  function eta(result, todayStr, hasSessionToday) {
    var st = result.settings;
    var remaining = st.routeKm - result.cumKm;
    if (remaining <= 0) return { landed: true, date: result.landedOn, sessionsLeft: 0, avgKm: 0 };
    var done = result.sessions.filter(function (s) { return s.completed; }).slice(-4);
    var avg = done.length
      ? done.reduce(function (a, s) { return a + s.km.total; }, 0) / done.length
      : st.kmCruise + st.kmTailwind;
    var left = Math.ceil(remaining / avg - 1e-9);
    var d = hasSessionToday ? addDays(todayStr, 1) : todayStr;
    if (d < st.startDate) d = st.startDate;
    var count = 0, guard = 0;
    while (guard++ < 800) {
      if (st.trainingWeekdays.indexOf(weekday(d)) >= 0) {
        count++;
        if (count >= left) break;
      }
      d = addDays(d, 1);
    }
    return { landed: false, date: d, sessionsLeft: left, avgKm: round1(avg) };
  }

  /** Session km for a draft session (used live on the landing screen, offline too). */
  function previewSession(input, draft) {
    var withDraft = { settings: input.settings, program: input.program, overrides: input.overrides,
      sessions: (input.sessions || []).filter(function (s) { return s.id !== draft.id; }).concat([draft]) };
    var r = replay(withDraft);
    var mine = null;
    r.sessions.forEach(function (s) { if (s.id === draft.id) mine = s; });
    return { session: mine, result: r };
  }

  /** Great-circle point at distance `km` from A toward B. a/b = [lat, lon]. Returns [lat, lon]. */
  function routePoint(a, b, km) {
    var R = 6371, rad = Math.PI / 180;
    function xyz(p) {
      return [Math.cos(p[0] * rad) * Math.cos(p[1] * rad), Math.cos(p[0] * rad) * Math.sin(p[1] * rad), Math.sin(p[0] * rad)];
    }
    var A = xyz(a), B = xyz(b);
    var dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
    var d = Math.acos(Math.max(-1, Math.min(1, dot)));
    var f = Math.max(0, Math.min(1, km / (R * d)));
    var s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d);
    var x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    return [Math.atan2(z, Math.sqrt(x * x + y * y)) / rad, Math.atan2(y, x) / rad];
  }

  return {
    DEFAULTS: DEFAULTS,
    replay: replay,
    plan: plan,
    nextDay: nextDay,
    eta: eta,
    previewSession: previewSession,
    routePoint: routePoint,
    normSettings: normSettings,
    normExercise: normExercise,
    weekOf: weekOf,
    addDays: addDays,
    weekday: weekday,
    roundToStep: roundToStep
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FlightEngine;
