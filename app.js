/* Flight TMP → LUX — the app. Needs FlightEngine, MAPDATA, FlightCore (demo only), FLIGHT_CONFIG. */
(function () {
  'use strict';

  var E = window.FlightEngine;
  var CFG = window.FLIGHT_CONFIG || {};
  var qs = new URLSearchParams(location.search);
  var KEY = qs.get('k') || '';
  var DEMO = qs.has('demo') || !CFG.apiUrl;
  var DEMO_ROLE = (function () {
    var r = qs.get('role');
    if (!r) { try { r = localStorage.getItem('fl.demoRole'); } catch (e) { r = null; } }
    return r === 'coach' ? 'coach' : 'athlete';
  })();
  var NS = 'fl.' + (DEMO ? 'demo.v2.' + DEMO_ROLE : KEY) + '.';
  var TMP_LL = [61.4141, 23.6044], LUX_LL = [49.6233, 6.2044];

  // ---------- storage (wrapped: private mode or sandboxed previews can throw) ----------
  var mem = {};
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(NS + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return mem[k] !== undefined ? mem[k] : d; }
    },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { /* memory only */ } },
    del: function (k) { delete mem[k]; try { localStorage.removeItem(NS + k); } catch (e) { /* ignore */ } }
  };

  // ---------- helpers ----------
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowIso() { return new Date().toISOString(); }
  function uid() { return Math.random().toString(36).slice(2, 8); }
  function km(n) { return Math.round(n).toLocaleString('en-GB'); }
  function kgFmt(n) { return (Math.round(n * 10) / 10).toLocaleString('en-GB'); }
  function dateObj(ds) { var p = ds.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function fmtDate(ds) { return dateObj(ds).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtLong(ds) { return dateObj(ds).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fiDate(ds) { var p = ds.split('-'); return +p[2] + '.' + +p[1] + '.' + p[0].slice(2); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ---------- icons ----------
  var PLANE = 'M11 0L4-2.2-1-10H-4L-1.2-2.2H-7L-9-5.2H-11L-9.8 0-11 5.2H-9L-7 2.2H-1.2L-4 10H-1L4 2.2Z';
  var IC = {
    plane: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="' + PLANE + '" fill="currentColor"/></svg>',
    ballet: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" fill="currentColor"/></svg>',
    run: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l5 5-5 5M8.5 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    envelope: '<svg viewBox="0 0 40 40" class="ic" aria-hidden="true"><rect x="4" y="9" width="32" height="22" rx="3" fill="var(--taxi)" stroke="var(--ink)" stroke-width="2"/><path d="M5 11l15 11 15-11" fill="none" stroke="var(--ink)" stroke-width="2"/></svg>',
    cheer: '<svg viewBox="0 0 40 40" class="ic" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="var(--ink)"/><path d="M20 9l3.2 7.3 7.8.7-5.9 5.2 1.8 7.8L20 26l-6.9 4 1.8-7.8L9 17l7.8-.7Z" fill="var(--taxi)"/></svg>',
    tabHome: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path class="accent" d="' + PLANE + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="rotate(-35)"/></svg>',
    tabLog: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="accent" x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    tabCoach: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="accent" cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  // ---------- backends ----------
  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function checked(j) {
    if (!j || !j.ok) { var e = new Error((j && j.error) || 'bad response'); e.auth = j && j.error === 'bad_key'; throw e; }
    return j.state;
  }
  var Remote = {
    state: function () {
      return withTimeout(fetch(CFG.apiUrl + '?a=state&k=' + encodeURIComponent(KEY) + '&today=' + todayStr(), { cache: 'no-store' })
        .then(function (r) { return r.json(); }), 20000).then(checked);
    },
    ops: function (ops) {
      return withTimeout(fetch(CFG.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ k: KEY, today: todayStr(), ops: ops })
      }).then(function (r) { return r.json(); }), 25000).then(checked);
    }
  };

  var Demo = (function () {
    function seed() {
      var C = window.FlightCore;
      var t = todayStr();
      var dow = (dateObj(t).getDay() + 6) % 7; // 0 = Monday
      var empty = false;
      try { empty = localStorage.getItem('fl.demoEmpty') === '1'; } catch (e) { /* ignore */ }
      var start = E.addDays(t, -dow - (empty ? 0 : 21)); // this Monday, or a Monday three weeks ago
      var settings = {};
      C.seedSettings({ athleteKey: 'demo', coachKey: 'demo' }).forEach(function (r) { settings[r.key] = r.value; });
      settings.startDate = start;
      settings.passengerName = 'Her name';
      var data = { settings: settings, program: C.seedProgram(), sessions: [], sets: [], overrides: [], stamps: [],
        postcards: C.seedPostcards(), cheers: [] };
      data.postcards[0].message = 'Example note: this is where your coach writes to you.\n\nYou already did the hardest part: you started. Proud of you!';
      data.postcards[1].message = 'Example note from Salo.\n\nKeep the hips high and the chin tucked. See you at the halfway layover.';
      data.postcards[2].message = 'Example note from Tampere. Look how far you\'ve flown already.';
      var startKg = { 'hip-thrust': 40, 'incline-db-press': 7, 'lat-pulldown': 30, 'cable-kickback': 10, 'db-shoulder-press': 5,
        'lateral-raise': 3, 'hip-abduction': 35, 'rdl': 30, 'split-squat': 6, 'cable-row': 30, 'db-bench-press': 8,
        'back-extension': 0, 'cable-curl': 10, 'rope-pushdown': 12.5 };
      var n = 0, rnd = 7;
      function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
      for (var d = start; !empty && d < t; d = E.addDays(d, 1)) {
        var wd = dateObj(d).getDay();
        if (wd === 2) data.stamps.push({ date: d, type: 'ballet' });
        if (wd === 3 || wd === 0) data.stamps.push({ date: d, type: 'run' });
        if (wd !== 1 && wd !== 5) continue;
        var res = E.replay(C.toEngineInput(data));
        var p = E.plan(res, d);
        var sets = [];
        p.items.forEach(function (it) {
          it.targets.forEach(function (tg, i) {
            sets.push({ ex: it.exercise.id, set: i + 1, kg: it.taxi ? startKg[it.exercise.id] : it.kg,
              reps: r() < 0.82 ? tg : Math.max(1, tg - 1), done: true, swap: '' });
          });
        });
        n++;
        C.applyOp(data, { type: 'saveSession', session: { id: 'demo' + n, date: d, day: p.day, effort: 2 + Math.round(r() * 2),
          mood: ['🙂', '😄', '🔥', '😐'][n % 4], note: n === 2 ? 'Hip thrust felt great. Lat pulldown machine was busy, so I waited.' : '', sets: sets } },
        'athlete', d + 'T18:00:00Z');
      }
      if (!empty) data.cheers.push({ id: 'c1', createdAt: nowIso(), text: 'Great week! Friday is RDL day. Go get them.', seenAt: '' });
      return data;
    }
    var data = null, SK = 'fl.demo.v2.server';
    function load() {
      if (!data) { try { data = JSON.parse(localStorage.getItem(SK) || 'null'); } catch (e) { data = null; } }
      if (!data) { data = seed(); save(); }
      return data;
    }
    function save() { try { localStorage.setItem(SK, JSON.stringify(data)); } catch (e) { /* memory only */ } }
    function state() {
      var st = window.FlightCore.buildState(load(), DEMO_ROLE, todayStr());
      if (DEMO_ROLE === 'coach') st.settings.sheetUrl = '';
      return st;
    }
    return {
      state: function () { return new Promise(function (res) { setTimeout(function () { res(state()); }, 150); }); },
      ops: function (ops) {
        load();
        ops.forEach(function (op) {
          try { window.FlightCore.applyOp(data, op, DEMO_ROLE, nowIso()); } catch (e) { console.warn('demo op skipped', op.type, e.message); }
        });
        save();
        return new Promise(function (res) { setTimeout(function () { res(state()); }, 250); });
      },
      reset: function (empty) {
        data = null;
        try { localStorage.setItem('fl.demoEmpty', empty ? '1' : '0'); } catch (e) { /* ignore */ }
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('fl.demo.') === 0) localStorage.removeItem(k); }); } catch (e) { /* ignore */ }
      },
      switchRole: function () {
        try { localStorage.setItem('fl.demoRole', DEMO_ROLE === 'coach' ? 'athlete' : 'coach'); } catch (e) { /* ignore */ }
      }
    };
  })();

  var API = DEMO ? Demo : Remote;

  // ---------- app state ----------
  var S = {
    state: store.get('state', null),
    queue: store.get('queue', []),
    draft: store.get('draft', null),
    seen: store.get('seen', {}),
    view: null,
    sync: 'idle',
    busy: false,
    error: null,
    logTab: 'log',
    autoMail: false
  };

  function role() { return S.state ? S.state.role : (DEMO ? DEMO_ROLE : 'athlete'); }

  function calc() {
    var st = S.state;
    return E.replay({ settings: st.settings, program: st.program, sessions: st.sessions, overrides: st.overrides });
  }

  // ---------- sync ----------
  function localApply(op) {
    var st = S.state;
    if (!st) return;
    if (op.type === 'saveSession') {
      var s = op.session;
      st.sessions = st.sessions.filter(function (x) { return x.id !== s.id; });
      st.sessions.push({ id: s.id, date: s.date, day: s.day, effort: s.effort, mood: s.mood, note: s.note, savedAt: nowIso(), sets: s.sets });
    } else if (op.type === 'stamp') {
      st.stamps = st.stamps.filter(function (x) { return !(x.date === op.date && x.type === op.stampType); });
      if (op.on) st.stamps.push({ date: op.date, type: op.stampType });
    } else if (op.type === 'postcardOpened') {
      st.postcards.forEach(function (p) { if (p.id === op.id) p.openedAt = p.openedAt || nowIso(); });
    } else if (op.type === 'cheerSeen') {
      st.cheers.forEach(function (c) { if (c.id === op.id) c.seenAt = c.seenAt || nowIso(); });
    } else if (op.type === 'override') {
      st.overrides.push({ date: todayStr(), ex: op.ex, kg: op.kg });
    } else if (op.type === 'cheer') {
      st.cheers.push({ id: 'local' + uid(), createdAt: nowIso(), text: op.text, seenAt: '' });
    }
  }

  function setState(st) {
    S.state = st;
    S.queue.forEach(localApply); // keep unsent changes visible
    store.set('state', S.state);
  }

  function enqueue(op) {
    localApply(op);
    S.queue.push(op);
    store.set('queue', S.queue);
    store.set('state', S.state);
    flush();
  }

  function flush() {
    if (S.busy) return;
    if (!S.queue.length) return refresh();
    S.busy = true;
    S.sync = 'pending';
    paintSync();
    var batch = S.queue.slice();
    API.ops(batch).then(function (st) {
      S.queue.splice(0, batch.length);
      store.set('queue', S.queue);
      S.busy = false;
      S.sync = 'ok';
      S.error = null;
      setState(st);
      if (S.queue.length) flush();
      afterSync();
    }, function (e) { S.busy = false; failed(e); });
  }

  function refresh() {
    if (S.busy) return;
    S.busy = true;
    API.state().then(function (st) {
      S.busy = false;
      S.sync = S.queue.length ? 'pending' : 'ok';
      S.error = null;
      setState(st);
      if (S.queue.length) flush();
      afterSync();
    }, function (e) { S.busy = false; failed(e); });
  }

  function failed(e) {
    if (e && e.auth) { S.error = 'auth'; render(); return; }
    S.sync = navigator.onLine === false ? 'offline' : 'error';
    paintSync();
    if (!S.state) render();
  }

  function afterSync() {
    if (!S.view) S.view = role() === 'coach' ? 'coach' : 'home';
    render();
    if (S.autoMail && role() === 'athlete') {
      var card = unopenedMail()[0];
      if (card) { S.autoMail = false; openPostcard(card.id); }
    }
  }

  window.addEventListener('online', function () { flush(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { flush(); if (S.draft) keepAwake(); }
  });
  setInterval(function () { if (S.queue.length && document.visibilityState === 'visible') flush(); }, 30000);

  function syncLabel() {
    if (S.queue.length && S.sync !== 'offline' && S.sync !== 'error') return ['pending', 'Saving'];
    if (S.sync === 'offline') return ['offline', S.queue.length ? 'Offline, saved on phone' : 'Offline'];
    if (S.sync === 'error') return ['error', S.queue.length ? 'Not synced yet, saved on phone' : 'Can\'t reach the Sheet'];
    return ['', DEMO ? (demoEmpty() ? 'Demo' : 'Demo, example data') : 'Synced'];
  }
  function syncHTML() { var l = syncLabel(); return '<span class="sync ' + l[0] + '" id="sync"><i></i>' + esc(l[1]) + '</span>'; }
  function paintSync() { var el = document.getElementById('sync'); if (el) el.outerHTML = syncHTML(); }

  // ---------- map ----------
  function mapKm(gameKm, routeKm) { return gameKm / (routeKm || MAPDATA.routeKm) * MAPDATA.routeKm; }
  function routeXY(k) {
    var r = MAPDATA.route;
    if (k <= 0) return [r[0][1], r[0][2], Math.atan2(r[1][2] - r[0][2], r[1][1] - r[0][1]) * 180 / Math.PI];
    for (var i = 0; i < r.length - 1; i++) {
      if (k <= r[i + 1][0]) {
        var span = r[i + 1][0] - r[i][0] || 1, t = (k - r[i][0]) / span;
        return [r[i][1] + (r[i + 1][1] - r[i][1]) * t, r[i][2] + (r[i + 1][2] - r[i][2]) * t,
          Math.atan2(r[i + 1][2] - r[i][2], r[i + 1][1] - r[i][1]) * 180 / Math.PI];
      }
    }
    var a = r[r.length - 2], b = r[r.length - 1];
    return [b[1], b[2], Math.atan2(b[2] - a[2], b[1] - a[1]) * 180 / Math.PI];
  }
  function flownPoints(k) {
    var pts = [];
    MAPDATA.route.forEach(function (p) { if (p[0] < k) pts.push(p[1] + ',' + p[2]); });
    var end = routeXY(k);
    pts.push(end[0].toFixed(1) + ',' + end[1].toFixed(1));
    return pts.join(' ');
  }
  function mapSVG(gameKm, opts) {
    opts = opts || {};
    var M = MAPDATA, routeKm = Number(S.state.settings.routeKm) || M.routeKm;
    var k = mapKm(gameKm, routeKm);
    var all = M.route.map(function (p) { return p[1] + ',' + p[2]; }).join(' ');
    var plane = routeXY(k);
    var h = '<svg viewBox="0 0 ' + M.w + ' ' + M.h + '" role="img" aria-label="Route from Tampere to Luxembourg, ' + km(gameKm) + ' km flown">';
    h += '<rect width="' + M.w + '" height="' + M.h + '" fill="var(--sea)"/>';
    h += '<path class="land" d="' + M.land + '"/><path class="borders" d="' + M.borders + '"/>';
    h += '<polyline class="route-todo" points="' + all + '"/>';
    h += '<polyline class="route-done-edge" id="flownEdge" points="' + flownPoints(k) + '"/>';
    h += '<polyline class="route-done" id="flown" points="' + flownPoints(k) + '"/>';
    M.places.forEach(function (p) {
      var left = p.kind === 'city';
      var cls = p.kind === 'city' ? 'city' : 'place';
      h += '<circle class="' + cls + '" cx="' + p.x + '" cy="' + p.y + '" r="' + (p.kind === 'city' ? 2 : 3) + '"/>';
      h += '<text class="' + (p.kind === 'city' ? 'city-label' : 'place-label ' + p.kind) + '" x="' + (left ? p.x - 6 : p.x + (p.kind === 'dest' ? 10 : 6)) +
        '" y="' + (p.y + 4) + '" text-anchor="' + (left ? 'end' : 'start') + '">' + esc(p.name) + '</text>';
    });
    (S.state.postcards || []).forEach(function (c) {
      if (c.km >= routeKm) return; // the last card waits at the destination itself
      var pt = routeXY(mapKm(c.km, routeKm));
      var open = c.delivered;
      h += '<g transform="translate(' + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1) + ')"><rect class="' + (open ? 'card-open' : 'card-sealed') +
        '" x="-6" y="-4.5" width="12" height="9" rx="1.5"/><path class="card-flap" d="M-5.5-3.5 0 0.8 5.5-3.5"/></g>';
    });
    h += '<g id="planeG" transform="translate(' + plane[0].toFixed(1) + ' ' + plane[1].toFixed(1) + ') rotate(' + plane[2].toFixed(1) + ')">' +
      '<circle class="plane-halo" r="12.5"/><path class="plane" d="' + PLANE + '"/></g>';
    h += '</svg>';
    return '<div class="map" id="map">' + h + '</div>';
  }
  function animatePlane(fromKm, toKm) {
    var routeKm = Number(S.state.settings.routeKm) || MAPDATA.routeKm;
    var a = mapKm(fromKm, routeKm), b = mapKm(toKm, routeKm);
    var g = document.getElementById('planeG'), f = document.getElementById('flown'), fe = document.getElementById('flownEdge');
    if (!g || reducedMotion() || b <= a) return;
    var t0 = null, dur = 2400;
    function step(ts) {
      if (!t0) t0 = ts;
      var t = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - t, 3), k = a + (b - a) * e;
      var p = routeXY(k), pts = flownPoints(k);
      g.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ') rotate(' + p[2].toFixed(1) + ')');
      f.setAttribute('points', pts);
      fe.setAttribute('points', pts);
      if (t < 1) requestAnimationFrame(step);
    }
    var p0 = routeXY(a);
    g.setAttribute('transform', 'translate(' + p0[0] + ' ' + p0[1] + ') rotate(' + p0[2] + ')');
    f.setAttribute('points', flownPoints(a));
    fe.setAttribute('points', flownPoints(a));
    setTimeout(function () { requestAnimationFrame(step); }, 350);
  }

  // ---------- derived ----------
  function settings() { return E.normSettings(S.state.settings); }
  function completedOn(res, ds) { return res.sessions.filter(function (s) { return s.date === ds && s.completed; }); }
  function nextSessionDate(res) {
    var st = res.settings, t = todayStr();
    var d = t;
    if (completedOn(res, t).length) d = E.addDays(t, 1);
    if (d < st.startDate) d = st.startDate;
    for (var i = 0; i < 14; i++) {
      if (st.trainingWeekdays.indexOf(E.weekday(d)) >= 0) return d;
      d = E.addDays(d, 1);
    }
    return d;
  }
  function dayTitle(day) {
    var exs = S.state.program.filter(function (e) { return String(e.day).toUpperCase() === day && String(e.active).toUpperCase() !== 'FALSE'; })
      .sort(function (a, b) { return a.order - b.order; });
    return exs.slice(0, 2).map(function (e) { return e.name; }).join(', ') + (exs.length > 2 ? ' and more' : '');
  }
  function sealedAhead(res) {
    return S.state.postcards.filter(function (c) { return !c.delivered && c.km > res.cumKm; });
  }
  function unopenedMail() {
    return S.state.postcards.filter(function (c) { return c.delivered && !c.openedAt && !S.seen['pc:' + c.id]; });
  }
  function unseenCheers() {
    return S.state.cheers.filter(function (c) { return !c.seenAt && !S.seen['ch:' + c.id]; });
  }
  function onTimeWeeks(res) {
    var st = res.settings, cur = E.weekOf(todayStr(), st.startDate), total = 0, good = 0;
    for (var w = 1; w < cur; w++) {
      total++;
      var n = res.sessions.filter(function (s) { return s.completed && s.week === w; }).length;
      if (n >= st.trainingWeekdays.length) good++;
    }
    return { good: good, total: total };
  }

  // ---------- views ----------
  function topHTML(title, sub) {
    return '<header class="top"><div class="who"><h1>' + esc(title) + '</h1><div class="small muted">' + esc(sub) + '</div></div>' + syncHTML() + '</header>';
  }
  function demoEmpty() { try { return localStorage.getItem('fl.demoEmpty') === '1'; } catch (e) { return false; } }
  function flightSub() {
    var s = S.state.settings;
    return 'Flight ' + (s.flightNo || 'FL 1697') + ', Tampere to Luxembourg';
  }

  function flightlineHTML(res) {
    var st = res.settings;
    var hasToday = completedOn(res, todayStr()).length > 0;
    var eta = E.eta(res, todayStr(), hasToday);
    var pct = Math.min(100, res.cumKm / st.routeKm * 100);
    var h = '<div class="flightline"><div><div class="big">' + km(res.cumKm) + '<small>of ' + km(st.routeKm) + ' km</small></div></div>';
    if (eta.landed) h += '<div class="eta muted small">Landed<b>' + fmtDate(eta.date) + '</b></div>';
    else h += '<div class="eta muted small">Landing<b>' + fmtDate(eta.date) + '</b>about ' + plural(eta.sessionsLeft, 'workout', 'workouts') + ' to go</div>';
    h += '</div><div class="progress"><span style="width:' + pct.toFixed(1) + '%"></span></div>';
    var next = sealedAhead(res)[0];
    if (next) h += '<div class="nextcard">Next postcard from <b>' + esc(next.from) + '</b> in <b>' + km(next.km - res.cumKm) + ' km</b> ;)</div>';
    else if (!eta.landed) h += '<div class="nextcard">Every postcard on this route has been delivered.</div>';
    return h;
  }

  function viewHome() {
    var res = calc(), st = res.settings, t = todayStr();
    var h = '<div class="screen">' + topHTML('TMP → LUX', flightSub()) + mapSVG(res.cumKm) + flightlineHTML(res);

    var coach = role() === 'coach';
    var mail = coach ? [] : unopenedMail();
    if (mail.length) {
      var c0 = mail[0];
      h += '<button class="banner mail" data-act="postcard" data-id="' + esc(c0.id) + '">' + IC.envelope +
        '<p><b>' + (mail.length > 1 ? plural(mail.length, 'postcard', 'postcards') + ' waiting for you ;)' : 'You have mail from ' + esc(c0.from) + ' ;)') +
        '</b>Tap to open.</p></button>';
    }
    (coach ? [] : unseenCheers().slice(-1)).forEach(function (c) {
      h += '<button class="banner" data-act="cheerSeen" data-id="' + esc(c.id) + '">' + IC.cheer +
        '<p><b>' + esc(c.text) + '</b>From your coach :) Tap to dismiss.</p></button>';
    });

    if (coach) {
      h += '';
    } else if (S.draft) {
      h += '<section class="panel next"><div><h2>Workout in progress</h2><div class="muted small">Day ' + esc(S.draft.day) + ', started ' +
        new Date(S.draft.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</div></div>' +
        '<button class="btn taxi" data-act="resume">Resume</button></section>';
    } else if (res.landedOn) {
      h += '<section class="panel"><h2>Touchdown in Luxembourg :)</h2><p class="muted">Landed on ' + fmtLong(res.landedOn) +
        '. Your coach is planning the return flight. You can keep logging workouts in the meantime.</p>' +
        '<button class="btn ghost wide" data-act="board">Log a workout</button></section>';
    } else {
      var nd = nextSessionDate(res), day = E.nextDay(res), p = E.plan(res, nd, day);
      var when = nd === t ? 'Today' : fmtLong(nd);
      h += '<section class="panel next"><div><div class="small muted">Next workout, ' + esc(when) + '</div><h2>Day ' + day + '</h2>' +
        '<div class="small muted">' + esc(dayTitle(day)) + '</div><div class="small muted">' + plural(p.items.length, 'exercise', 'exercises') + ', ' +
        p.setsTotal + ' sets' + (p.layover ? ', layover week' : '') + '</div></div>' +
        '<button class="btn taxi" data-act="board">Let\'s go</button></section>';
    }

    // week strip
    var dow = (dateObj(t).getDay() + 6) % 7, monday = E.addDays(t, -dow);
    h += '<section class="panel"><h3>This week</h3><div class="week">';
    for (var i = 0; i < 7; i++) {
      var d = E.addDays(monday, i), wd = E.weekday(d);
      var marks = '';
      if (completedOn(res, d).length) marks += IC.plane.replace('<svg', '<svg style="color:var(--ink)"');
      if (S.state.stamps.some(function (s) { return s.date === d && s.type === 'ballet'; })) marks += IC.ballet.replace('<svg', '<svg style="color:var(--mail-red)"');
      if (S.state.stamps.some(function (s) { return s.date === d && s.type === 'run'; })) marks += IC.run.replace('<svg', '<svg style="color:var(--go)"');
      var cls = 'day' + (st.trainingWeekdays.indexOf(wd) >= 0 ? ' plan' : '') + (d === t ? ' today' : '');
      h += '<button class="' + cls + '" data-act="day" data-date="' + d + '" aria-label="' + esc(fmtLong(d)) + '"><span class="d">' +
        dateObj(d).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2) + '</span><span class="n">' + dateObj(d).getDate() +
        '</span><span class="marks">' + marks + '</span></button>';
    }
    h += '</div><div class="legend"><span>' + IC.plane.replace('<svg', '<svg style="color:var(--ink)"') + 'Gym</span><span>' +
      IC.ballet.replace('<svg', '<svg style="color:var(--mail-red)"') + 'Ballet</span><span>' +
      IC.run.replace('<svg', '<svg style="color:var(--go)"') + 'Run</span><span>Tap a day to add ballet or a run</span></div></section>';
    h += '</div>';
    return h;
  }

  function viewBoard() {
    var res = calc(), t = todayStr();
    var day = S.boardDay || E.nextDay(res);
    var p = E.plan(res, t, day);
    var s = S.state.settings, st = res.settings;
    var h = '<div class="screen"><header class="top"><button class="linkbtn backlink" data-act="home">' + IC.back + 'Home</button>' + syncHTML() + '</header>';
    h += '<article class="pass"><div class="head"><div class="route"><div><div class="code">TMP</div><div class="small muted">Tampere</div></div>' +
      '<svg class="arc" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true"><path d="M4 26Q60-6 116 26" fill="none" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="3 4"/>' +
      '<g transform="translate(60 10) scale(.8)"><path d="' + PLANE + '" fill="var(--ink)"/></g></svg>' +
      '<div style="text-align:right"><div class="code">LUX</div><div class="small muted">Luxembourg</div></div></div>' +
      '<div class="meta"><div class="pax">Passenger<b>' + esc(s.passengerName || 'Add your name in the Sheet') + '</b></div>' +
      '<div>Flight<b>' + esc(s.flightNo || 'FL 1697') + '</b></div><div>Departed<b>' + esc(fmtDate(st.startDate)) + '</b></div><div>Seat<b>1A</b></div></div>' +
      '<div class="passbar"><div class="progress"><span style="width:' + Math.min(100, res.cumKm / st.routeKm * 100).toFixed(1) + '%"></span></div>' +
      '<span class="small muted">' + km(res.cumKm) + ' of ' + km(st.routeKm) + ' km flown</span></div></div>' +
      '<div class="tear"></div><div class="body"><h2 style="margin-bottom:10px">Today: Day ' + day + '</h2>';
    if (p.items.some(function (it) { return it.taxi; })) {
      h += '<div class="note">Taxi week: for each exercise, pick a weight you could lift about 10 times with 2–3 reps to spare. The app remembers it :)</div>';
    }
    if (p.layover) h += '<div class="note">Layover week: two sets per exercise at your usual weights. Recovery is part of the flight ;)</div>';
    h += '<ol>';
    p.items.forEach(function (it) {
      var reps = it.targets.every(function (x) { return x === it.targets[0]; }) ? it.sets + ' × ' + it.targets[0] : it.targets.join(', ') + ' reps';
      h += '<li><span>' + esc(it.exercise.name) + '</span><span class="t">' + esc(reps) + (it.taxi ? '' : ' at ' + kgFmt(it.kg) + ' ' + esc(it.exercise.kgLabel)) + '</span></li>';
    });
    h += '</ol><div class="daypick"><button class="chip' + (day === 'A' ? ' on' : '') + '" data-act="boardDay" data-day="A">Day A</button>' +
      '<button class="chip' + (day === 'B' ? ' on' : '') + '" data-act="boardDay" data-day="B">Day B</button></div>' +
      '<div style="margin-top:16px"><button class="btn taxi wide" data-act="start" data-day="' + day + '">Start workout</button></div></div></article></div>';
    return h;
  }

  function startFlight(day) {
    var res = calc(), t = todayStr(), p = E.plan(res, t, day);
    var draft = { id: t + '-' + uid(), date: t, day: day, startedAt: Date.now(), cur: 0, items: [], sets: [] };
    p.items.forEach(function (it) {
      var e = it.exercise;
      var defKg = it.taxi ? (e.startKg !== null ? e.startKg : (/hand|side/.test(e.kgLabel) ? 4 : 20)) : it.kg;
      draft.items.push({ ex: e.id, name: e.name, kgLabel: e.kgLabel, step: e.stepKg || 1, rest: e.restSec, repMin: e.repMin, repMax: e.repMax,
        cue: e.cue, video: e.video, alts: e.alternatives, taxi: it.taxi, upgraded: it.upgraded, rerouted: it.rerouted,
        overridden: it.overridden, lastKg: it.lastKg, lastReps: it.lastReps, swap: '' });
      it.targets.forEach(function (tg, i) { draft.sets.push({ ex: e.id, set: i + 1, kg: defKg, reps: tg, target: tg, done: false }); });
    });
    S.draft = draft;
    store.set('draft', draft);
    S.view = 'flight';
    keepAwake();
    unlockAudio();
    render();
    window.scrollTo(0, 0);
  }

  function viewFlight() {
    var d = S.draft, it = d.items[d.cur];
    var mySets = d.sets.filter(function (x) { return x.ex === it.ex; });
    var curIdx = -1;
    for (var i = 0; i < mySets.length; i++) if (!mySets[i].done) { curIdx = i; break; }
    var h = '<div class="flightview"><div class="flightbar"><button class="linkbtn" data-act="home" aria-label="Back to departures" style="color:var(--ink);padding:4px">' + IC.close + '</button><div class="dots">';
    d.items.forEach(function (x, j) {
      var all = d.sets.filter(function (s) { return s.ex === x.ex; }).every(function (s) { return s.done; });
      h += '<i class="' + (j === d.cur ? 'cur' : all ? 'done' : '') + '"></i>';
    });
    h += '</div><span class="clock" id="clock">' + elapsed() + '</span></div>';

    h += '<div class="exhead"><div class="small muted">Exercise ' + (d.cur + 1) + ' of ' + d.items.length + '</div><h1>' + esc(it.swap || it.name) + '</h1><div class="tags">';
    if (it.swap) h += '<span class="tag">Swapped for ' + esc(it.name) + '</span>';
    if (it.upgraded && !it.swap) h += '<span class="tag up">Heavier today: +' + kgFmt(it.step) + ' kg &gt;:)</span>';
    if (it.rerouted && !it.swap) h += '<span class="tag down">Lighter today: reset 10%</span>';
    if (it.overridden && !it.swap) h += '<span class="tag">Weight set by your coach</span>';
    if (it.lastKg !== null && it.lastKg !== undefined && it.lastReps) h += '<span class="tag">Last time ' + it.lastReps.join(', ') + ' reps at ' + kgFmt(it.lastKg) + ' kg</span>';
    h += '</div>';
    if (it.cue) h += '<p class="cue">' + esc(it.cue) + '</p>';
    h += '<div class="exlinks">' + (it.video ? '<a class="linkbtn" href="' + esc(it.video) + '" target="_blank" rel="noopener">Watch the form</a>' : '') +
      (it.alts && it.alts.length ? '<button class="linkbtn" data-act="swap">Swap exercise</button>' : '') + '</div></div>';
    if (it.taxi) h += '<div class="taxihint">Find your weight: about 10 reps with 2–3 to spare. Adjust it between sets if needed :)</div>';

    h += '<div class="sets">';
    mySets.forEach(function (s, k) {
      var gi = d.sets.indexOf(s);
      var cls = 'setrow' + (s.done ? ' done' : '') + (k === curIdx ? ' cur' : '');
      h += '<div class="' + cls + '"><span class="no">' + s.set + '</span>' +
        stepper(gi, 'kg', s.kg, it.kgLabel) + stepper(gi, 'reps', s.reps, 'reps, goal ' + s.target) +
        '<button class="check" data-act="check" data-i="' + gi + '" aria-label="Set ' + s.set + (s.done ? ' done' : ' not done') + '" aria-pressed="' + s.done + '">' + IC.check + '</button></div>';
    });
    h += '</div>';

    var allDone = mySets.every(function (s) { return s.done; });
    var last = d.cur === d.items.length - 1;
    h += '<div class="navrow"><button class="btn ghost" data-act="prev"' + (d.cur === 0 ? ' disabled style="opacity:.4"' : '') + '>Previous</button>';
    h += last ? '<button class="btn ' + (allDone ? 'taxi' : '') + '" data-act="finish">Finish workout</button>'
      : '<button class="btn ' + (allDone ? 'taxi' : 'ghost') + '" data-act="next">Next exercise</button>';
    h += '</div>';
    if (!last) h += '<div class="finishrow"><button class="linkbtn" data-act="finish">Finish early</button></div>';
    return h + '</div>';
  }

  function stepper(i, field, val, label) {
    return '<div class="stepper"><button data-act="inc" data-i="' + i + '" data-f="' + field + '" data-d="-1" aria-label="Less ' + field + '">−</button>' +
      '<label><input inputmode="decimal" type="number" step="any" min="0" data-i="' + i + '" data-f="' + field + '" value="' + esc(val) + '" aria-label="' + field + '">' +
      '<small>' + esc(label) + '</small></label><button data-act="inc" data-i="' + i + '" data-f="' + field + '" data-d="1" aria-label="More ' + field + '">+</button></div>';
  }

  function elapsed() {
    if (!S.draft) return '';
    var s = Math.floor((Date.now() - S.draft.startedAt) / 1000);
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  function draftSession() {
    var d = S.draft;
    var swaps = {};
    d.items.forEach(function (it) { if (it.swap) swaps[it.ex] = it.swap; });
    return { id: d.id, date: d.date, day: d.day, effort: d.effort || null, mood: d.mood || '', note: d.note || '',
      sets: d.sets.map(function (s) { return { ex: s.ex, set: s.set, kg: Number(s.kg) || 0, reps: Number(s.reps) || 0, done: !!s.done, swap: swaps[s.ex] || '' }; }) };
  }

  function preview() {
    var st = S.state;
    return E.previewSession({ settings: st.settings, program: st.program, sessions: st.sessions, overrides: st.overrides }, draftSession());
  }

  function viewLanding() {
    var pv = preview(), c = pv.session, d = S.draft, st = pv.result.settings;
    var n = pv.result.sessions.length;
    var h = '<div class="screen"><header class="top"><div class="who"><h1>' + (c.completed ? 'Nice work :)' : 'Holding pattern') + '</h1>' +
      '<div class="small muted">Workout ' + n + ', Day ' + esc(d.day) + '</div></div>' + syncHTML() + '</header>' + mapSVG(c.cumKm);
    if (c.completed) {
      h += '<div class="kmbig">+' + kgFmt(c.km.total) + '<small>km</small></div>';
      h += '<p class="muted kmsplit">' + kgFmt(c.km.cruise) + ' cruise + ' + kgFmt(c.km.tailwind) + ' tailwind' + (c.km.jet ? ' + ' + kgFmt(c.km.jet) + ' jet stream' : '') +
        '. Now ' + km(c.cumKm) + ' of ' + km(st.routeKm) + ' km, and you lifted ' + km(c.volume) + ' kg today.</p>';
    } else {
      var need = Math.ceil(c.prescribed * st.completeShare);
      h += '<p style="margin-top:14px">' + c.done + ' of ' + c.prescribed + ' sets are ticked. The plane needs ' + need +
        ' to move, so it circles for now. Your sets are still saved.</p><button class="btn ghost wide" data-act="resume">Back to the workout</button>';
    }
    if (c.upgrades.length) {
      h += '<section class="panel"><h3>Heavier next time &gt;:)</h3><ul class="uplist">';
      c.upgrades.forEach(function (id) {
        var it = d.items.filter(function (x) { return x.ex === id; })[0];
        var nk = pv.result.exState[id] ? pv.result.exState[id].kg : null;
        h += '<li><span>' + esc(it ? it.name : id) + '</span><span class="num">' + kgFmt(nk) + ' kg</span></li>';
      });
      h += '</ul></section>';
    }
    h += '<div class="rate"><h3>How hard was it?</h3><div class="scale">';
    ['Easy', 'Steady', 'Hard', 'Very hard', 'Max &gt;:)'].forEach(function (l, i) {
      h += '<button class="' + (d.effort === i + 1 ? 'on' : '') + '" data-act="effort" data-v="' + (i + 1) + '"><b>' + (i + 1) + '</b>' + l + '</button>';
    });
    h += '</div></div><div class="rate"><h3>How do you feel?</h3><div class="scale">';
    [['😴', 'Tired'], ['😐', 'Meh'], ['🙂', 'Good'], ['😄', 'Great'], ['🔥', 'On fire']].forEach(function (m) {
      h += '<button class="' + (d.mood === m[0] ? 'on' : '') + '" data-act="mood" data-v="' + m[0] + '"><span class="emo">' + m[0] + '</span>' + m[1] + '</button>';
    });
    h += '</div></div><div class="rate"><h3>Note for your coach</h3><textarea id="note" placeholder="Sore knee, felt strong, machine was taken…">' + esc(d.note || '') + '</textarea></div>';
    h += '<div style="margin-top:18px"><button class="btn taxi wide" data-act="save">Save workout</button></div></div>';
    return h;
  }

  function viewLog() {
    var res = calc(), st = res.settings;
    var h = '<div class="screen">' + topHTML('Flight log', flightSub());
    var ot = onTimeWeeks(res);
    h += '<div class="stats"><div class="stat"><b>' + res.completedCount + '</b><span>Workouts</span></div>' +
      '<div class="stat"><b>' + km(res.cumKm) + ' km</b><span>Flown of ' + km(st.routeKm) + '</span></div>' +
      '<div class="stat"><b>' + (ot.total ? ot.good + ' of ' + ot.total : '—') + '</b><span>Weeks with both workouts</span></div>' +
      '<div class="stat"><b>' + (res.totalVolume >= 10000 ? kgFmt(res.totalVolume / 1000) + ' t' : km(res.totalVolume) + ' kg') + '</b><span>Cargo lifted</span></div></div>';
    if (res.totalVolume > 0) {
      var moose = Math.round(res.totalVolume / 400);
      h += '<p class="cargo">That is about ' + plural(moose, 'moose', 'moose') + ' (at roughly 400 kg each)' +
        (res.totalVolume > 42000 ? ', or more than an empty Airbus A320.' : '.') + '</p>';
    }
    // postcards
    var cards = S.state.postcards;
    var got = cards.filter(function (c) { return c.delivered; });
    h += '<div class="section-h"><h2>Postcard box</h2><span class="small muted">' + got.length + ' of ' + cards.length + '</span></div><div class="box">';
    cards.forEach(function (c) {
      if (c.delivered) {
        h += '<button class="thumb" data-act="postcard" data-id="' + esc(c.id) + '">' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="" loading="lazy">' : frontArt(c, true)) +
          '<span>' + esc(c.place) + '</span></button>';
      } else {
        h += '<div class="thumb sealed">Sealed ;)<br>' + km(c.km) + ' km</div>';
      }
    });
    h += '</div>';
    // strength
    h += '<div class="section-h"><h2>Strength</h2><span class="small muted">working weight</span></div><section class="panel" style="margin-top:0;padding-top:6px;padding-bottom:6px">';
    var any = false;
    res.program.forEach(function (e) {
      var s = res.exState[e.id];
      if (!s || !s.history.length) return;
      any = true;
      var hist = s.history.map(function (x) { return x.kg; });
      h += '<div class="exprog"><div class="nm">' + esc(e.name) + '<small>Started at ' + kgFmt(hist[0]) + ' ' + esc(e.kgLabel) + '</small></div>' + spark(hist) +
        '<div class="kg">' + kgFmt(s.kg) + '</div></div>';
    });
    if (!any) h += '<p class="empty">Your weights show up here after your first workout.</p>';
    h += '</section>';
    // passes
    h += '<div class="section-h"><h2>Workouts</h2></div>';
    var list = res.sessions.slice().reverse();
    if (!list.length) h += '<p class="empty">No workouts yet. They show up here after your first one :)</p>';
    var n = res.sessions.length;
    list.forEach(function (s, i) {
      h += '<div class="mini' + (s.completed ? '' : ' hold') + '"><div class="seat">' + (n - i) + '<small>Day ' + s.day + '</small></div>' +
        '<div><b>' + esc(fmtDate(s.date)) + '</b><div class="small muted">' + (s.completed ? km(s.volume) + ' kg lifted' : 'Plane was holding') +
        (s.effort ? ', effort ' + s.effort + '/5' : '') + (s.mood ? ' ' + esc(s.mood) : '') + (s.upgrades.length ? ', ' + plural(s.upgrades.length, 'upgrade', 'upgrades') : '') + '</div></div>' +
        '<div class="km">' + (s.completed ? '+' + Math.round(s.km.total) : '0') + '<small>km</small></div></div>';
    });
    if (DEMO) h += demoLinks();
    h += '</div>';
    return h;
  }

  function demoLinks() {
    return '<p style="text-align:center;margin-top:24px;display:flex;gap:20px;justify-content:center">' +
      '<button class="linkbtn" data-act="switchRole">' + (DEMO_ROLE === 'coach' ? 'Switch to her view' : 'Switch to the coach view') + '</button>' +
      '<button class="linkbtn" data-act="resetDemo">Restart with example data</button>' +
      '<button class="linkbtn" data-act="resetDemoEmpty">Restart from 0 km</button></p>';
  }

  function spark(vals) {
    var w = 96, h = 30;
    if (vals.length === 1) vals = [vals[0], vals[0]];
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1;
    var pts = vals.map(function (v, i) { return [i / (vals.length - 1) * w, h - 3 - (v - min) / span * (h - 6)]; });
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline class="spark" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') +
      '"/><circle class="spark-end" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5"/></svg>';
  }

  function viewCoach() {
    var res = calc(), st = res.settings, s = S.state.settings;
    var h = '<div class="screen">' + topHTML('Coach console', (s.passengerName ? s.passengerName + ', ' : '') + 'flight ' + (s.flightNo || 'FL 1697')) + mapSVG(res.cumKm) + flightlineHTML(res);
    if (s.sheetUrl) h += '<p><a class="btn ghost wide" href="' + esc(s.sheetUrl) + '" target="_blank" rel="noopener">Open the Sheet</a></p>';

    h += '<section class="panel"><h3>Send a cheer</h3><p class="small muted" style="margin:4px 0 10px">It shows on her departures screen until she taps it.</p>' +
      '<textarea id="cheerText" maxlength="280" placeholder="Friday is RDL day. Go get them."></textarea>' +
      '<div style="margin-top:10px"><button class="btn wide" data-act="sendCheer">Send cheer</button></div></section>';

    var nd = nextSessionDate(res), day = E.nextDay(res), p = E.plan(res, nd, day);
    h += '<div class="section-h"><h2>Next: Day ' + day + '</h2><span class="small muted">' + esc(fmtDate(nd)) + (p.layover ? ', layover' : '') + '</span></div>';
    h += '<section class="panel" style="margin-top:0"><table class="plantable">';
    p.items.forEach(function (it) {
      var tag = it.upgraded ? ' <span class="status ok">upgrade</span>' : it.rerouted ? ' <span class="status warn">reset</span>' : it.overridden ? ' <span class="status">you set</span>' : '';
      h += '<tr><td>' + esc(it.exercise.name) + tag + '<div class="small muted">' + it.targets.join(', ') + ' reps' + (it.taxi ? ', she picks the weight' : ' at ' + kgFmt(it.kg) + ' ' + esc(it.exercise.kgLabel)) + '</div></td>' +
        '<td class="r"><button class="btn ghost small" data-act="override" data-ex="' + esc(it.exercise.id) + '" data-kg="' + (it.kg === null ? '' : it.kg) + '" data-name="' + esc(it.exercise.name) + '">Set kg</button></td></tr>';
    });
    h += '</table></section>';

    h += '<div class="section-h"><h2>Postcards</h2></div><section class="panel" style="margin-top:0">';
    var avg = E.eta(res, todayStr(), false).avgKm || 65;
    S.state.postcards.forEach(function (c) {
      var status, cls = '';
      if (c.openedAt) { status = 'Opened'; cls = 'ok'; }
      else if (c.delivered) { status = 'Delivered'; cls = 'ok'; }
      else if (!c.written) { var left = c.km - res.cumKm; status = left <= 0 ? 'Passed, write it now' : left < avg * 2 ? 'Empty, due in ' + km(left) + ' km' : 'Empty'; cls = left < avg * 2 ? 'warn' : ''; }
      else status = 'Written, sealed';
      h += '<div class="cardrow"><div><b>' + esc(c.place) + '</b>, ' + esc(c.from) + '<div class="small muted">Delivered over ' + esc(c.over) + ' at ' + km(c.km) + ' km</div></div>' +
        '<span class="status ' + cls + '">' + esc(status) + '</span></div>';
    });
    h += '<p class="small muted" style="margin:10px 0 0">Write notes and add photo links in the Postcards tab of the Sheet.</p></section>';

    h += '<div class="section-h"><h2>Her workouts</h2></div><div class="feed">';
    var list = res.sessions.slice().reverse(), n = res.sessions.length, names = {};
    res.program.forEach(function (e) { names[e.id] = e.name; });
    if (!list.length) h += '<p class="empty">Her sessions appear here as soon as she saves them.</p>';
    list.forEach(function (x, i) {
      h += '<div class="item"><div class="l1"><b>Workout ' + (n - i) + ', Day ' + x.day + '</b><span class="num">' + (x.completed ? '+' + kgFmt(x.km.total) + ' km' : 'holding') + '</span></div>' +
        '<div class="l2">' + esc(fmtDate(x.date)) + ', week ' + x.week + ', ' + x.done + '/' + x.prescribed + ' sets, ' + km(x.volume) + ' kg' +
        (x.effort ? ', effort ' + x.effort + '/5' : '') + (x.mood ? ' ' + esc(x.mood) : '') + '</div>' +
        (x.upgrades.length ? '<div class="l2">Upgrades: ' + esc(x.upgrades.map(function (id) { return names[id] || id; }).join(', ')) + '</div>' : '') +
        (x.rerouted.length ? '<div class="l2">Reset 10%: ' + esc(x.rerouted.map(function (id) { return names[id] || id; }).join(', ')) + '</div>' : '') +
        (x.note ? '<q>' + esc(x.note) + '</q>' : '') + '</div>';
    });
    h += '</div>';
    if (DEMO) h += demoLinks();
    h += '</div>';
    return h;
  }

  function tabsHTML() {
    var tabs = role() === 'coach'
      ? [['coach', 'Coach', IC.tabCoach], ['home', 'Her view', IC.tabHome], ['log', 'Flight log', IC.tabLog]]
      : [['home', 'Departures', IC.tabHome], ['log', 'Flight log', IC.tabLog]];
    return '<div class="tabs"><nav>' + tabs.map(function (t) {
      return '<button class="' + (S.view === t[0] ? 'on' : '') + '" data-act="tab" data-v="' + t[0] + '">' + t[2] + t[1] + '</button>';
    }).join('') + '</nav></div>';
  }

  // ---------- postcards ----------
  function frontArt(c, small) {
    var big = (c.from || 'Tampere');
    return '<svg class="ill" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="300" height="200" fill="#13224A"/>' +
      '<path d="M0 150Q75 128 150 146T300 138V200H0Z" fill="#1d3264"/><path d="M0 170Q90 152 170 168T300 160V200H0Z" fill="#253d77"/>' +
      '<text x="150" y="' + (small ? 118 : 112) + '" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="' +
      Math.min(96, Math.floor(560 / Math.max(4, big.length))) + '" fill="#FFC233" stroke="#13224A" stroke-width="2" paint-order="stroke">' + esc(big) + '</text></svg>';
  }
  function stampSVG() {
    var h = '<svg class="stamp" viewBox="0 0 58 70" aria-hidden="true"><rect x="2" y="2" width="54" height="66" fill="#fff" stroke="#c9c1ad" stroke-width="1"/>';
    for (var x = 4; x < 56; x += 5) h += '<circle cx="' + x + '" cy="2" r="1.6" fill="#FFFDF8"/><circle cx="' + x + '" cy="68" r="1.6" fill="#FFFDF8"/>';
    for (var y = 4; y < 68; y += 5) h += '<circle cx="2" cy="' + y + '" r="1.6" fill="#FFFDF8"/><circle cx="56" cy="' + y + '" r="1.6" fill="#FFFDF8"/>';
    h += '<rect x="7" y="7" width="44" height="56" fill="#1F4FBF"/><g transform="translate(29 30) rotate(-30) scale(1.25)"><path d="' + PLANE + '" fill="#FFC233"/></g>' +
      '<text x="29" y="54" text-anchor="middle" font-family="Barlow, sans-serif" font-size="6.5" font-weight="700" fill="#fff" textLength="38" lengthAdjust="spacingAndGlyphs">SUOMI FINLAND</text></svg>';
    return h;
  }
  function postmarkSVG(city, ds) {
    return '<svg class="postmark" viewBox="0 0 84 84" aria-hidden="true"><defs><path id="pmArc" d="M14 42a28 28 0 1 1 56 0"/></defs>' +
      '<circle cx="42" cy="42" r="38" fill="none" stroke="#2b3550" stroke-width="2"/><circle cx="42" cy="42" r="25" fill="none" stroke="#2b3550" stroke-width="1.2"/>' +
      '<text font-family="Barlow, sans-serif" font-size="10" font-weight="700" fill="#2b3550" letter-spacing="2"><textPath href="#pmArc" startOffset="50%" text-anchor="middle">' + esc(String(city).toUpperCase()) + '</textPath></text>' +
      '<text x="42" y="46" text-anchor="middle" font-family="Barlow, sans-serif" font-size="9" font-weight="600" fill="#2b3550">' + esc(ds ? fiDate(ds) : '') + '</text>' +
      '<path d="M-60 20q8-5 16 0t16 0 16 0M-60 32q8-5 16 0t16 0 16 0M-60 44q8-5 16 0t16 0 16 0" fill="none" stroke="#2b3550" stroke-width="1.2" transform="translate(4 8)"/></svg>';
  }
  function openPostcard(id) {
    var c = S.state.postcards.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var name = S.state.settings.passengerName || 'the passenger in seat 1A';
    var h = '<div class="postcard-modal"><div class="pc-wrap"><div class="pc" id="pc" data-act="flip" role="button" tabindex="0" aria-label="Postcard, tap to turn over">' +
      '<div class="pc-face pc-front">' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.place) + '">' : frontArt(c)) +
      '<div class="cap"><small>Greetings from ' + esc(c.from) + '</small>' + esc(c.place) + '</div></div>' +
      '<div class="pc-face pc-back"><div class="inner"><div class="msg">' + esc(c.message || '') + '</div><div class="side">' + stampSVG() + postmarkSVG(c.from, c.deliveredOn) +
      '<div class="addr">To ' + esc(name) + ',<br>somewhere over ' + esc(c.over) + '</div></div></div></div></div></div>' +
      '<p class="pc-hint" id="pcHint">Tap the card to turn it over</p><button class="btn ghost wide pc-close" data-act="closeModal">Close</button></div>';
    showModal(h, true);
    if (role() === 'athlete' && !c.openedAt && !S.seen['pc:' + c.id]) {
      S.seen['pc:' + c.id] = 1;
      store.set('seen', S.seen);
      enqueue({ type: 'postcardOpened', id: c.id });
    }
  }

  // ---------- modals ----------
  function showModal(inner, center) {
    var m = document.getElementById('modal');
    m.className = (center ? 'center' : '') + (inner.indexOf('postcard-modal') >= 0 ? ' dark' : '');
    m.innerHTML = inner.indexOf('postcard-modal') >= 0 ? inner : '<div class="sheet" role="dialog" aria-modal="true">' + inner + '</div>';
    m.hidden = false;
    var f = m.querySelector('input, textarea, button');
    if (f && f.tagName !== 'BUTTON') setTimeout(function () { f.focus(); }, 50);
  }
  function closeModal() { var m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; render(); }

  function daySheet(ds) {
    var res = calc();
    var flights = res.sessions.filter(function (s) { return s.date === ds; });
    var has = function (t) { return S.state.stamps.some(function (s) { return s.date === ds && s.type === t; }); };
    var h = '<h2>' + esc(fmtLong(ds)) + '</h2>';
    if (flights.length) h += '<p class="muted">' + flights.map(function (f) { return 'Day ' + f.day + ': ' + (f.completed ? '+' + kgFmt(f.km.total) + ' km' : 'the plane was holding'); }).join('. ') + '</p>';
    else h += '<p class="muted">Ballet and runs don\'t move the plane, but your coach sees them ;)</p>';
    h += '<div class="toggles">';
    [['ballet', 'Ballet', IC.ballet, 'var(--mail-red)'], ['run', 'Run', IC.run, 'var(--go)']].forEach(function (t) {
      var on = has(t[0]);
      h += '<button class="toggle' + (on ? ' on' : '') + '" data-act="stamp" data-date="' + ds + '" data-type="' + t[0] + '" data-on="' + (on ? 0 : 1) + '" aria-pressed="' + on + '">' +
        t[2].replace('<svg', '<svg style="color:' + t[3] + '"') + t[1] + '<span class="box2">' + (on ? IC.check : '') + '</span></button>';
    });
    h += '</div><div class="row"><button class="btn ghost" data-act="closeModal">Done</button></div>';
    showModal(h);
  }

  function confirmFinish() {
    var d = S.draft, done = d.sets.filter(function (s) { return s.done; }).length, total = d.sets.length;
    var need = Math.ceil(total * settings().completeShare);
    if (done >= need) { goLanding(); return; }
    showModal('<h2>Finish now?</h2><p>' + done + ' of ' + total + ' sets are logged. The plane needs ' + need + ' to fly. You can finish anyway, and your sets are still saved.</p>' +
      '<div class="row"><button class="btn ghost" data-act="closeModal">Keep going</button><button class="btn" data-act="finishAnyway">Finish anyway</button></div>');
  }

  function swapSheet() {
    var it = S.draft.items[S.draft.cur];
    var h = '<h2>Swap exercise</h2><p class="muted">Machine taken? Pick an alternative. It counts for your cargo, and your progress on ' + esc(it.name) + ' waits for next time.</p><div class="toggles">';
    it.alts.forEach(function (a) {
      h += '<button class="toggle' + (it.swap === a ? ' on' : '') + '" data-act="doSwap" data-v="' + esc(a) + '">' + esc(a) + '<span class="box2">' + (it.swap === a ? IC.check : '') + '</span></button>';
    });
    h += '<button class="toggle' + (!it.swap ? ' on' : '') + '" data-act="doSwap" data-v="">' + esc(it.name) + ' (original)<span class="box2">' + (!it.swap ? IC.check : '') + '</span></button>';
    h += '</div><div class="row"><button class="btn ghost" data-act="closeModal">Done</button></div>';
    showModal(h);
  }

  function overrideSheet(ex, kg, name) {
    showModal('<h2>' + esc(name) + '</h2><p class="muted">Set the weight for her next session. The app continues its normal progression from there.</p>' +
      '<input class="field" id="ovKg" type="number" inputmode="decimal" step="any" min="0" value="' + esc(kg) + '" aria-label="Weight in kg">' +
      '<div class="row"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-act="saveOverride" data-ex="' + esc(ex) + '">Save weight</button></div>', true);
  }

  // ---------- rest timer, sound, wake lock, confetti ----------
  var restT = null, restEnd = 0, audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function beep() {
    if (!audioCtx) return;
    try {
      [0, 0.22].forEach(function (off) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + off;
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.start(t); o.stop(t + 0.2);
      });
    } catch (e) { /* no sound */ }
  }
  function startRest(sec, nextLabel) {
    stopRest();
    restEnd = Date.now() + sec * 1000;
    var el = document.getElementById('rest');
    el.hidden = false;
    el.className = '';
    el.innerHTML = '<span class="t" id="restT"></span><span class="lbl"><b>Rest</b>' + esc(nextLabel) + '</span>' +
      '<button data-act="restAdd">+15 s</button><button data-act="restSkip">Skip</button>';
    var beeped = false;
    function tick() {
      var left = Math.ceil((restEnd - Date.now()) / 1000);
      var t = document.getElementById('restT');
      if (!t) return;
      if (left > 0) { t.textContent = Math.floor(left / 60) + ':' + pad(left % 60); el.className = ''; }
      else {
        t.textContent = 'Go >:)';
        el.className = 'over';
        if (!beeped) { beeped = true; beep(); }
        if (left < -25) stopRest();
      }
    }
    tick();
    restT = setInterval(tick, 250);
  }
  function stopRest() { clearInterval(restT); restT = null; var el = document.getElementById('rest'); el.hidden = true; el.innerHTML = ''; }

  var wakeLock = null;
  function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) navigator.wakeLock.request('screen').then(function (w) {
        wakeLock = w; w.addEventListener('release', function () { wakeLock = null; });
      }, function () { /* not allowed */ });
    } catch (e) { /* unsupported */ }
  }
  function releaseAwake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }

  function confetti() {
    if (reducedMotion()) return;
    var c = document.getElementById('confetti'), ctx = c.getContext && c.getContext('2d');
    if (!ctx) return;
    var W = c.width = innerWidth * devicePixelRatio, H = c.height = innerHeight * devicePixelRatio;
    var colors = ['#FFC233', '#13224A', '#D7263D', '#1F4FBF', '#FFFFFF'];
    var ps = [];
    for (var i = 0; i < 140; i++) ps.push({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 18 * devicePixelRatio,
      vy: (-Math.random() * 16 - 6) * devicePixelRatio, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4, w: (6 + Math.random() * 6) * devicePixelRatio,
      h: (3 + Math.random() * 4) * devicePixelRatio, c: colors[i % colors.length] });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        p.vy += .55 * devicePixelRatio; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= .99;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (t - t0 < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  // ---------- flow ----------
  function goLanding() {
    stopRest();
    S.draft.finishedAt = Date.now();
    store.set('draft', S.draft);
    S.view = 'landing';
    render();
    window.scrollTo(0, 0);
    var pv = preview();
    if (pv.session.completed) {
      animatePlane(pv.session.cumBefore, pv.session.cumKm);
      if (pv.session.upgrades.length) setTimeout(confetti, 2600);
    }
  }

  function saveFlight() {
    var note = document.getElementById('note');
    if (note) S.draft.note = note.value;
    var sess = draftSession();
    var passed = preview().session;
    S.draft = null;
    store.del('draft');
    releaseAwake();
    S.view = 'home';
    S.autoMail = passed.completed;
    enqueue({ type: 'saveSession', session: sess });
    render();
    window.scrollTo(0, 0);
  }

  // ---------- events ----------
  var app = document.getElementById('app');
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) {
      if (ev.target.id === 'modal' && !document.getElementById('pc')) closeModal();
      return;
    }
    var a = t.dataset.act, d = S.draft;
    switch (a) {
      case 'tab': S.view = t.dataset.v; render(); window.scrollTo(0, 0); break;
      case 'home': S.view = role() === 'coach' ? 'coach' : 'home'; stopRest(); render(); window.scrollTo(0, 0); break;
      case 'board': S.boardDay = null; S.view = 'board'; render(); window.scrollTo(0, 0); break;
      case 'boardDay': S.boardDay = t.dataset.day; render(); break;
      case 'start': startFlight(t.dataset.day); break;
      case 'resume': S.view = 'flight'; keepAwake(); unlockAudio(); render(); break;
      case 'inc': {
        var s = d.sets[+t.dataset.i], it = d.items.filter(function (x) { return x.ex === s.ex; })[0];
        var f = t.dataset.f, step = f === 'kg' ? it.step : 1;
        s[f] = Math.max(0, Math.round((Number(s[f]) + step * Number(t.dataset.d)) * 100) / 100);
        if (f === 'kg') d.sets.forEach(function (o) { if (o.ex === s.ex && !o.done && o.set > s.set) o.kg = s.kg; }); // carry weight to later sets
        store.set('draft', d); render(); break;
      }
      case 'check': {
        unlockAudio();
        var cs = d.sets[+t.dataset.i];
        cs.done = !cs.done;
        store.set('draft', d);
        if (cs.done) {
          var rest = d.items[d.cur].rest || 90;
          var nxt = d.sets.filter(function (o) { return o.ex === cs.ex && !o.done; })[0];
          if (nxt) startRest(rest, 'Next: set ' + nxt.set + ', ' + nxt.reps + ' reps at ' + kgFmt(nxt.kg) + ' kg');
          else if (d.cur < d.items.length - 1) startRest(rest, 'Next: ' + (d.items[d.cur + 1].name));
          else stopRest();
        } else stopRest();
        render(); break;
      }
      case 'prev': if (d.cur > 0) { d.cur--; store.set('draft', d); render(); window.scrollTo(0, 0); } break;
      case 'next': if (d.cur < d.items.length - 1) { d.cur++; store.set('draft', d); render(); window.scrollTo(0, 0); } break;
      case 'finish': confirmFinish(); break;
      case 'finishAnyway': closeModalSilently(); goLanding(); break;
      case 'swap': swapSheet(); break;
      case 'doSwap': d.items[d.cur].swap = t.dataset.v; store.set('draft', d); closeModal(); break;
      case 'effort': d.effort = +t.dataset.v; keepNote(); store.set('draft', d); render(); break;
      case 'mood': d.mood = t.dataset.v; keepNote(); store.set('draft', d); render(); break;
      case 'save': saveFlight(); break;
      case 'restAdd': restEnd = Math.max(restEnd, Date.now()) + 15000; break;
      case 'restSkip': stopRest(); break;
      case 'postcard': openPostcard(t.dataset.id); break;
      case 'flip': {
        t.classList.toggle('flipped');
        var hint = document.getElementById('pcHint');
        if (hint) hint.textContent = t.classList.contains('flipped') ? 'Tap the card to see the front' : 'Tap the card to turn it over';
        break;
      }
      case 'closeModal': closeModal(); break;
      case 'cheerSeen': S.seen['ch:' + t.dataset.id] = 1; store.set('seen', S.seen); enqueue({ type: 'cheerSeen', id: t.dataset.id }); render(); break;
      case 'day': daySheet(t.dataset.date); break;
      case 'stamp': enqueue({ type: 'stamp', date: t.dataset.date, stampType: t.dataset.type, on: t.dataset.on === '1' }); daySheet(t.dataset.date); render(); break;
      case 'sendCheer': {
        var tx = document.getElementById('cheerText');
        if (tx && tx.value.trim()) { enqueue({ type: 'cheer', text: tx.value.trim() }); tx.value = ''; render(); }
        break;
      }
      case 'override': overrideSheet(t.dataset.ex, t.dataset.kg, t.dataset.name); break;
      case 'saveOverride': {
        var v = Number(document.getElementById('ovKg').value);
        if (isFinite(v) && v >= 0) enqueue({ type: 'override', ex: t.dataset.ex, kg: v });
        closeModal(); break;
      }
      case 'resetDemo': Demo.reset(false); location.reload(); break;
      case 'resetDemoEmpty': Demo.reset(true); location.reload(); break;
      case 'switchRole': Demo.switchRole(); location.reload(); break;
    }
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.id === 'pc') { ev.preventDefault(); ev.target.click(); }
    if (ev.key === 'Escape' && !document.getElementById('modal').hidden) closeModal();
  });
  function closeModalSilently() { var m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; }
  function keepNote() { var n = document.getElementById('note'); if (n && S.draft) S.draft.note = n.value; }

  app.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.dataset && el.dataset.f && S.draft) {
      var s = S.draft.sets[+el.dataset.i], v = Math.max(0, Number(String(el.value).replace(',', '.')) || 0);
      s[el.dataset.f] = v;
      if (el.dataset.f === 'kg') S.draft.sets.forEach(function (o) { if (o.ex === s.ex && !o.done && o.set > s.set) o.kg = v; });
      store.set('draft', S.draft);
      render();
    }
  });
  app.addEventListener('input', function (ev) {
    if (ev.target.id === 'note' && S.draft) { S.draft.note = ev.target.value; store.set('draft', S.draft); }
  });
  setInterval(function () { var c = document.getElementById('clock'); if (c) c.textContent = elapsed(); }, 1000);

  // ---------- render ----------
  function render() {
    if (!DEMO && !KEY) {
      app.innerHTML = '<div class="err"><h1>This link is missing its key</h1><p class="muted">Open the exact link your coach sent you, then add it to your Home Screen from there.</p></div>';
      return;
    }
    if (S.error === 'auth') {
      app.innerHTML = '<div class="err"><h1>This link has expired</h1><p class="muted">Ask your coach for a new link. Your workouts are safe in the Sheet.</p></div>';
      return;
    }
    if (!S.state) {
      app.innerHTML = '<div class="err"><h1>Preparing your flight</h1><p class="muted">' +
        (S.sync === 'offline' || S.sync === 'error' ? 'No connection yet. Open the app again when you have signal. After the first load it works offline too.' : 'Loading the flight plan…') + '</p></div>';
      return;
    }
    var v = S.view || (role() === 'coach' ? 'coach' : 'home');
    if ((v === 'flight' || v === 'landing') && !S.draft) v = 'home';
    if (v === 'coach' && role() !== 'coach') v = 'home';
    S.view = v;
    var html = v === 'home' ? viewHome() : v === 'board' ? viewBoard() : v === 'flight' ? viewFlight() : v === 'landing' ? viewLanding()
      : v === 'log' ? viewLog() : viewCoach();
    if (v === 'home' || v === 'log' || v === 'coach') html += tabsHTML();
    app.innerHTML = html;
  }

  // ---------- boot ----------
  if (!DEMO && 'serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell unavailable */ }); } catch (e) { /* ignore */ }
  }
  if (S.draft) S.view = 'flight';
  render();
  if (DEMO || KEY) flush();
  window.FlightApp = { S: S, render: render }; // for debugging
})();
