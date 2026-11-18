/* Flight TMP → LUX — the app (v3). Needs FlightEngine, MAPDATA, FlightCore (demo only), FLIGHT_CONFIG. */
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
  var NS = 'fl.' + (DEMO ? 'demo.v5.' + DEMO_ROLE : KEY) + '.';
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
    dumbbell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -3)"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    tabHome: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path class="accent" d="' + PLANE + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="rotate(-35)"/></svg>',
    tabLog: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="accent" x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    goldCheck: '<svg viewBox="0 0 24 24" class="gc" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--gold)"/><path d="M6.8 12.4l3.4 3.4 7-7.4" fill="none" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dbOutline: '<svg viewBox="0 0 24 24" class="dbo" aria-hidden="true"><rect x="4.2" y="6.5" width="3.6" height="11" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<rect x="16.2" y="6.5" width="3.6" height="11" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.8 10v4M22.2 10v4M7.8 12h8.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    tabTrain: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="accent" x="4.6" y="6" width="3.4" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<rect class="accent" x="16" y="6" width="3.4" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<path d="M2 9.5v5M22 9.5v5M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    tabProgress: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="accent" x="4" y="12" width="4" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<rect class="accent" x="10" y="8" width="4" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<rect class="accent" x="16" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
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
      }).then(function (r) { return r.json(); }), 45000).then(checked);
    },
    photo: function (id) {
      return withTimeout(fetch(CFG.apiUrl + '?a=photo&k=' + encodeURIComponent(KEY) + '&id=' + encodeURIComponent(id), { cache: 'no-store' })
        .then(function (r) { return r.json(); }), 30000).then(function (j) { if (!j.ok) throw new Error(j.error); return j.dataUrl; });
    }
  };

  var Demo = (function () {
    var START = { 'incline-db-press': 8, 'incline-smith-press': 20, 'incline-bb-press': 20, 'incline-machine-press': 25,
      'cable-row': 30, 'one-arm-db-row': 10, 'wide-cable-row': 27.5, 'machine-row': 30, 'neutral-pulldown': 32.5,
      'overhand-pulldown': 30, 'assisted-chinup': 30, 'hip-thrust-machine': 50, 'hip-thrust': 50, 'bulgarian-split-squat': 8, 'back-extension': 0, 'rdl': 35,
      'lateral-raise': 4, 'machine-lateral-raise': 10, 'cable-lateral-raise': 2.5, 'cable-crunch': 20, 'machine-crunch': 20,
      'decline-crunch': 0, 'incline-curl': 5, 'preacher-curl': 10, 'cable-curl': 10, 'rope-pressdown': 12.5, 'bar-pressdown': 15,
      'overhead-extension': 10 };
    function seed() {
      var C = window.FlightCore;
      var t = todayStr();
      var empty = demoEmpty();
      var dow = (dateObj(t).getDay() + 6) % 7;
      var start = E.addDays(t, -dow - (empty ? 0 : 21));
      var settings = {};
      C.seedSettings({ athleteKey: 'demo', coachKey: 'demo' }).forEach(function (r) { settings[r.key] = r.value; });
      settings.startDate = start;
      settings.herName = 'Her name';
      var data = { settings: settings, slots: C.seedSlots(), exercises: C.seedExercises(), choices: [], sessions: [], sets: [],
        overrides: [], stamps: [], postcards: C.seedPostcards(), cheers: [], reactions: [] };
      data.postcards[0].message = 'Example note: this is where your coach writes to you.\n\nYou already did the hardest part: you started. Proud of you!';
      data.postcards[1].message = 'Example note from Salo. Keep the hips high and the chin tucked :)';
      data.postcards[2].message = 'Example note. This is where a childhood photo from here goes :)';
      // a stand-in "photo" so the demo shows the blurred teaser of the next card
      data.postcards.forEach(function (c, i) {
        if (i >= 3) c.photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="40" height="30" fill="#8CC3E8"/><rect y="17" width="40" height="13" fill="#2F6E9E"/><rect y="24" width="40" height="6" fill="#E9D6A8"/><circle cx="30" cy="7" r="4" fill="#FFD66B"/><rect x="13" y="13" width="5" height="11" rx="2" fill="#D9534F"/><circle cx="15.5" cy="11" r="2.6" fill="#F2C9A8"/></svg>');
      });
      var rnd = 7;
      function r() { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; }
      var n = 0;
      for (var d = start; !empty && d < t; d = E.addDays(d, 1)) {
        var wd = dateObj(d).getDay();
        if (wd === 2) data.stamps.push({ date: d, type: 'ballet' });
        if (wd === 3 || wd === 0) data.stamps.push({ date: d, type: 'run' });
        if (wd !== 1 && wd !== 5) continue;
        var p = E.plan(E.replay(C.toEngineInput(data)), d);
        var sets = [];
        p.items.forEach(function (it) {
          it.targets.forEach(function (tg, i) {
            var reps = r() < 0.75 ? tg + (r() < 0.3 ? 1 : 0) : Math.max(1, tg - 1);
            sets.push({ slot: it.slot, ex: it.exercise.id, set: i + 1, kg: it.kg === null ? START[it.exercise.id] : it.kg,
              reps: reps, done: true, fb: '' });
          });
        });
        n++;
        C.applyOp(data, { type: 'saveSession', session: { id: 'demo' + n, date: d, day: p.day, minutes: 58 + Math.round(r() * 14),
          effort: 2 + Math.round(r() * 2), note: n === 2 ? 'Machine row was taken, so I waited a bit.' : '', sets: sets } },
        'athlete', d + 'T18:00:00Z');
      }
      if (!empty) data.cheers.push({ id: 'c1', createdAt: nowIso(), text: 'Great week! Friday is Volume day. Go get it.', seenAt: '' });
      if (n) data.reactions.push({ id: 'r1', at: nowIso(), sessionId: 'demo' + n, emoji: '🔥', text: 'Look at that hip thrust >:)', seenAt: '' });
      return data;
    }
    var data = null, SK = 'fl.demo.v5.server';
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
          try {
            var out = window.FlightCore.applyOp(data, op, DEMO_ROLE, nowIso());
            if (out.photo) data.sessions.forEach(function (r) { if (r.id === out.photo.sessionId) r.photo = out.photo.dataUrl; });
          } catch (e) { console.warn('demo op skipped', op.type, e.message); }
        });
        save();
        return new Promise(function (res) { setTimeout(function () { res(state()); }, 250); });
      },
      reset: function (empty) {
        data = null;
        try {
          localStorage.setItem('fl.demoEmpty', empty ? '1' : '0');
          Object.keys(localStorage).forEach(function (k) { if (k.indexOf('fl.demo.') === 0) localStorage.removeItem(k); });
        } catch (e) { /* ignore */ }
      },
      photo: function (id) {
        var row = load().sessions.filter(function (r) { return r.id === id; })[0];
        return row && row.photo ? Promise.resolve(row.photo) : Promise.reject(new Error('no_photo'));
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

  function input() {
    var st = S.state;
    return { settings: st.settings, slots: st.slots, exercises: st.exercises, choices: st.choices, sessions: st.sessions,
      overrides: st.overrides, stamps: st.stamps };
  }
  function calc() { return E.replay(input()); }

  // ---------- sync ----------
  function localApply(op) {
    var st = S.state;
    if (!st) return;
    if (op.type === 'saveSession') {
      var s = op.session;
      st.sessions = st.sessions.filter(function (x) { return x.id !== s.id; });
      st.sessions.push({ id: s.id, date: s.date, day: s.day, minutes: s.minutes, effort: s.effort, note: s.note, savedAt: nowIso(), sets: s.sets });
    } else if (op.type === 'stamp') {
      st.stamps = st.stamps.filter(function (x) { return !(x.date === op.date && x.type === op.stampType); });
      if (op.on) st.stamps.push({ date: op.date, type: op.stampType });
    } else if (op.type === 'deload') {
      if (!st.stamps.some(function (x) { return x.date === op.date && x.type === 'deload'; })) st.stamps.push({ date: op.date, type: 'deload' });
    } else if (op.type === 'photo') {
      st.sessions.forEach(function (x) { if (x.id === op.sessionId) x.photo = true; });
      S.localPhotos = S.localPhotos || {};
      S.localPhotos[op.sessionId] = op.dataUrl;
    } else if (op.type === 'choice') {
      st.choices.push({ at: op.at, slot: op.slot, day: op.day, ex: op.ex });
    } else if (op.type === 'postcardOpened') {
      st.postcards.forEach(function (p) { if (p.id === op.id) p.openedAt = p.openedAt || nowIso(); });
    } else if (op.type === 'profilePhoto') {
      st.settings[role() === 'coach' ? 'coachPhoto' : 'herPhoto'] = op.dataUrl;
    } else if (op.type === 'postcardReply') {
      st.postcards.forEach(function (p) { if (p.id === op.id) { p.replyEmoji = op.emoji; p.replyText = op.text; p.repliedAt = nowIso(); } });
    } else if (op.type === 'cheerSeen') {
      st.cheers.forEach(function (c) { if (c.id === op.id) c.seenAt = c.seenAt || nowIso(); });
    } else if (op.type === 'override') {
      st.overrides.push({ date: todayStr(), ex: op.ex, kg: op.kg });
    } else if (op.type === 'react') {
      st.reactions = st.reactions || [];
      st.reactions.push({ id: 'local' + uid(), at: nowIso(), sessionId: op.sessionId, emoji: op.emoji || '', text: op.text || '', seenAt: '' });
    } else if (op.type === 'reactionSeen') {
      (st.reactions || []).forEach(function (r) { if (r.id === op.id) r.seenAt = r.seenAt || nowIso(); });
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
    var vb = '0 0 ' + M.w + ' ' + M.h;
    if (opts.mini) { // a band around the plane
      var cw = 250, ch = 96;
      var vx = Math.max(0, Math.min(M.w - cw, plane[0] - cw * 0.45)), vy = Math.max(0, Math.min(M.h - ch, plane[1] - ch / 2));
      vb = vx.toFixed(1) + ' ' + vy.toFixed(1) + ' ' + cw + ' ' + ch;
    }
    var h = '<svg viewBox="' + vb + '" role="img" aria-label="Route from Tampere to Luxembourg, ' + km(gameKm) + ' km flown">';
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
    return '<div class="map' + (opts.mini ? ' minimap' : '') + '" id="map">' + h + '</div>';
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
  function who() { return S.state.settings.travellerName || 'Elmo'; }
  function dayName(day) { return S.state.settings[day === 'A' ? 'dayAName' : 'dayBName'] || ('Day ' + day); }
  function exName(id) { var e = S.state.exercises.filter(function (x) { return String(x.id) === id; })[0]; return e ? e.name : id; }
  function completedOn(res, ds) { return res.sessions.filter(function (s) { return s.date === ds && s.completed; }); }
  function nextSessionDate(res) {
    var st = res.settings, t = todayStr(), d = t;
    if (completedOn(res, t).length) d = E.addDays(t, 1);
    if (d < st.startDate) d = st.startDate;
    for (var i = 0; i < 14; i++) {
      if (st.trainingWeekdays.indexOf(E.weekday(d)) >= 0) return d;
      d = E.addDays(d, 1);
    }
    return d;
  }
  function sealedAhead(res) { return S.state.postcards.filter(function (c) { return !c.delivered && c.km > res.cumKm; }); }
  function unopenedMail() { return S.state.postcards.filter(function (c) { return c.delivered && !c.openedAt && !S.seen['pc:' + c.id]; }); }
  function reactionsFor(id) { return (S.state.reactions || []).filter(function (r) { return r.sessionId === id; }); }
  function reactionText(r) { return (r.emoji ? r.emoji + ' ' : '') + (r.text ? '“' + r.text + '”' : ''); }
  function unseenReactions() { return (S.state.reactions || []).filter(function (r) { return !r.seenAt && !S.seen['re:' + r.id]; }); }
  function unseenCheers() { return S.state.cheers.filter(function (c) { return !c.seenAt && !S.seen['ch:' + c.id]; }); }
  function weekStats(res) {
    var st = res.settings, cur = E.weekOf(todayStr(), st.startDate), total = 0, good = 0, thisWeek = 0;
    for (var w = 1; w <= cur; w++) {
      var n = res.sessions.filter(function (s) { return s.completed && s.week === w; }).length;
      if (w === cur) { thisWeek = n; continue; }
      total++;
      if (n >= st.trainingWeekdays.length) good++;
    }
    return { good: good, total: total, thisWeek: thisWeek, perWeek: st.trainingWeekdays.length };
  }
  function setsText(h, unit) {
    var at = h.reps.filter(function (r, i) { return h.kgs[i] === h.kg; });
    var same = at.every(function (r) { return r === at[0]; });
    return (same ? at.length + ' × ' + at[0] : at.join(', ')) + ' at ' + kgFmt(h.kg) + ' ' + (unit || 'kg');
  }
  function rirText(r) {
    if (r === '0') return 'Failure set: 0 in reserve';
    return r + ' in reserve';
  }

  // ---------- small pieces ----------
  function topHTML(title, sub) {
    var me = role() === 'coach' ? 'coach' : 'her';
    return '<header class="top"><div class="who"><h1>' + esc(title) + '</h1><div class="small muted">' + esc(sub) + '</div></div>' +
      '<div class="topr">' + syncHTML() + '<button class="avbtn" data-act="profile" aria-label="Your profile photo">' + avatarHTML(me, 'av-44') + '</button></div></header>';
  }

  // ---------- profile photos ----------
  /** A round profile bubble: the photo from Settings, or the first letter of the name. who = 'coach' | 'her'. */
  function avatarHTML(who, cls) {
    var s = (S.state && S.state.settings) || {}, url = who === 'coach' ? s.coachPhoto : s.herPhoto;
    var name = who === 'coach' ? (s.travellerName || 'Elmo') : (s.herName || '');
    var ini = String(name || '').trim().charAt(0).toUpperCase() || '♥';
    return '<span class="av ' + (cls || '') + (who === 'coach' ? ' av-coach' : ' av-her') + '">' +
      (url ? '<img src="' + esc(url) + '" alt="' + esc(name || 'Profile photo') + '">' : '<span class="ini" aria-hidden="true">' + esc(ini) + '</span>') + '</span>';
  }
  function profileSheet() {
    var me = role() === 'coach' ? 'coach' : 'her', s = S.state.settings, has = !!(me === 'coach' ? s.coachPhoto : s.herPhoto);
    showModal('<h2>' + (me === 'coach' ? 'Your coach photo' : 'Your profile photo') + '</h2>' +
      '<div class="profbig">' + avatarHTML(me, 'av-120') + '</div>' +
      '<p class="small muted" style="text-align:center">' + (me === 'coach' ? 'She sees it next to your cheers, reactions and postcards.' : esc(who()) + ' sees it next to your workouts, notes and replies.') +
      ' Kept in the Sheet, not on the public site.</p>' + (S.avatarBusy ? '<p class="small" style="text-align:center">Preparing the photo…</p>' : '') +
      '<label class="btn wide">' + IC.camera + (has ? 'Change photo' : 'Add a photo') + '<input type="file" accept="image/*" id="avatarIn" hidden></label>' +
      (has ? '<button class="linkbtn discard" data-act="avatarRemove">Remove the photo</button>' : '') +
      '<div class="row"><button class="btn ghost" data-act="closeModal">Done</button></div>');
  }
  /** Square, centred (a bit above centre on tall photos, where faces are), 200 px JPEG on the app's soft blue. */
  function prepareAvatar(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = reject;
      rd.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
          var sx = (w - side) / 2, sy = h > w ? Math.max(0, (h - side) * 0.3) : 0;
          var c = document.createElement('canvas'); c.width = c.height = 200;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#E3EAFD'; ctx.fillRect(0, 0, 200, 200);   // under transparent PNGs
          ctx.drawImage(img, sx, sy, side, side, 0, 0, 200, 200);
          var q = 0.86, url = c.toDataURL('image/jpeg', q);
          while (url.length > 45000 && q > 0.4) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
          resolve(url);
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  function demoEmpty() { try { return localStorage.getItem('fl.demoEmpty') === '1'; } catch (e) { return false; } }
  function flightSub() { return 'Flight ' + (S.state.settings.flightNo || 'AY 1697') + ', Tampere to Luxembourg'; }

  function routeBar(cum, routeKm) {
    var pct = Math.min(100, cum / routeKm * 100);
    return '<div class="routebar" aria-hidden="true"><span class="fill" style="width:' + pct.toFixed(1) + '%"></span>' +
      '<span class="pl" style="left:' + pct.toFixed(1) + '%">' + IC.plane + '</span></div>';
  }

  function flightlineHTML(res) {
    var st = res.settings;
    var eta = E.eta(res, todayStr(), completedOn(res, todayStr()).length > 0);
    var left = Math.max(0, st.routeKm - res.cumKm);
    var h = '<div class="flightline"><div><div class="big">' + km(res.cumKm) + '<small>of ' + km(st.routeKm) + ' km</small></div></div>';
    if (eta.landed) h += '<div class="eta muted small">Unlocked<b>' + fmtDate(eta.date) + '</b></div>';
    else h += '<div class="eta muted small">Landing<b>' + fmtDate(eta.date) + '</b><span class="est">(Estimated completion)</span>about ' + plural(eta.sessionsLeft, 'workout', 'workouts') + ' to go</div>';
    h += '</div><div class="progress"><span style="width:' + Math.min(100, res.cumKm / st.routeKm * 100).toFixed(1) + '%"></span></div>';
    h += eta.landed ? '<p class="unlocked">Flight unlocked ✈ ' + esc(who()) + ' to LUX</p>'
      : '<p class="nextcard"><b>' + km(left) + ' km</b> for ' + esc(who()) + ' to Luxembourg.</p>';
    var next = sealedAhead(res)[0];
    if (next && !eta.landed) {
      var line = 'Next postcard from <b>' + esc(next.from) + '</b> in <b>' + km(next.km - res.cumKm) + ' km</b> ;)';
      h += next.teaser
        ? '<div class="teaser"><span class="teaser-pic" aria-hidden="true"><img src="' + esc(next.teaser) + '" alt=""></span><p class="nextcard">' + line + '<span class="small muted">There\'s a photo inside. No peeking ;)</span></p></div>'
        : '<p class="nextcard">' + line + '</p>';
    }
    return h;
  }

  function weekStrip(res) {
    var st = res.settings, t = todayStr();
    var dow = (dateObj(t).getDay() + 6) % 7, monday = E.addDays(t, -dow);
    var h = '<section class="panel"><div class="weekhead"><h3>This week</h3><button class="streakchip" data-act="tab" data-v="log">' + esc(streakText(weekStreak(res))) + '</button></div><div class="week">';
    for (var i = 0; i < 7; i++) {
      var d = E.addDays(monday, i), wd = E.weekday(d), ti = st.trainingWeekdays.indexOf(wd);
      var done = completedOn(res, d).length > 0, marks = '';
      if (S.state.stamps.some(function (s) { return s.date === d && s.type === 'ballet'; })) marks += '<i class="mk ballet">' + IC.ballet + '</i>';
      if (S.state.stamps.some(function (s) { return s.date === d && s.type === 'run'; })) marks += '<i class="mk run">' + IC.run + '</i>';
      var label = ti === 0 ? dayName('A') : ti === 1 ? dayName('B') : '';
      h += '<button class="day' + (ti >= 0 ? ' plan' : '') + (done ? ' done' : '') + (d === t ? ' today' : '') + '" data-act="day" data-date="' + d +
        '" aria-label="' + esc(fmtLong(d) + (label ? ', ' + label : '')) + '"><span class="d">' +
        dateObj(d).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2) + '</span><span class="n">' + dateObj(d).getDate() + '</span>' +
        (ti >= 0 || done ? '<i class="mk db">' + IC.dumbbell + '</i>' : '') + (label ? '<span class="lbl">' + esc(label) + '</span>' : '') +
        '<span class="marks">' + marks + '</span></button>';
    }
    h += '</div><div class="legend"><span><i class="mk db">' + IC.dumbbell + '</i>Gym</span><span><i class="mk ballet">' + IC.ballet +
      '</i>Ballet</span><span><i class="mk run">' + IC.run + '</i>Run</span><span>Tap a day to add ballet or a run</span></div></section>';
    return h;
  }

  // ---------- muscle figures ----------
  // A small body figure with the trained muscle highlighted. Back-view figures have a spine line.
  var MUSCLES = {
    'chest': { back: false, parts: ['<rect x="7.7" y="9.2" width="4.1" height="3.6" rx="1.3"/><rect x="12.2" y="9.2" width="4.1" height="3.6" rx="1.3"/>',
      '<circle cx="6.9" cy="9.6" r="1.6"/><circle cx="17.1" cy="9.6" r="1.6"/>'] },
    'side-delts': { back: false, parts: ['<circle cx="6.6" cy="9.4" r="2.1"/><circle cx="17.4" cy="9.4" r="2.1"/>'] },
    'abs': { back: false, parts: ['<rect x="9.3" y="13.2" width="5.4" height="5.8" rx="1.4"/>'] },
    'biceps': { back: false, parts: ['<rect x="3.8" y="10" width="2.8" height="4.6" rx="1.3"/><rect x="17.4" y="10" width="2.8" height="4.6" rx="1.3"/>'] },
    'upper-back': { back: true, parts: ['<rect x="7.8" y="8.8" width="8.4" height="4.8" rx="1.6"/>'] },
    'lats': { back: true, parts: ['<path d="M7.4 10.5 L10.6 12 L10.2 17.5 L7.6 16.4 Z"/><path d="M16.6 10.5 L13.4 12 L13.8 17.5 L16.4 16.4 Z"/>'] },
    'triceps': { back: true, parts: ['<rect x="3.8" y="10" width="2.8" height="4.6" rx="1.3"/><rect x="17.4" y="10" width="2.8" height="4.6" rx="1.3"/>'] },
    'glutes': { back: true, parts: ['<rect x="7.6" y="18.2" width="4.2" height="4.4" rx="1.8"/><rect x="12.2" y="18.2" width="4.2" height="4.4" rx="1.8"/>'] }
  };
  function muscleSVG(slotKey, label) {
    var m = MUSCLES[slotKey];
    if (!m) return '';
    return '<svg class="muscle" viewBox="0 0 24 32" role="img" aria-label="' + esc(label || slotKey) + '"><g class="body">' +
      '<circle cx="12" cy="4.2" r="2.9"/><rect x="7" y="8" width="10" height="11.5" rx="2.6"/>' +
      '<rect x="3.6" y="8.6" width="3.2" height="11" rx="1.6"/><rect x="17.2" y="8.6" width="3.2" height="11" rx="1.6"/>' +
      '<rect x="7.4" y="18.5" width="4.3" height="12" rx="2"/><rect x="12.3" y="18.5" width="4.3" height="12" rx="2"/></g>' +
      (m.back ? '<path class="spine" d="M12 8.6V18"/>' : '') + '<g class="hit">' + m.parts.join('') + '</g></svg>';
  }

  // ---------- streak and calendar ----------
  function mondayOf(ds) { return E.addDays(ds, -((dateObj(ds).getDay() + 6) % 7)); }
  /** Weeks in a row with every planned workout done. The current week only adds once it is full, and never breaks the streak. */
  function weekStreak(res) {
    var st = res.settings, per = st.trainingWeekdays.length, thisMon = mondayOf(todayStr()), count = {}, first = mondayOf(st.startDate);
    res.sessions.forEach(function (s) {
      if (!s.completed) return;
      var m = mondayOf(s.date); count[m] = (count[m] || 0) + 1;
      if (m < first) first = m;
    });
    var run = 0, best = 0;
    for (var m = first; m <= thisMon; m = E.addDays(m, 7)) {
      if ((count[m] || 0) >= per) run++;
      else if (m !== thisMon) run = 0;
      if (run > best) best = run;
    }
    return { current: run, best: best, thisWeek: count[thisMon] || 0, per: per, started: todayStr() >= st.startDate || res.sessions.length > 0 };
  }
  function streakText(sk) {
    if (sk.current > 0) return '🔥 ' + plural(sk.current, 'week', 'weeks') + ' in a row';
    return sk.thisWeek > 0 ? '🔥 ' + sk.thisWeek + ' of ' + sk.per + ' this week' : '🔥 Start streak this week';
  }
  function calendarHTML(res) {
    var t = todayStr(), st0 = res.settings, base = S.calMonth || t.slice(0, 7);
    var y = +base.slice(0, 4), mo = +base.slice(5, 7);
    var first = base + '-01', days = new Date(y, mo, 0).getDate(), lead = (dateObj(first).getDay() + 6) % 7;
    var gym = {}, n = { gym: 0, planned: 0, ballet: 0, run: 0 };
    res.sessions.forEach(function (s) { if (s.completed && s.date.slice(0, 7) === base) { if (!gym[s.date]) n.gym++; gym[s.date] = s.day; } });
    var stamps = {};
    S.state.stamps.forEach(function (s) {
      if ((s.type === 'ballet' || s.type === 'run') && s.date.slice(0, 7) === base) { (stamps[s.date] = stamps[s.date] || {})[s.type] = 1; n[s.type]++; }
    });
    var prev = mo === 1 ? (y - 1) + '-12' : y + '-' + pad(mo - 1), next = mo === 12 ? (y + 1) + '-01' : y + '-' + pad(mo + 1);
    var title = dateObj(first).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    var h = '<section class="panel cal"><div class="calhead"><button class="ib" data-act="calMonth" data-m="' + prev + '" aria-label="Previous month">‹</button><h3>' + esc(title) + '</h3>' +
      '<button class="ib" data-act="calMonth" data-m="' + next + '" aria-label="Next month">›</button></div><div class="calgrid">';
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function (d) { h += '<span class="dow">' + d + '</span>'; });
    for (var i = 0; i < lead; i++) h += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var ds = base + '-' + pad(d), g = gym[ds], stp = stamps[ds] || {};
      var ti = st0.trainingWeekdays.indexOf(E.weekday(ds));
      var planned = !g && ti >= 0 && ds >= t && ds >= st0.startDate;
      if (planned) n.planned++;
      var state = g ? IC.goldCheck : planned ? IC.dbOutline : '';
      h += '<button class="cd' + (g ? ' gym' : planned ? ' planned' : '') + (ds === t ? ' today' : '') + (ds > t ? ' future' : '') + '" data-act="day" data-date="' + ds + '" aria-label="' +
        esc(fmtLong(ds) + (g ? ', ' + dayName(g) + ' workout done' : planned ? ', ' + dayName(ti === 0 ? 'A' : 'B') + ' workout planned' : '') + (stp.ballet ? ', ballet' : '') + (stp.run ? ', run' : '')) +
        '"><span class="dn">' + d + '</span><span class="st">' + state + '</span><span class="marks">' +
        (stp.ballet ? '<i class="mk ballet">' + IC.ballet + '</i>' : '') + (stp.run ? '<i class="mk run">' + IC.run + '</i>' : '') + '</span></button>';
    }
    h += '</div><div class="legend"><span>' + IC.goldCheck + plural(n.gym, 'workout', 'workouts') + '</span>' +
      (n.planned ? '<span>' + IC.dbOutline + n.planned + ' planned</span>' : '') +
      '<span><i class="mk ballet">' + IC.ballet + '</i>' + n.ballet + ' ballet</span><span><i class="mk run">' + IC.run + '</i>' + plural(n.run, 'run', 'runs') + '</span></div>' +
      '<p class="small muted calhint">Tap a day to see its workout and reactions.</p></section>';
    return h;
  }
  function streakHTML(res) {
    var sk = weekStreak(res);
    var dots = '';
    for (var i = 0; i < sk.per; i++) dots += '<i class="' + (i < sk.thisWeek ? 'on' : '') + '"></i>';
    return '<section class="panel streak"><div class="flame">🔥</div><div><div class="big">' + sk.current + '<small>' + (sk.current === 1 ? 'week' : 'weeks') + ' in a row</small></div>' +
      '<div class="small muted">' + (sk.current ? 'Every planned workout done, week after week.' : 'Do both workouts this week to start your streak.') +
      (sk.best > sk.current ? ' Best: ' + plural(sk.best, 'week', 'weeks') + '.' : '') + '</div>' +
      '<div class="wk small"><span class="dots">' + dots + '</span>This week ' + sk.thisWeek + ' of ' + sk.per + '</div></div></section>';
  }

  function estMinutes(res, day, p) {
    var m = res.sessions.filter(function (s) { return s.day === day && s.minutes && s.mode === 'normal'; }).slice(-4).map(function (s) { return s.minutes; });
    if (m.length) return Math.round(m.reduce(function (a, b) { return a + b; }, 0) / m.length / 5) * 5;
    return Math.max(20, Math.round(p.setsTotal * 3.2 / 5) * 5);
  }

  // ---------- train (home) ----------
  function heroHTML(res) {
    var t = todayStr();
    if (S.draft) {
      return '<section class="hero"><div class="kicker">Workout in progress</div><h2>' + esc(dayName(S.draft.day)) + '</h2><div class="meta">Started ' +
        new Date(S.draft.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
        '<button class="btn taxi wide" data-act="resume">Resume workout</button><button class="linkbtn discard" data-act="discard">Discard it</button></section>';
    }
    var nd = nextSessionDate(res), day = E.nextDay(res), p = E.plan(res, nd, day);
    var mode = p.mode === 'intro' ? 'Intro week' : p.mode === 'back' ? 'Welcome back' : p.mode === 'deload' ? 'Easier week' : '';
    var h = '<section class="hero"><div class="kicker">' + (nd === t ? 'Today' : 'Next workout, ' + esc(fmtLong(nd))) + (mode ? '<span class="pill">' + mode + '</span>' : '') + '</div>' +
      '<h2>' + esc(dayName(day)) + '</h2><div class="meta">' + plural(p.items.length, 'exercise', 'exercises') + ' · ' + p.setsTotal + ' sets · about ' + estMinutes(res, day, p) + ' min</div>' +
      '<div class="muscles">' + p.items.map(function (it) { return '<span title="' + esc(it.muscle) + '">' + muscleSVG(it.slot, it.muscle) + '</span>'; }).join('') + '</div>' +
      '<button class="btn taxi wide" data-act="board">' + (nd === t ? 'Let\'s go' : 'See workout') + '</button></section>';
    return h;
  }
  function miniFlight(res) {
    var st = res.settings, eta = E.eta(res, todayStr(), completedOn(res, todayStr()).length > 0);
    var h = '<section class="miniflight"><button class="fline" data-act="tab" data-v="trip"><span><b>' + km(res.cumKm) + '</b> of ' + km(st.routeKm) + ' km</span><span class="muted">' +
      (eta.landed ? 'Landed ✈' : 'Landing ' + esc(fmtDate(eta.date)) + '<small class="est">(Estimated completion)</small>') + '</span></button>' +
      '<div class="progress"><span style="width:' + Math.min(100, res.cumKm / st.routeKm * 100).toFixed(1) + '%"></span></div>';
    var next = sealedAhead(res)[0];
    if (next && !eta.landed) h += '<p class="nextcard small">Next postcard from <b>' + esc(next.from) + '</b> in <b>' + km(next.km - res.cumKm) + ' km</b> ;)</p>';
    h += '<button class="mapbtn" data-act="mapToggle" aria-expanded="' + (S.mapOpen ? 'true' : 'false') + '" aria-label="' + (S.mapOpen ? 'Shrink the map' : 'Show the whole map') + '">' +
      mapSVG(res.cumKm, { mini: !S.mapOpen }) + '<span class="maphint">' + (S.mapOpen ? 'Shrink' : 'Whole map') + '</span></button>';
    return h + '</section>';
  }

  function viewHome() {
    var res = calc(), t = todayStr(), coach = role() === 'coach';
    var h = '<div class="screen">' + topHTML(coach ? 'Her view' : 'Hello, love!<3', fmtLong(t));
    if (!coach) h += heroHTML(res);
    var mail = coach ? [] : unopenedMail();
    if (mail.length) {
      h += '<button class="banner mail" data-act="postcard" data-id="' + esc(mail[0].id) + '">' + IC.envelope + '<p><b>' +
        (mail.length > 1 ? plural(mail.length, 'postcard', 'postcards') + ' waiting ;)' : 'You have mail from ' + esc(mail[0].from) + ' ;)') +
        '</b>Tap to open.</p></button>';
    }
    (coach ? [] : unseenCheers().slice(-1)).forEach(function (c) {
      h += '<button class="banner" data-act="cheerSeen" data-id="' + esc(c.id) + '">' + avatarHTML('coach', 'av-44') + '<p><b>' + esc(c.text) + '</b>From hubby :) Tap to dismiss.</p></button>';
    });
    (coach ? [] : unseenReactions().slice(-1)).forEach(function (r) {
      var s = res.sessions.filter(function (x) { return x.id === r.sessionId; })[0];
      h += '<button class="banner react" data-act="reactionSeen" data-id="' + esc(r.id) + '"><span class="avwrap">' + avatarHTML('coach', 'av-44') + '<i class="avbadge">' + esc(r.emoji || '💬') + '</i></span><p><b>' +
        esc(who()) + ' reacted to your ' + esc(s ? dayName(s.day) + ' workout, ' + fmtDate(s.date) : 'workout') + '</b>' +
        (r.text ? '“' + esc(r.text) + '”<br>' : '') + '<span class="small muted">Tap to dismiss.</span></p></button>';
    });
    var lastId = res.sessions.length ? res.sessions[res.sessions.length - 1].id : '';
    if (!coach && res.fatigue.offer && !S.seen['fat:' + lastId] && !S.draft) {
      h += '<section class="panel offer"><h3>Take easier week?</h3><p class="small">Few lifts have dipped over the last two weeks. ' +
        'An easier week has half the sets with 3–4 reps in reserve, then you\'re back to your best weights.</p>' +
        '<div class="row2"><button class="btn small taxi" data-act="deload">Take an easier week</button><button class="btn small ghost" data-act="fatigueLater" data-id="' + esc(lastId) + '">Not now</button></div></section>';
    }
    if (coach) h += heroHTML(res);
    h += weekStrip(res) + miniFlight(res) + '</div>';
    return h;
  }

  // ---------- flight (map and postcards) ----------
  function postcardBox() {
    var cards = S.state.postcards, got = cards.filter(function (c) { return c.delivered; });
    var h = '<div class="section-h"><h2>Postcard box</h2><span class="small muted">' + got.length + ' of ' + cards.length + '</span></div><div class="box">';
    cards.forEach(function (c) {
      if (c.delivered) h += '<button class="thumb" data-act="postcard" data-id="' + esc(c.id) + '">' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="" loading="lazy">' : frontArt(c, true)) + '<span>' + esc(c.place) + '</span>' +
        (c.replyEmoji || c.replyText ? '<i class="rbadge" aria-label="Replied">' + esc(c.replyEmoji || '💬') + '</i>' : '') + '</button>';
      else h += '<div class="thumb sealed">Sealed ;)<br>' + km(c.km) + ' km</div>';
    });
    return h + '</div>';
  }
  function viewTrip() {
    var res = calc(), coach = role() === 'coach';
    var h = '<div class="screen">' + topHTML('TMP → LUX', flightSub()) + mapSVG(res.cumKm) + flightlineHTML(res);
    var mail = coach ? [] : unopenedMail();
    if (mail.length) {
      h += '<button class="banner mail" data-act="postcard" data-id="' + esc(mail[0].id) + '">' + IC.envelope + '<p><b>' +
        (mail.length > 1 ? plural(mail.length, 'postcard', 'postcards') + ' waiting ;)' : 'You have mail from ' + esc(mail[0].from) + ' ;)') + '</b>Tap to open.</p></button>';
    }
    return h + postcardBox() + '</div>';
  }

  // ---------- boarding pass (today's workout before starting) ----------
  function itemLine(it) {
    if (it.taxi) return it.sets + ' × ' + it.targets[0] + ', find your weight';
    var same = it.targets.every(function (x) { return x === it.targets[0]; });
    return (same ? it.sets + ' × ' + it.targets[0] : it.targets.join(', ')) + ' at ' + kgFmt(it.kg) + ' ' + it.exercise.kgLabel;
  }

  function viewBoard() {
    var res = calc(), t = todayStr();
    var day = S.boardDay || E.nextDay(res);
    var p = E.plan(res, t, day);
    var h = '<div class="screen"><header class="top"><button class="linkbtn backlink" data-act="home">' + IC.back + 'Home</button>' + syncHTML() + '</header>';
    h += '<h1 class="todayh">Today: ' + esc(dayName(day)) + '</h1><div class="small muted">' + plural(p.items.length, 'exercise', 'exercises') + ', ' + p.setsTotal + ' sets</div>';
    if (p.mode === 'intro') h += '<div class="note">Intro week: one set fewer and 2–3 reps in reserve while you learn the movements :)</div>';
    if (p.mode === 'back') h += '<div class="note">Welcome back :) First workout after a break: one set fewer and 2–3 reps in reserve. Back to normal next time.</div>';
    if (p.mode === 'deload') h += '<div class="note">Easier week: half the sets, 3–4 reps in reserve, same weights. Recovery is part of the flight ;)</div>';
    h += '<p class="small muted choicehint">Pick one exercise per muscle. Stick with the same choice for at least a few weeks so your progress shows.</p>';
    var sn = 0;
    p.blocks.forEach(function (b) {
      var paired = b.items.length > 1;
      if (paired) sn++;
      h += '<section class="pblock' + (paired ? ' paired' : '') + '">' +
        (paired ? '<div class="pairlbl">Superset ' + sn + ': ' + b.items.map(function (it) { return esc(it.muscle); }).join(' + ') + '<span>back to back, then rest</span></div>' : '');
      b.items.forEach(function (it, k) {
        h += '<div class="prow">' + (paired ? '<span class="letter">' + 'AB'.charAt(k) + '</span>' : '') + '<span class="mi">' + muscleSVG(it.slot, it.muscle) + '</span>' +
          '<div><div class="small muted">' + esc(it.muscle) + '</div><b>' + esc(it.exercise.name) + '</b>' +
          '<div class="small">' + esc(itemLine(it)) + '</div></div>' +
          (it.options.length > 1 ? '<button class="linkbtn" data-act="choose" data-slot="' + esc(it.slot) + '" data-ctx="pass" data-day="' + day + '">Change</button>' : '') + '</div>';
      });
      h += '</section>';
    });
    h += '<div class="daypick"><button class="chip' + (day === 'A' ? ' on' : '') + '" data-act="boardDay" data-day="A">' + esc(dayName('A')) + '</button>' +
      '<button class="chip' + (day === 'B' ? ' on' : '') + '" data-act="boardDay" data-day="B">' + esc(dayName('B')) + '</button></div>' +
      '<div style="margin-top:16px"><button class="btn taxi wide" data-act="start" data-day="' + day + '">Start workout</button></div></div>';
    return h;
  }

  // ---------- the workout ----------
  function defaultKg(e) {
    if (e.startKg !== null && e.startKg !== undefined) return e.startKg;
    if (e.assisted) return 30;
    return /hand|side/.test(e.kgLabel) ? 4 : 20;
  }
  function itemFromPlan(it) {
    var e = it.exercise;
    return { slot: it.slot, muscle: it.muscle, ex: e.id, name: e.name, kgLabel: e.kgLabel, step: e.stepKg || 1, assisted: e.assisted,
      cue: e.cue, video: e.video, min: it.min, max: it.max, rest: it.rest, pair: it.pair, calibrate: it.calibrate, taxi: it.taxi,
      estimated: it.estimated, upSteps: it.upSteps, down: it.down, held: it.held, overridden: it.overridden, lastKg: it.lastKg, lastReps: it.lastReps,
      options: it.options.length, oneOff: false };
  }
  function setsFromPlan(it) {
    var kg = it.kg === null ? defaultKg(it.exercise) : it.kg, out = [];
    for (var i = 0; i < it.sets; i++) out.push({ slot: it.slot, ex: it.exercise.id, set: i + 1, kg: kg, reps: it.targets[i], target: it.targets[i],
      rir: it.rir[i], calib: it.calibrate && i === it.sets - 1, done: false, fb: '', skip: false });
    return out;
  }

  function startFlight(day) {
    var res = calc(), t = todayStr(), p = E.plan(res, t, day);
    var d = { id: t + '-' + uid(), date: t, day: day, mode: p.mode, startedAt: Date.now(), items: {}, sets: [], undo: [],
      fbFor: null, lower: null, view: null, timeOffer: false,
      blocks: p.blocks.map(function (b, i) { return { id: 'b' + i, slots: b.items.map(function (x) { return x.slot; }), paired: b.items.length > 1, separated: false }; }) };
    p.items.forEach(function (it) { d.items[it.slot] = itemFromPlan(it); d.sets = d.sets.concat(setsFromPlan(it)); });
    S.draft = d;
    store.set('draft', d);
    S.view = 'flight';
    keepAwake(); unlockAudio(); render(); window.scrollTo(0, 0);
  }

  function blockIndexOfSlot(d, slot) { for (var i = 0; i < d.blocks.length; i++) if (d.blocks[i].slots.indexOf(slot) >= 0) return i; return -1; }
  function blockOrder(d, b) {
    var per = b.slots.map(function (k) {
      return d.sets.map(function (s, i) { return i; }).filter(function (i) { return d.sets[i].slot === k; });
    });
    var idx = [];
    if (b.paired && !b.separated) {
      var rounds = Math.max.apply(null, per.map(function (a) { return a.length; }));
      for (var r = 0; r < rounds; r++) per.forEach(function (a) { if (a[r] !== undefined) idx.push(a[r]); });
    } else per.forEach(function (a) { idx = idx.concat(a); });
    return idx;
  }
  function stepOrder(d) { var idx = []; d.blocks.forEach(function (b) { idx = idx.concat(blockOrder(d, b)); }); return idx; }
  function nextStep(d) {
    var o = stepOrder(d);
    for (var i = 0; i < o.length; i++) if (!d.sets[o[i]].done && !d.sets[o[i]].skip) return o[i];
    return undefined;
  }
  function open(s) { return !s.done && !s.skip; }
  function accessoryOpen(d) {
    return d.blocks.some(function (b) { return b.paired && b.slots.some(function (k) { return d.sets.some(function (s) { return s.slot === k && open(s); }); }); });
  }
  function elapsedMin() { return S.draft ? (Date.now() - S.draft.startedAt) / 60000 : 0; }
  function elapsed() {
    if (!S.draft) return '';
    var s = Math.floor((Date.now() - S.draft.startedAt) / 1000);
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  function draftSession() {
    var d = S.draft;
    var end = d.finishedAt || Date.now();
    return { id: d.id, date: d.date, day: d.day, minutes: Math.max(1, Math.round((end - d.startedAt) / 60000)), effort: d.effort || null, note: d.note || '',
      sets: d.sets.map(function (s) { return { slot: s.slot, ex: s.ex, set: s.set, kg: Number(s.kg) || 0, reps: Number(s.reps) || 0, done: !!s.done, fb: s.fb || '', skip: !!s.skip,
        rir: s.rir || '', target: Number(s.target) || 0 }; }) };
  }
  function preview() { return E.previewSession(input(), draftSession()); }

  function stepper(i, field, val, label, disabled) {
    var dis = disabled ? ' disabled' : '';
    return '<div class="stepper"><button data-act="inc" data-i="' + i + '" data-f="' + field + '" data-d="-1" aria-label="Less ' + field + '"' + dis + '>−</button>' +
      '<label><input inputmode="decimal" type="number" step="any" min="0" data-i="' + i + '" data-f="' + field + '" value="' + esc(val) + '" aria-label="' + field + '"' + dis + '>' +
      '<small>' + esc(label) + '</small></label><button data-act="inc" data-i="' + i + '" data-f="' + field + '" data-d="1" aria-label="More ' + field + '"' + dis + '>+</button></div>';
  }

  function exHead(it, single, d) {
    var anyDone = d.sets.some(function (s) { return s.slot === it.slot && s.done; });
    var h = single ? '<h1>' + esc(it.name) + '</h1>' : '<h2 class="exname">' + esc(it.name) + '</h2>';
    h += '<div class="tags">';
    if (it.oneOff) h += '<span class="tag">Just for today</span>';
    if (it.upSteps && !it.oneOff) h += '<span class="tag up">Heavier today >:)</span>';
    if (it.down && !it.oneOff) h += '<span class="tag">Lighter today, so you hit the reps</span>';
    if (it.held && !it.oneOff) h += '<span class="tag">Same weight again, it gets easier</span>';
    if (it.estimated) h += '<span class="tag">Estimated from your ' + esc(dayName(d.day === 'A' ? 'B' : 'A')) + ' day</span>';
    if (it.overridden) h += '<span class="tag">Weight set by your coach</span>';
    if (it.lastReps && it.lastKg !== null && it.lastKg !== undefined && !it.upSteps) h += '<span class="tag">Last time ' + it.lastReps.join(', ') + ' at ' + kgFmt(it.lastKg) + ' kg</span>';
    h += '</div>';
    if (it.cue) h += '<p class="cue">' + esc(it.cue) + '</p>';
    h += '<div class="exlinks">' + (it.video ? '<a class="linkbtn" href="' + esc(it.video) + '" target="_blank" rel="noopener">Watch the form</a>' : '') +
      (it.options > 1 && !anyDone ? '<button class="linkbtn" data-act="choose" data-slot="' + esc(it.slot) + '" data-ctx="flight">Change exercise</button>' : '') + '</div>';
    return h;
  }

  function viewFlight() {
    var d = S.draft, next = nextStep(d);
    var bi = d.view !== null && d.view !== undefined ? d.view : (next !== undefined ? blockIndexOfSlot(d, d.sets[next].slot) : d.blocks.length - 1);
    var b = d.blocks[bi], order = blockOrder(d, b);
    var pv = preview(), c = pv.session, st = pv.result.settings, left = Math.max(0, st.routeKm - c.cumKm);

    var h = '<div class="flightview"><div class="flightbar"><button class="linkbtn" data-act="home" aria-label="Back to home" style="color:var(--ink);padding:4px">' + IC.close + '</button><div class="dots">';
    d.blocks.forEach(function (x, j) {
      var sets = d.sets.filter(function (s) { return x.slots.indexOf(s.slot) >= 0; });
      var all = sets.every(function (s) { return !open(s); });
      h += '<i class="' + (j === bi ? 'cur' : all ? 'done' : '') + '"></i>';
    });
    h += '</div><span class="clock" id="clock">' + elapsed() + '</span></div>';

    h += '<div class="strip">' + routeBar(c.cumKm, st.routeKm) + '<div class="striptext"><span><b>+' + kgFmt(c.km) + ' km</b> this workout, ' + c.reps + ' reps</span></div></div>';

    if (elapsedMin() >= 68 && !d.timeOffer && accessoryOpen(d)) {
      h += '<section class="offer inline"><b>' + Math.round(elapsedMin()) + ' minutes in :)</b> Finish with one last accessory round, or skip the rest?' +
        '<div class="row2"><button class="btn small" data-act="lastRound">One last round</button><button class="btn small ghost" data-act="skipRest">Skip the rest</button>' +
        '<button class="linkbtn" data-act="timeLater">Keep going</button></div></section>';
    }

    var its = b.slots.map(function (k) { return d.items[k]; });
    var rounds = Math.max.apply(null, its.map(function (it) { return d.sets.filter(function (s) { return s.slot === it.slot; }).length; }));
    var curRound = next !== undefined && b.slots.indexOf(d.sets[next].slot) >= 0 ? d.sets[next].set : null;
    h += '<div class="exhead"><div class="small muted">' + (b.paired ? 'Superset: ' + its.map(function (it) { return esc(it.muscle); }).join(' + ') : esc(its[0].muscle)) +
      ', ' + esc(dayName(d.day)) + (curRound ? '. Round ' + curRound + ' of ' + rounds : '') + (b.separated ? ' (split)' : '') + '</div>';
    if (b.paired) its.forEach(function (it, k) { h += '<div class="pairex"><span class="letter">' + 'AB'.charAt(k) + '</span><div>' + exHead(it, false, d) + '</div></div>'; });
    else h += exHead(its[0], true, d);
    h += '</div>';

    var curBi = next !== undefined ? blockIndexOfSlot(d, d.sets[next].slot) : -1;
    if (d.view !== null && d.view !== undefined && next !== undefined && d.view !== curBi) {
      h += '<div class="finishrow">' + (blockOpen(d, bi) ? '<button class="btn small" data-act="doNow" data-i="' + bi + '">Do this one now</button> ' : '') +
        '<button class="btn small ghost" data-act="toCurrent">Back to the current exercise</button></div>';
    } else if (bi === curBi && lastOpenBlock(d) > bi) {
      h += '<div class="finishrow"><button class="linkbtn" data-act="doLater" data-i="' + bi + '">Machine busy? Do this later</button></div>';
    }

    h += '<div class="sets">';
    order.forEach(function (i) {
      var s = d.sets[i], it = d.items[s.slot], k = b.slots.indexOf(s.slot);
      var cls = 'setrow' + (s.done ? ' done' : '') + (s.skip ? ' skipped' : '') + (i === next ? ' cur' : '');
      var label = s.set + (b.paired ? 'AB'.charAt(k) : '');
      h += '<div class="' + cls + '"><span class="no">' + label + '</span>' +
        stepper(i, 'kg', s.kg, it.kgLabel, s.skip) + stepper(i, 'reps', s.reps, 'reps, goal ' + s.target, s.skip) +
        '<button class="check" data-act="confirm" data-i="' + i + '" aria-label="Confirm set ' + label + '"' + (i === next ? '' : ' disabled') + '>' + IC.check + '</button></div>';
      var notes = [];
      if (b.paired) notes.push(esc(it.name));
      if (s.skip) notes.push('Skipped');
      else notes.push(esc(rirText(s.rir)));
      if (i === next && s.rir === '0') notes.push('Finish the last rep you can do with your usual form and range');
      if (i === next && s.calib) notes.push('Last set: if it moves well, keep going past the goal and log every clean rep');
      h += '<div class="rirline">' + notes.join('. ') + '</div>';
      if (d.fbFor === i) {
        h += '<div class="fb"><span class="small muted">How was that set?</span>' + [['easy', 'Too easy'], ['ok', 'Just right'], ['hard', 'Too hard']].map(function (f) {
          return '<button class="chip' + (s.fb === f[0] ? ' on' : '') + '" data-act="fb" data-i="' + i + '" data-v="' + f[0] + '">' + f[1] + '</button>';
        }).join('') + '</div>';
      }
      if (d.lower && d.lower.after === i) {
        h += '<div class="offer inline">That was below ' + it.min + ' reps. Lower to <b>' + kgFmt(d.lower.kg) + ' kg</b> for the remaining sets?' +
          '<div class="row2"><button class="btn small" data-act="lower">Lower the weight</button><button class="btn small ghost" data-act="keepWeight">Keep it</button></div></div>';
      }
    });
    h += '</div>';

    h += '<div class="navrow"><button class="btn ghost" data-act="undo"' + (d.undo.length ? '' : ' disabled') + '>' + IC.undo + 'Undo last set</button>' +
      '<button class="btn ghost" data-act="overview">' + IC.list + 'Overview</button></div>';
    h += '<div class="finishrow"><button class="btn ' + (next === undefined ? 'taxi wide' : 'ghost wide') + '" data-act="finish">Finish workout</button>' +
      '<button class="linkbtn discard" data-act="discard">Discard this workout</button></div></div>';
    return h;
  }

  function confirmSet(i) {
    var d = S.draft;
    if (i !== nextStep(d)) return; // sequence is enforced here, not only by the disabled button
    var s = d.sets[i], it = d.items[s.slot];
    s.done = true; s.doneAt = Date.now();
    d.undo.push(i); d.fbFor = i; d.view = null; d.lower = null;
    var rest = d.sets.filter(function (x) { return x.slot === s.slot && open(x); });
    if (!it.taxi && Number(s.reps) < it.min && rest.length) {
      var lk = it.assisted ? Number(s.kg) + it.step : Math.max(0, Number(s.kg) - it.step);
      d.lower = { slot: s.slot, kg: Math.round(lk * 100) / 100, after: i };
    }
    var n = nextStep(d);
    if (n === undefined) stopRest();
    else {
      var cb = d.blocks[blockIndexOfSlot(d, s.slot)], ns = d.sets[n];
      if (cb.paired && !cb.separated && cb.slots.indexOf(ns.slot) >= 0 && ns.set === s.set) startRest(30, 'Switch', d.items[ns.slot].name);
      else startRest(it.rest || 90, 'Rest', 'Next: ' + d.items[ns.slot].name + ', ' + ns.reps + ' reps at ' + kgFmt(ns.kg) + ' kg');
    }
    store.set('draft', d);
  }

  // ---------- after the workout ----------
  function viewLanding() {
    var pv = preview(), c = pv.session, d = S.draft, st = pv.result.settings;
    var n = pv.result.sessions.length, left = Math.max(0, st.routeKm - c.cumKm);
    var h = '<div class="screen"><header class="top"><div class="who"><h1>Nice work love :)</h1><div class="small muted">Workout ' + n + ', ' + esc(dayName(d.day)) +
      ', ' + Math.max(1, Math.round(((d.finishedAt || Date.now()) - d.startedAt) / 60000)) + ' min</div></div>' + syncHTML() + '</header>' + mapSVG(c.cumKm);
    h += '<div class="kmbig">+' + kgFmt(c.km) + '<small>km</small></div>';
    h += '<p class="kmsplit">' + c.reps + ' reps toward ' + esc(who()) + '\'s flight. ' +
      (left > 0 ? km(left) + ' km until flying to Luxembourg.' : '<b>Flight unlocked ✈ ' + esc(who()) + ' to LUX</b>') + '</p>';
    if (c.goals && c.goals.length) {
      h += '<section class="panel pbpanel goalpanel"><h3>🎯 Goal reached!</h3><ul class="uplist">';
      c.goals.forEach(function (g) {
        var e = pv.result.prog.exById[g.ex];
        h += '<li><span>' + esc(g.label) + '</span><span class="hl">' + kgFmt(g.kg) + ' ' + esc(e ? e.kgLabel : 'kg') + ' × ' + g.reps + '</span></li>';
      });
      h += '</ul></section>';
    }
    if (c.prs.length) {
      h += '<section class="panel pbpanel"><h3>🏅 New personal best!</h3><ul class="uplist">';
      c.prs.forEach(function (p) {
        var e = pv.result.prog.exById[p.ex];
        h += '<li><span>' + esc(exName(p.ex)) + '</span><span class="hl">' + kgFmt(p.kg) + ' ' + esc(e ? e.kgLabel : 'kg') + ' × ' + p.reps + '</span></li>';
      });
      h += '</ul></section>';
    }
    if (c.improvements.length) {
      h += '<section class="panel"><h3>Better than last time :)</h3><ul class="uplist">';
      c.improvements.forEach(function (x) { h += '<li><span>' + esc(exName(x.ex)) + '</span><span class="hl">' + esc(x.text) + '</span></li>'; });
      h += '</ul></section>';
    }
    if (c.upgrades.length) {
      h += '<section class="panel"><h3>Heavier next time >:)</h3><ul class="uplist">';
      c.upgrades.forEach(function (id) {
        var s = pv.result.states[id + '|' + d.day];
        h += '<li><span>' + esc(exName(id)) + '</span><span class="num">' + (s ? kgFmt(s.kg) + ' kg' : '') + '</span></li>';
      });
      h += '</ul></section>';
    }
    if (c.done < c.prescribed) h += '<p class="small muted">' + c.done + ' of ' + c.prescribed + ' sets done. Every rep you logged still counts.</p>';
    h += '<div class="rate"><h3>How hard was it?</h3><div class="scale">';
    ['Easy', 'Steady', 'Hard', 'Very hard', 'Max >:)'].forEach(function (l, i) {
      h += '<button class="' + (d.effort === i + 1 ? 'on' : '') + '" data-act="effort" data-v="' + (i + 1) + '"><b>' + (i + 1) + '</b>' + esc(l) + '</button>';
    });
    h += '</div></div><div class="rate"><h3>Note for your coach</h3><textarea id="note" placeholder="Sore knee, felt strong, machine was taken…">' + esc(d.note || '') + '</textarea></div>';
    h += '<div class="rate"><h3>Photo for your coach 😇🌶️</h3>' + (d.photo
      ? '<div class="photoprev"><img src="' + d.photo + '" alt="Your workout photo"><button class="linkbtn" data-act="removePhoto">Remove photo</button></div>'
      : '<label class="btn ghost wide photobtn">' + IC.camera + 'Add a photo (optional)<input type="file" accept="image/*" id="photoIn" hidden></label>' +
        (S.photoBusy ? '<p class="small muted">Preparing the photo…</p>' : '')) + '</div>';
    h += '<div style="margin-top:18px"><button class="btn taxi wide" data-act="save">Save workout</button></div>' +
      '<p style="text-align:center"><button class="linkbtn" data-act="resume">Back to the workout</button></p></div>';
    return h;
  }

  // ---------- log ----------
  function chosenFor(res, slot, day) {
    var p = E.plan(res, todayStr(), day);
    var it = p.items.filter(function (x) { return x.slot === slot; })[0];
    return it ? it.exercise : null;
  }
  function lastTwo(res, exId, day) {
    var h = (res.hist[exId] || []).filter(function (x) { return x.day === day && x.mode !== 'deload'; });
    return [h[h.length - 1] || null, h[h.length - 2] || null];
  }
  function progressCard(res, label, slot) {
    var e = chosenFor(res, slot, 'A');
    if (!e) return '';
    var h = '<div class="pcard"><div class="small muted">' + esc(label) + '</div><h3>' + esc(e.name) + '</h3>';
    ['A', 'B'].forEach(function (day) {
      var two = lastTwo(res, e.id, day), cur = two[0], prev = two[1];
      h += '<div class="pline"><span class="dtag">' + esc(dayName(day)) + '</span>';
      if (!cur) h += '<span class="muted small">No ' + esc(dayName(day)) + ' result yet</span></div>';
      else {
        var imp = prev ? E.compare(e, prev, cur) : null;
        h += '<span><b>' + esc(setsText(cur, e.kgLabel === 'kg' ? 'kg' : e.kgLabel)) + '</b><span class="small muted"> ' + esc(fmtDate(cur.date)) + '</span>' +
          (imp ? '<span class="hl">' + esc(imp) + '</span>' : prev ? '<span class="small muted">Same as last time</span>' : '<span class="small muted">First result</span>') + '</span></div>';
      }
    });
    return h + '</div>';
  }

  function viewLog() {
    var res = calc(), st = res.settings, ws = weekStats(res);
    var h = '<div class="screen">' + topHTML('Progress', plural(res.completedCount, 'workout', 'workouts') + ' so far');
    h += streakHTML(res) + calendarHTML(res);
    h += strengthSummary(res);
    h += '<div class="pcards">' + progressCard(res, 'Push', 'chest') + progressCard(res, 'Pull', 'upper-back') + '</div>';
    var ms = res.milestones.slice().reverse();
    h += '<div class="section-h"><h2>Personal bests</h2><span class="small muted">' + plural(ms.length, 'milestone', 'milestones') + '</span></div>';
    if (!ms.length) h += '<p class="empty">Your first personal best shows up here as soon as you lift heavier than ever before >:)</p>';
    else {
      h += '<div class="badges">';
      ms.slice(0, 8).forEach(function (m) {
        var e = res.prog.exById[m.ex];
        h += '<div class="badge"><span class="medal">🏅</span><div><b>' + esc(exName(m.ex)) + '</b><div class="small">' + kgFmt(m.kg) + ' ' + esc(e ? e.kgLabel : 'kg') +
          ' × ' + m.reps + '</div><div class="small muted">' + esc(dayName(m.day)) + ', ' + esc(fmtDate(m.date)) + '</div></div></div>';
      });
      h += '</div>';
      if (ms.length > 8) h += '<p class="small muted">And ' + (ms.length - 8) + ' earlier ones.</p>';
    }
    h += goalsHTML(res);
    var mins = res.sessions.map(function (s) { return s.minutes; }).filter(function (m) { return m; });
    h += '<div class="stats"><div class="stat"><b>' + res.completedCount + '</b><span>Workouts</span></div>' +
      '<div class="stat"><b>' + ws.thisWeek + ' of ' + ws.perWeek + '</b><span>This week' + (ws.total ? ', ' + ws.good + ' of ' + ws.total + ' full weeks' : '') + '</span></div>' +
      '<div class="stat"><b>' + (mins.length ? Math.round(mins.reduce(function (a, b) { return a + b; }, 0) / mins.length) + ' min' : '—') + '</b><span>Average workout</span></div>' +
      '<div class="stat"><b>' + km(res.cumKm) + ' km</b><span>' + res.totalReps.toLocaleString('en-GB') + ' reps so far</span></div></div>';

    // working sets this week by muscle
    var t = todayStr(), monday = E.addDays(t, -((dateObj(t).getDay() + 6) % 7)), count = {};
    S.state.sessions.forEach(function (s) {
      if (s.date < monday || s.date > E.addDays(monday, 6)) return;
      (s.sets || []).forEach(function (x) { if (x.done && !x.skip) count[x.slot] = (count[x.slot] || 0) + 1; });
    });
    h += '<div class="section-h"><h2>Working sets this week</h2></div><section class="panel" style="margin-top:0"><div class="musclegrid">';
    res.prog.slots.forEach(function (sl) { h += '<div><span class="mg">' + muscleSVG(sl.key, sl.muscle) + esc(sl.muscle) + '</span><b>' + (count[sl.key] || 0) + '</b></div>'; });
    h += '</div></section>';


    // exercises
    h += '<div class="section-h"><h2>Exercises</h2><span class="small muted">strength trend, tap for details</span></div><section class="panel" style="margin-top:0;padding-top:6px;padding-bottom:6px">';
    var any = false;
    res.prog.slots.forEach(function (sl) {
      sl.variants.forEach(function (e) {
        var hist = res.hist[e.id];
        if (!hist || !hist.length) return;
        any = true;
        var a = res.states[e.id + '|A'], b = res.states[e.id + '|B'];
        h += '<button class="exprog" data-act="exDetail" data-ex="' + esc(e.id) + '"><div class="nm">' + esc(e.name) + '<small>' +
          [a && a.kg !== null ? dayName('A') + ' ' + kgFmt(a.kg) : '', b && b.kg !== null ? dayName('B') + ' ' + kgFmt(b.kg) : ''].filter(Boolean).join(', ') + ' ' + esc(e.kgLabel) +
          '</small></div>' + (function () {
            var sh = strengthHist(res, e.id), ch = E.strengthChange(res, e.id);
            return (sh.length ? spark(sh.map(function (x) { return x.est; })) : '<span></span>') +
              (ch ? '<div class="kg">' + pctText(ch.change) + '<small>strength</small></div>' : '<div class="kg">' + hist.length + '<small>' + (hist.length === 1 ? 'result' : 'results') + '</small></div>');
          })() + '</button>';
      });
    });
    if (!any) h += '<p class="empty">Your exercises show up here after your first workout :)</p>';
    h += '</section>';

    // workouts
    h += '<div class="section-h"><h2>Workouts</h2></div>';
    var list = res.sessions.slice().reverse(), n = res.sessions.length;
    if (!list.length) h += '<p class="empty">No workouts yet. They show up here after your first one :)</p>';
    list.forEach(function (s, i) {
      h += '<div class="mini"><div class="seat">' + (n - i) + '<small>' + esc(dayName(s.day)) + '</small></div>' +
        '<div><b>' + esc(fmtDate(s.date)) + '</b><div class="small muted">' + s.reps + ' reps' + (s.minutes ? ', ' + s.minutes + ' min' : '') +
        (s.mode === 'deload' ? ', easier week' : s.mode === 'intro' ? ', intro' : s.mode === 'back' ? ', welcome back' : '') + (s.prs.length ? ', 🏅 ' + plural(s.prs.length, 'PB', 'PBs') : '') + (s.goals.length ? ', 🎯 goal' : '') + '</div>' +
        reactionsFor(s.id).map(function (r) { return '<div class="rx">' + esc(reactionText(r)) + '</div>'; }).join('') + '</div>' +
        '<div class="km">+' + Math.round(s.km) + '<small>km</small></div></div>';
    });
    if (DEMO) h += demoLinks();
    return h + '</div>';
  }

  function demoLinks() {
    return '<p style="text-align:center;margin-top:24px;display:flex;gap:20px;justify-content:center;flex-wrap:wrap">' +
      '<button class="linkbtn" data-act="switchRole">' + (DEMO_ROLE === 'coach' ? 'Switch to her view' : 'Switch to the coach view') + '</button>' +
      '<button class="linkbtn" data-act="resetDemo">Restart with example data</button>' +
      '<button class="linkbtn" data-act="resetDemoEmpty">Restart from 0 km</button></p>';
  }

  function spark(vals, w, hgt) {
    w = w || 96; hgt = hgt || 30;
    if (vals.length === 1) vals = [vals[0], vals[0]];
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1;
    var pts = vals.map(function (v, i) { return [i / (vals.length - 1) * w, hgt - 3 - (v - min) / span * (hgt - 6)]; });
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + hgt + '" style="width:' + w + 'px;height:' + hgt + 'px" aria-hidden="true"><polyline class="spark" points="' +
      pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/><circle class="spark-end" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5"/></svg>';
  }

  function pctText(f) { var p = Math.round(f * 100); return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + '%'; }
  function shortDate(ds) { return dateObj(ds).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  function strengthHist(res, id) { return (res.hist[id] || []).filter(function (x) { return x.est > 0 && x.mode !== 'deload'; }); }

  // Estimated strength over time: one line, Heavy days as filled dots and Volume days as open dots.
  function strengthChart(pts, w, hgt) {
    var vals = pts.map(function (x) { return x.est; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1, pad = 6;
    var xy = pts.map(function (x, i) {
      return [pad + (pts.length > 1 ? i / (pts.length - 1) : 0.5) * (w - 2 * pad), hgt - pad - (x.est - min) / span * (hgt - 2 * pad)];
    });
    var h = '<svg viewBox="0 0 ' + w + ' ' + hgt + '" class="schart" aria-hidden="true"><polyline class="spark" points="' +
      xy.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
    xy.forEach(function (p, i) { h += '<circle class="' + (pts[i].day === 'A' ? 'dot-a' : 'dot-b') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4"/>'; });
    return h + '</svg>';
  }

  function strengthSummary(res) {
    var groups = [['Upper body', ['chest', 'upper-back', 'lats', 'side-delts', 'biceps', 'triceps']], ['Glutes', ['glutes']]], out = [], from = null;
    groups.forEach(function (g) {
      var ch = [];
      res.prog.slots.forEach(function (sl) {
        if (g[1].indexOf(sl.key) < 0) return;
        sl.variants.forEach(function (e) {
          var c = E.strengthChange(res, e.id);
          if (c) { ch.push(c.change); if (!from || c.from < from) from = c.from; }
        });
      });
      if (ch.length) out.push('<div class="stat"><b>' + pctText(ch.reduce(function (a, b) { return a + b; }, 0) / ch.length) + '</b><span>' + g[0] + '</span></div>');
    });
    if (!out.length) return '';
    return '<div class="section-h"><h2>Strength</h2><span class="small muted">since ' + esc(shortDate(from)) + '</span></div><div class="stats" style="margin-top:0">' + out.join('') + '</div>';
  }

  function goalsHTML(res) {
    if (!res.goals || !res.goals.length) return '';
    var h = '<div class="section-h"><h2>Goals</h2><span class="small muted">' + res.goals.filter(function (g) { return g.reached; }).length + ' of ' + res.goals.length + ' reached</span></div><div class="goals">';
    res.goals.forEach(function (g) {
      var e = res.prog.exById[g.ex], frac = 0, status;
      if (g.reached) { frac = 1; status = 'Reached ' + fmtDate(g.reached.date) + ' 🎯'; }
      else if (g.best === null) {
        var picked = ['A', 'B'].some(function (d) { var c = chosenFor(res, e.slot, d); return c && c.id === e.id; });
        status = picked ? 'Starts with your first ' + e.name.toLowerCase() : 'Pick ' + e.name.toLowerCase() + 's to start this one ;)';
      } else if (e.assisted) {
        frac = g.start > g.kg ? (g.start - g.best) / (g.start - g.kg) : 0.9;
        status = 'Down to ' + kgFmt(g.best) + ' kg assistance, from ' + kgFmt(g.start);
      } else {
        frac = g.kg > g.start ? (g.best - g.start) / (g.kg - g.start) : 0.9;
        status = 'Best ' + kgFmt(g.best) + ' of ' + kgFmt(g.kg) + ' ' + e.kgLabel;
      }
      frac = Math.max(g.best === null ? 0 : 0.04, Math.min(1, frac));
      h += '<div class="goal' + (g.reached ? ' done' : '') + '"><b>' + esc(g.label) + '</b><div class="progress"><span style="width:' + (frac * 100).toFixed(0) + '%"></span></div>' +
        '<div class="small muted">' + esc(status) + '</div></div>';
    });
    return h + '</div>';
  }

  function exDetail(id) {
    var res = calc(), e = res.prog.exById[id], hist = res.hist[id] || [];
    if (!e) return;
    var unit = e.kgLabel;
    var sh = strengthHist(res, id), ch = E.strengthChange(res, id);
    var h = '<h2>' + esc(e.name) + '</h2>';
    if (sh.length) {
      h += '<p class="small muted">' + (ch ? '<b class="sdelta">' + pctText(ch.change) + '</b> strength since ' + esc(shortDate(ch.from)) + '. ' : '') +
        'Estimated from your best set each workout, both days count.</p>';
      h += '<div class="bigspark">' + strengthChart(sh, 300, 80) + '<div class="legend small muted"><span><i class="dot-a"></i>' + esc(dayName('A')) +
        '</span><span><i class="dot-b"></i>' + esc(dayName('B')) + '</span></div></div>';
    }
    var best = null, bestReps = {};
    hist.forEach(function (x) {
      x.reps.forEach(function (r, i) {
        var kg = x.kgs[i];
        if (r < 1) return; // a set she couldn't finish isn't a record
        if (!best || (e.assisted ? kg < best.kg : kg > best.kg) || (kg === best.kg && r > best.reps)) best = { kg: kg, reps: r, day: x.day, date: x.date };
        if (!bestReps[kg] || r > bestReps[kg].reps) bestReps[kg] = { reps: r, day: x.day };
      });
    });
    if (best) h += '<h3>Personal record</h3><p><b>' + kgFmt(best.kg) + ' ' + esc(unit) + ' × ' + best.reps + '</b> <span class="small muted">' + esc(dayName(best.day)) + ', ' + esc(fmtDate(best.date)) + '</span></p>';
    var kgs = Object.keys(bestReps).map(Number).sort(function (a, b) { return b - a; });
    if (kgs.length) {
      h += '<h3>Best reps at each weight</h3><table class="plantable">';
      kgs.forEach(function (k) { h += '<tr><td>' + kgFmt(k) + ' ' + esc(unit) + '</td><td class="r"><b>' + bestReps[k].reps + '</b> reps <span class="small muted">' + esc(dayName(bestReps[k].day)) + '</span></td></tr>'; });
      h += '</table>';
    }
    h += '<h3 style="margin-top:14px">Recent sets</h3><table class="plantable">';
    hist.slice(-5).reverse().forEach(function (x) {
      h += '<tr><td>' + esc(fmtDate(x.date)) + '<div class="small muted">' + esc(dayName(x.day)) + '</div></td><td class="r">' +
        x.reps.map(function (r, i) { return r + (x.kgs[i] !== x.kg ? ' @' + kgFmt(x.kgs[i]) : ''); }).join(', ') + ' at ' + kgFmt(x.kg) + ' ' + esc(unit) + '</td></tr>';
    });
    h += '</table><div class="row"><button class="btn ghost" data-act="closeModal">Close</button></div>';
    showModal(h);
  }

  // ---------- coach ----------
  function viewCoach() {
    var res = calc(), s = S.state.settings;
    var h = '<div class="screen">' + topHTML('Coach console', (s.herName ? s.herName + ', ' : '') + 'flight ' + (s.flightNo || 'AY 1697')) + mapSVG(res.cumKm) + flightlineHTML(res);
    if (s.sheetUrl) h += '<p><a class="btn ghost wide" href="' + esc(s.sheetUrl) + '" target="_blank" rel="noopener">Open the Sheet</a></p>';
    h += '<section class="panel"><h3>Easier week</h3>';
    if (res.deloadLeft > 0) h += '<p class="small">Scheduled: her next ' + plural(res.deloadLeft, 'workout is', 'workouts are') + ' easier (half the sets, 3–4 in reserve).</p>';
    else {
      if (res.fatigue.offer) h += '<p class="small"><b>Several lifts dipped over two weeks:</b> ' + esc(res.fatigue.lifts.map(function (x) { return exName(x.ex) + ' (' + dayName(x.day) + ')'; }).join(', ')) + '. She is offered an easier week.</p>';
      else h += '<p class="small muted">Half the sets at 3–4 reps in reserve for her next two workouts, then back to her best weights.</p>';
      h += '<button class="btn small ghost" data-act="deload">Schedule an easier week</button>';
    }
    h += '</section>';
    h += '<section class="panel"><h3>Send a cheer</h3><p class="small muted" style="margin:4px 0 10px">It shows on her home screen until she taps it.</p>' +
      '<textarea id="cheerText" maxlength="280" placeholder="Friday is Volume day. Go get it."></textarea>' +
      '<div style="margin-top:10px"><button class="btn wide" data-act="sendCheer">Send cheer</button></div></section>';
    var nd = nextSessionDate(res), day = E.nextDay(res), p = E.plan(res, nd, day);
    h += '<div class="section-h"><h2>Next: ' + esc(dayName(day)) + '</h2><span class="small muted">' + esc(fmtDate(nd)) + (p.mode !== 'normal' ? ', ' + (p.mode === 'intro' ? 'intro week' : p.mode === 'back' ? 'welcome back' : 'easier week') : '') + '</span></div>';
    h += '<section class="panel" style="margin-top:0"><table class="plantable">';
    p.items.forEach(function (it) {
      var tag = it.upSteps ? ' <span class="status ok">increase</span>' : it.overridden ? ' <span class="status">you set</span>' : it.held ? ' <span class="status">holding</span>' : it.estimated ? ' <span class="status">estimated</span>' : '';
      h += '<tr><td><span class="small muted">' + esc(it.muscle) + (it.pair ? ', superset' : '') + '</span><br>' + esc(it.exercise.name) + tag + '<div class="small muted">' + esc(itemLine(it)) +
        ', last set ' + esc(rirText(it.rir[it.rir.length - 1])) + '</div></td><td class="r"><button class="btn ghost small" data-act="override" data-ex="' + esc(it.exercise.id) +
        '" data-kg="' + (it.kg === null ? '' : it.kg) + '" data-name="' + esc(it.exercise.name) + '">Set kg</button></td></tr>';
    });
    h += '</table></section>';
    h += '<div class="section-h"><h2>Postcards</h2></div><section class="panel" style="margin-top:0">';
    var avg = E.eta(res, todayStr(), false).avgKm || 70;
    S.state.postcards.forEach(function (c) {
      var status, cls = '';
      if (c.replyEmoji || c.replyText) { status = 'Replied ' + (c.replyEmoji || '💬'); cls = 'ok'; }
      else if (c.openedAt) { status = 'Opened'; cls = 'ok'; }
      else if (c.delivered) { status = 'Delivered'; cls = 'ok'; }
      else if (!c.written) { var left = c.km - res.cumKm; status = left <= 0 ? 'Passed, write it now!' : left < avg * 2 ? 'Empty, due in ' + km(left) + ' km' : 'Empty'; cls = left < avg * 2 ? 'warn' : ''; }
      else status = 'Written, sealed';
      h += '<div class="cardrow"><div><b>' + esc(c.place) + '</b>, ' + esc(c.from) + '<div class="small muted">Delivered over ' + esc(c.over) + ' at ' + km(c.km) + ' km</div>' +
        (c.replyEmoji || c.replyText ? '<div class="small withav">' + avatarHTML('her', 'av-24') + (c.replyEmoji ? esc(c.replyEmoji) + ' ' : '') + (c.replyText ? '“' + esc(c.replyText) + '”' : '') + '</div>' : '') +
        (c.delivered ? '<button class="linkbtn" data-act="postcard" data-id="' + esc(c.id) + '">Open the card</button>' : '') + '</div><span class="status ' + cls + '">' + esc(status) + '</span></div>';
    });
    h += '<p class="small muted" style="margin:10px 0 0">Write notes and add photo links in the Postcards tab of the Sheet.</p></section>';
    h += '<div class="section-h"><h2>Her workouts</h2></div><div class="feed">';
    var list = res.sessions.slice().reverse(), n = res.sessions.length;
    if (!list.length) h += '<p class="empty">Her workouts appear here as soon as she saves them.</p>';
    list.forEach(function (x, i) {
      h += '<div class="item"><div class="l1"><span class="withav">' + avatarHTML('her', 'av-32') + '<b>Workout ' + (n - i) + ', ' + esc(dayName(x.day)) + '</b></span><span class="num">+' + kgFmt(x.km) + ' km</span></div>' +
        '<div class="l2">' + esc(fmtDate(x.date)) + (x.minutes ? ', ' + x.minutes + ' min' : '') + ', ' + x.done + '/' + x.prescribed + ' sets, ' + x.reps + ' reps' +
        (x.effort ? ', effort ' + x.effort + '/5' : '') + (x.mode !== 'normal' ? ', ' + (x.mode === 'intro' ? 'intro' : x.mode === 'back' ? 'welcome back' : 'easier week') : '') + '</div>' +
        (x.improvements.length ? '<div class="l2">Better: ' + esc(x.improvements.map(function (m) { return exName(m.ex) + ' ' + m.text; }).join('; ')) + '</div>' : '') +
        (x.upgrades.length ? '<div class="l2">Heavier next time: ' + esc(x.upgrades.map(exName).join(', ')) + '</div>' : '') +
        (x.note ? '<q>' + esc(x.note) + '</q>' : '') +
        (x.goals && x.goals.length ? '<div class="l2">🎯 Goal reached: ' + esc(x.goals.map(function (g) { return g.label; }).join(', ')) + '</div>' : '') +
        (x.prs.length ? '<div class="l2">🏅 Personal best: ' + esc(x.prs.map(function (p) { return exName(p.ex) + ' ' + kgFmt(p.kg) + ' kg × ' + p.reps; }).join(', ')) + '</div>' : '') +
        reactionsFor(x.id).map(function (r) { return '<div class="rx">You: ' + esc(reactionText(r)) + (r.seenAt ? ' <span class="small muted">seen</span>' : '') + '</div>'; }).join('') +
        '<div class="row2">' + (x.photo ? '<button class="btn ghost small" data-act="showPhoto" data-id="' + esc(x.id) + '">' + IC.camera + 'See her photo</button>' : '') +
        '<button class="btn ghost small" data-act="react" data-id="' + esc(x.id) + '" data-n="' + (n - i) + '">React</button></div></div>';
    });
    h += '</div>';
    if (DEMO) h += demoLinks();
    return h + '</div>';
  }

  function tabsHTML() {
    var tabs = role() === 'coach'
      ? [['coach', 'Coach', IC.tabCoach], ['home', 'Her view', IC.tabTrain], ['trip', 'Flight', IC.tabHome], ['log', 'Progress', IC.tabProgress]]
      : [['home', 'Train', IC.tabTrain], ['trip', 'Flight', IC.tabHome], ['log', 'Progress', IC.tabProgress]];
    return '<div class="tabs"><nav>' + tabs.map(function (t) {
      return '<button class="' + (S.view === t[0] ? 'on' : '') + '" data-act="tab" data-v="' + t[0] + '">' + t[2] + t[1] + '</button>';
    }).join('') + '</nav></div>';
  }

  // ---------- postcards ----------
  function frontArt(c, small) {
    var big = (c.from || 'Tampere');
    return '<svg class="ill" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="300" height="200" fill="#3F51E3"/>' +
      '<path d="M0 150Q75 128 150 146T300 138V200H0Z" fill="#4C64EE"/><path d="M0 170Q90 152 170 168T300 160V200H0Z" fill="#5A78F4"/>' +
      '<text x="150" y="' + (small ? 118 : 112) + '" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="' +
      Math.min(96, Math.floor(560 / Math.max(4, big.length))) + '" fill="#FFFFFF" stroke="#3F51E3" stroke-width="2" paint-order="stroke">' + esc(big) + '</text></svg>';
  }
  function stampSVG() {
    var h = '<svg class="stamp" viewBox="0 0 58 70" aria-hidden="true"><rect x="2" y="2" width="54" height="66" fill="#fff" stroke="#c9c1ad" stroke-width="1"/>';
    for (var x = 4; x < 56; x += 5) h += '<circle cx="' + x + '" cy="2" r="1.6" fill="#FFFDF8"/><circle cx="' + x + '" cy="68" r="1.6" fill="#FFFDF8"/>';
    for (var y = 4; y < 68; y += 5) h += '<circle cx="2" cy="' + y + '" r="1.6" fill="#FFFDF8"/><circle cx="56" cy="' + y + '" r="1.6" fill="#FFFDF8"/>';
    h += '<rect x="7" y="7" width="44" height="56" fill="#1F4FBF"/><g transform="translate(29 30) rotate(-30) scale(1.25)"><path d="' + PLANE + '" fill="#F5B700"/></g>' +
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
  var PC_EMOJIS = ['❤️', '🥰', '😂', '🥹', '😘', '🔥', '🌶️'];
  /** Her reply to a postcard: the form, or what she sent with a Change link. The coach only reads it. */
  function pcReplyHTML(c, editing) {
    var replied = !!(c.replyEmoji || c.replyText);
    if (role() === 'coach') {
      return replied ? '<div class="pcr-sent"><span class="avwrap">' + avatarHTML('her', 'av-44') + '<i class="avbadge">' + esc(c.replyEmoji || '💬') + '</i></span><div><b>Her reply</b>' + (c.replyText ? '“' + esc(c.replyText) + '”' : '') + '</div></div>'
        : '<p class="pcr-none">No reply yet.</p>';
    }
    if (replied && !editing) {
      return '<div class="pcr-sent"><span class="avwrap">' + avatarHTML('her', 'av-44') + '<i class="avbadge">' + esc(c.replyEmoji || '💬') + '</i></span><div><b>Your reply to ' + esc(who()) + '</b>' + (c.replyText ? '“' + esc(c.replyText) + '”' : '') +
        '</div><button class="linkbtn" data-act="pcEdit">Change</button></div>';
    }
    return '<h3 class="withav">' + avatarHTML('coach', 'av-32') + 'Reply to coach</h3><div class="pcr-emojis">' + PC_EMOJIS.map(function (e) {
      return '<button class="chip emo' + (S.pcEmoji === e ? ' on' : '') + '" data-act="pcEmoji" data-v="' + e + '" aria-label="React with ' + e + '">' + e + '</button>';
    }).join('') + '</div><textarea id="pcText" maxlength="500" placeholder="Write something back (optional)">' + esc(c.replyText || '') + '</textarea>' +
      '<button class="btn taxi wide" data-act="pcSend">Send to ' + esc(who()) + '</button>';
  }

  function openPostcard(id) {
    var c = S.state.postcards.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var name = S.state.settings.herName || 'you';
    var h = '<div class="postcard-modal"><div class="pc-wrap"><div class="pc" id="pc" data-act="flip" role="button" tabindex="0" aria-label="Postcard, tap to turn over">' +
      '<div class="pc-face pc-front">' + (c.photo ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.place) + '">' : frontArt(c)) +
      '<div class="cap"><small>Greetings from ' + esc(c.from) + '</small>' + esc(c.place) + '</div></div>' +
      '<div class="pc-face pc-back"><div class="inner"><div class="msg">' + esc(c.message || '') + '</div><div class="side">' + stampSVG() + postmarkSVG(c.from, c.deliveredOn) +
      '<div class="addr">To ' + esc(name) + ',<br>from ' + esc(c.over) + '</div></div></div></div></div></div>' +
      '<p class="pc-hint" id="pcHint">Tap the card to turn it over</p>' + (c.delivered ? '<div class="pcreply" id="pcReply">' + pcReplyHTML(c, false) + '</div>' : '') +
      '<button class="btn ghost wide pc-close" data-act="closeModal">Close</button></div>';
    S.pcId = c.id; S.pcEmoji = c.replyEmoji || '';
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

  /** One logged workout: summary, every exercise with its sets, PBs, her note and the coach's reactions. */
  function dayWorkoutHTML(res, f) {
    var raw = S.state.sessions.filter(function (x) { return x.id === f.id; })[0] || { sets: [] };
    var byEx = [], idx = {};
    (raw.sets || []).forEach(function (x) {
      if (!x.done || x.skip) return;
      if (!(x.ex in idx)) { idx[x.ex] = byEx.length; byEx.push({ ex: x.ex, sets: [] }); }
      byEx[idx[x.ex]].sets.push(x);
    });
    var h = '<section class="dayw"><div class="dwh"><b>' + esc(dayName(f.day)) + '</b><span class="small muted">' +
      [f.minutes ? f.minutes + ' min' : '', f.reps + ' reps', '+' + Math.round(f.km) + ' km'].filter(Boolean).join(' · ') + '</span></div>';
    var rx = reactionsFor(f.id);
    if (rx.length) h += rx.map(function (r) { return '<div class="dayrx"><span class="avwrap">' + avatarHTML('coach', 'av-36') + '<i class="avbadge">' + esc(r.emoji || '💬') + '</i></span><div><b>' + esc(who()) + '</b>' + (r.text ? '“' + esc(r.text) + '”' : ' reacted') + '</div></div>'; }).join('');
    if (f.prs && f.prs.length) h += '<div class="small daypb">🏅 ' + esc(f.prs.map(function (pr) { return exName(pr.ex) + ' ' + kgFmt(pr.kg) + ' kg × ' + pr.reps; }).join(', ')) + '</div>';
    if (byEx.length) {
      h += '<table class="dayex">';
      byEx.forEach(function (g) {
        var e = res.prog.exById[g.ex], unit = e ? e.kgLabel : 'kg';
        var kgs = g.sets.map(function (x) { return Number(x.kg) || 0; }), same = kgs.every(function (k) { return k === kgs[0]; });
        var line = same ? g.sets.map(function (x) { return x.reps; }).join(', ') + ' at ' + kgFmt(kgs[0]) + ' ' + unit
          : g.sets.map(function (x) { return x.reps + ' × ' + kgFmt(Number(x.kg) || 0); }).join(', ') + ' ' + unit;
        h += '<tr><td>' + esc(exName(g.ex)) + '</td><td class="r">' + esc(line) + '</td></tr>';
      });
      h += '</table>';
    }
    if (raw.note) h += '<div class="dayrx her">' + avatarHTML('her', 'av-36') + '<div><b>Note</b>' + esc(raw.note) + '</div></div>';
    return h + '</section>';
  }

  function daySheet(ds) {
    var res = calc();
    var w = res.sessions.filter(function (s) { return s.date === ds; });
    var has = function (t) { return S.state.stamps.some(function (s) { return s.date === ds && s.type === t; }); };
    var h = '<h2>' + esc(fmtLong(ds)) + '</h2>';
    w.forEach(function (f) { h += dayWorkoutHTML(res, f); });
    if (!w.length) {
      var ti = res.settings.trainingWeekdays.indexOf(E.weekday(ds));
      if (ti >= 0 && ds >= todayStr() && ds >= res.settings.startDate) h += '<p class="muted">' + esc(dayName(ti === 0 ? 'A' : 'B')) + ' workout planned :)</p>';
      h += '<p class="muted small">Ballet and runs don\'t move the plane, but your coach sees them ;)</p>';
    }
    h += '<div class="toggles">';
    [['ballet', 'Ballet', IC.ballet], ['run', 'Run', IC.run]].forEach(function (t) {
      var on = has(t[0]);
      h += '<button class="toggle' + (on ? ' on' : '') + '" data-act="stamp" data-date="' + ds + '" data-type="' + t[0] + '" data-on="' + (on ? 0 : 1) + '" aria-pressed="' + on + '">' +
        '<i class="mk ' + t[0] + '">' + t[2] + '</i>' + t[1] + '<span class="box2">' + (on ? IC.check : '') + '</span></button>';
    });
    h += '</div><div class="row"><button class="btn ghost" data-act="closeModal">Done</button></div>';
    showModal(h);
  }

  /** Exercise chooser for one slot. ctx 'pass' (before the workout) or 'flight' (during it). */
  function chooser(slot, ctx, day) {
    S.chooseCtx = { slot: slot, ctx: ctx, day: day || (S.draft ? S.draft.day : 'A') };
    if (!S.chooseScope || (ctx === 'pass' && S.chooseScope === 'today')) S.chooseScope = ctx === 'flight' ? 'today' : 'both';
    renderChooser();
  }
  function renderChooser() {
    var cc = S.chooseCtx, res = calc();
    var date = cc.ctx === 'flight' ? S.draft.date : todayStr();
    var it = E.plan(res, date, cc.day).items.filter(function (x) { return x.slot === cc.slot; })[0];
    if (!it) return;
    var current = cc.ctx === 'flight' ? S.draft.items[cc.slot].ex : it.exercise.id;
    var h = '<h2>' + esc(it.muscle) + '</h2><p class="muted small">Pick one exercise. Stick with the same choice for at least a few weeks so your progress shows :)</p>';
    var scopes = (cc.ctx === 'flight' ? [['today', 'Just today']] : []).concat([['both', 'Both days'], ['only', 'Only on ' + dayName(cc.day) + ' days']]);
    h += '<div class="scopes">' + scopes.map(function (s) {
      return '<button class="chip' + (S.chooseScope === s[0] ? ' on' : '') + '" data-act="scope" data-v="' + s[0] + '">' + esc(s[1]) + '</button>';
    }).join('') + '</div><div class="toggles">';
    it.options.forEach(function (o) {
      var on = o.exercise.id === current;
      h += '<button class="toggle' + (on ? ' on' : '') + '" data-act="pick" data-ex="' + esc(o.exercise.id) + '"><span class="opt"><b>' + esc(o.exercise.name) + '</b>' +
        '<span class="small muted">' + (o.exercise.rank === 1 ? 'Recommended. ' : '') + esc(itemLine(o)) + '</span></span><span class="box2">' + (on ? IC.check : '') + '</span></button>';
    });
    h += '</div><div class="row"><button class="btn ghost" data-act="closeModal">Done</button></div>';
    showModal(h);
  }
  function pick(exId) {
    var cc = S.chooseCtx, scope = S.chooseScope;
    if (cc.ctx === 'flight') {
      var d = S.draft;
      if (d.sets.some(function (s) { return s.slot === cc.slot && s.done; })) return;
      var p = E.plan(calc(), d.date, d.day), it = p.items.filter(function (x) { return x.slot === cc.slot; })[0];
      var o = it.options.filter(function (x) { return x.exercise.id === exId; })[0];
      if (!o) return;
      var fresh = setsFromPlan(o);
      var keep = d.sets.filter(function (s) { return s.slot !== cc.slot; });
      var first = d.sets.map(function (s) { return s.slot; }).indexOf(cc.slot);
      d.sets = keep.slice(0, first).concat(fresh, keep.slice(first));
      d.items[cc.slot] = itemFromPlan(o);
      d.items[cc.slot].oneOff = scope === 'today';
      d.undo = d.undo.filter(function () { return false; }); // indexes changed
      d.fbFor = null; d.lower = null;
      store.set('draft', d);
    }
    if (scope !== 'today') enqueue({ type: 'choice', slot: cc.slot, day: scope === 'only' ? cc.day : 'AB', ex: exId, at: nowIso() });
    closeModal();
  }

  function overview() {
    var d = S.draft, next = nextStep(d), cur = next !== undefined ? blockIndexOfSlot(d, d.sets[next].slot) : -1;
    var h = '<h2>Workout overview</h2><p class="small muted">Do the exercises in any order: tap <b>Do now</b> to go to one straight away. You can also move, skip, or split a superset when a machine is busy.</p><div class="blocks">';
    d.blocks.forEach(function (b, i) {
      var sets = d.sets.filter(function (s) { return b.slots.indexOf(s.slot) >= 0; });
      var done = sets.filter(function (s) { return s.done; }).length, opened = sets.filter(open).length, skipped = sets.filter(function (s) { return s.skip; }).length;
      var names = b.slots.map(function (k) { return d.items[k].name; }).join(' + ');
      var movable = opened > 0;
      h += '<div class="blk' + (i === cur ? ' cur' : '') + '"><div class="bt"><b>' + esc(names) + '</b><div class="small muted">' + done + ' of ' + sets.length + ' sets done' +
        (skipped ? ', ' + skipped + ' skipped' : '') + (b.paired ? (b.separated ? ', split' : ', superset') : '') + '</div></div><div class="ba">' +
        (movable && i > 0 ? '<button class="ib" data-act="moveBlock" data-i="' + i + '" data-d="-1" aria-label="Move up">↑</button>' : '') +
        (movable && i < d.blocks.length - 1 ? '<button class="ib" data-act="moveBlock" data-i="' + i + '" data-d="1" aria-label="Move down">↓</button>' : '') +
        (b.paired && opened ? '<button class="linkbtn" data-act="splitBlock" data-i="' + i + '">' + (b.separated ? 'Rejoin' : 'Split') + '</button>' : '') +
        (opened ? '<button class="linkbtn" data-act="skipBlock" data-i="' + i + '">Skip</button>' : skipped ? '<button class="linkbtn" data-act="unskipBlock" data-i="' + i + '">Unskip</button>' : '') +
        (opened && cur >= 0 && i !== cur ? '<button class="linkbtn" data-act="doNow" data-i="' + i + '"><b>Do now</b></button>' : '') +
        '<button class="linkbtn" data-act="viewBlock" data-i="' + i + '">View</button></div></div>';
    });
    h += '</div><div class="row"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn" data-act="finish">Finish workout</button></div>';
    showModal(h);
  }
  function moveBlock(i, dir) {
    var d = S.draft, j = i + dir;
    if (j < 0 || j >= d.blocks.length) return;
    var other = d.blocks[j], otherOpen = d.sets.some(function (s) { return other.slots.indexOf(s.slot) >= 0 && open(s); });
    if (!otherOpen) return; // finished exercises stay where they were done
    var t = d.blocks[i]; d.blocks[i] = other; d.blocks[j] = t;
    store.set('draft', d);
  }
  function blockOpen(d, i) { var b = d.blocks[i]; return !!b && d.sets.some(function (s) { return b.slots.indexOf(s.slot) >= 0 && open(s); }); }
  function currentBlock(d) { var n = nextStep(d); return n === undefined ? -1 : blockIndexOfSlot(d, d.sets[n].slot); }
  function lastOpenBlock(d) { for (var i = d.blocks.length - 1; i >= 0; i--) if (blockOpen(d, i)) return i; return -1; }
  /** Moves block i to just before the current one, so it is next. The current one picks up where it left off afterwards. */
  function doNow(i) {
    var d = S.draft, cur = currentBlock(d);
    if (cur < 0 || i === cur || !blockOpen(d, i)) return;
    var b = d.blocks.splice(i, 1)[0];
    if (i < cur) cur--;
    d.blocks.splice(cur, 0, b);
    afterReorder(d);
  }
  /** Moves the current block behind the last unfinished one (machine busy). */
  function doLater(i) {
    var d = S.draft, last = lastOpenBlock(d);
    if (!blockOpen(d, i) || last <= i) return;
    var b = d.blocks.splice(i, 1)[0];
    d.blocks.splice(last, 0, b);
    afterReorder(d);
  }
  function afterReorder(d) {
    d.view = null; d.lower = null; d.fbFor = null;
    store.set('draft', d);
    // a running rest timer still says what's next: point it at the new next exercise
    var n = nextStep(d), lbl = document.querySelector('#rest:not(.switch) .lbl');
    if (n !== undefined && lbl) {
      var ns = d.sets[n];
      lbl.innerHTML = '<b>Rest</b>' + esc('Next: ' + d.items[ns.slot].name + ', ' + ns.reps + ' reps at ' + kgFmt(ns.kg) + ' kg');
    }
  }

  function confirmFinish() {
    var d = S.draft, left = d.sets.filter(open).length;
    if (!left) { goLanding(); return; }
    showModal('<h2>Finish now?</h2><p>' + plural(left, 'set is', 'sets are') + ' still open. Every rep you logged still counts, and the open sets are left out.</p>' +
      '<div class="row"><button class="btn ghost" data-act="closeModal">Keep going</button><button class="btn" data-act="finishAnyway">Finish</button></div>');
  }

  function reactSheet(id, n) {
    S.reactEmoji = S.reactEmoji === undefined ? '🔥' : S.reactEmoji;
    S.reactFor = { id: id, n: n };
    var emojis = ['❤️', '🔥', '💪', '👏', '😍', '🤩'];
    showModal('<h2>React to workout ' + esc(n) + '</h2><p class="small muted">She sees it on her home screen the next time she opens the app.</p>' +
      '<div class="emojis">' + emojis.map(function (e) { return '<button class="chip emo' + (S.reactEmoji === e ? ' on' : '') + '" data-act="reactEmoji" data-v="' + e + '">' + e + '</button>'; }).join('') +
      '<button class="chip' + (S.reactEmoji === '' ? ' on' : '') + '" data-act="reactEmoji" data-v="">None</button></div>' +
      '<textarea id="reactText" maxlength="280" placeholder="Add a comment (optional)">' + esc(S.reactDraft || '') + '</textarea>' +
      '<div class="row"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-act="sendReact">Send</button></div>');
  }

  function overrideSheet(ex, kg, name) {
    showModal('<h2>' + esc(name) + '</h2><p class="muted">Set the weight for her next workouts on both days. Progression continues from there.</p>' +
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
  function startRest(sec, kind, nextLabel) {
    stopRest();
    restEnd = Date.now() + sec * 1000;
    var el = document.getElementById('rest');
    el.hidden = false;
    el.className = kind === 'Switch' ? 'switch' : '';
    el.innerHTML = '<span class="t" id="restT"></span><span class="lbl"><b>' + esc(kind) + '</b>' + esc(nextLabel) + '</span>' +
      '<button data-act="restAdd">+15 s</button><button data-act="restSkip">Skip</button>';
    var beeped = false;
    function tick() {
      var left = Math.ceil((restEnd - Date.now()) / 1000), t = document.getElementById('restT');
      if (!t) return;
      if (left > 0) { t.textContent = Math.floor(left / 60) + ':' + pad(left % 60); el.classList.remove('over'); }
      else {
        t.textContent = 'Go >:)';
        el.classList.add('over');
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
    var colors = ['#4054E5', '#F25C87', '#F5B700', '#8FB0FF', '#FFFFFF'];
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
    closeModalSilently();
    render();
    window.scrollTo(0, 0);
    var pv = preview();
    animatePlane(pv.session.cumBefore, pv.session.cumKm);
    if (pv.session.goals.length || pv.session.prs.length || pv.session.upgrades.length || pv.session.improvements.length) setTimeout(confetti, 2600);
  }

  function saveFlight() {
    var note = document.getElementById('note');
    if (note) S.draft.note = note.value;
    var sess = draftSession(), photo = S.draft.photo || null;
    S.draft = null;
    store.del('draft');
    releaseAwake();
    S.view = 'home';
    S.autoMail = true;
    enqueue({ type: 'saveSession', session: sess });
    if (photo) enqueue({ type: 'photo', sessionId: sess.id, dataUrl: photo });
    render();
    window.scrollTo(0, 0);
  }

  /** Shrinks a photo to at most 1280 px on the long side as JPEG, so it stays small and syncs fast. */
  function preparePhoto(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = reject;
      rd.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.78));
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }

  function showPhoto(id) {
    var local = S.localPhotos && S.localPhotos[id];
    showModal('<h2>Workout photo</h2><div class="photoview" id="photoView">' + (local ? '<img src="' + local + '" alt="Workout photo">' : '<p class="muted">Loading the photo…</p>') +
      '</div><div class="row"><button class="btn ghost" data-act="closeModal">Close</button></div>');
    if (local) return;
    API.photo(id).then(function (url) {
      var v = document.getElementById('photoView');
      if (v) v.innerHTML = '<img src="' + url + '" alt="Workout photo">';
    }, function () {
      var v = document.getElementById('photoView');
      if (v) v.innerHTML = '<p class="muted">The photo couldn\'t be loaded. It may still be syncing from her phone.</p>';
    });
  }

  function slotOf(i) { return S.draft.sets[i].slot; }

  // ---------- events ----------
  var app = document.getElementById('app');
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) {
      if (ev.target.id === 'modal' && !document.getElementById('pc')) closeModal();
      return;
    }
    if (t.disabled) return;
    var a = t.dataset.act, d = S.draft;
    switch (a) {
      case 'tab': S.view = t.dataset.v; render(); window.scrollTo(0, 0); break;
      case 'home': S.view = role() === 'coach' ? 'coach' : 'home'; stopRest(); render(); window.scrollTo(0, 0); break;
      case 'board': S.boardDay = null; S.view = 'board'; render(); window.scrollTo(0, 0); break;
      case 'boardDay': S.boardDay = t.dataset.day; render(); break;
      case 'start': startFlight(t.dataset.day); break;
      case 'resume': if (d) { d.finishedAt = null; store.set('draft', d); } S.view = 'flight'; keepAwake(); unlockAudio(); render(); break;
      case 'inc': {
        var s = d.sets[+t.dataset.i], it = d.items[s.slot], f = t.dataset.f, step = f === 'kg' ? it.step : 1;
        s[f] = Math.max(0, Math.round((Number(s[f]) + step * Number(t.dataset.d)) * 100) / 100);
        if (f === 'kg' && !s.done) d.sets.forEach(function (o) { if (o.slot === s.slot && open(o) && o.set > s.set) o.kg = s.kg; });
        store.set('draft', d); render(); break;
      }
      case 'confirm': unlockAudio(); confirmSet(+t.dataset.i); render(); break;
      case 'fb': { var fs = d.sets[+t.dataset.i]; fs.fb = fs.fb === t.dataset.v ? '' : t.dataset.v; store.set('draft', d); render(); break; }
      case 'lower': if (d.lower) { d.sets.forEach(function (o) { if (o.slot === d.lower.slot && open(o)) o.kg = d.lower.kg; }); d.lower = null; store.set('draft', d); render(); } break;
      case 'keepWeight': d.lower = null; store.set('draft', d); render(); break;
      case 'undo': {
        var ui = d.undo.pop();
        if (ui !== undefined) { d.sets[ui].done = false; d.sets[ui].fb = ''; d.fbFor = null; d.lower = null; d.view = null; stopRest(); }
        store.set('draft', d); render(); break;
      }
      case 'overview': overview(); break;
      case 'moveBlock': moveBlock(+t.dataset.i, +t.dataset.d); overview(); render(); break;
      case 'splitBlock': d.blocks[+t.dataset.i].separated = !d.blocks[+t.dataset.i].separated; store.set('draft', d); overview(); render(); break;
      case 'skipBlock': d.sets.forEach(function (o) { if (d.blocks[+t.dataset.i].slots.indexOf(o.slot) >= 0 && open(o)) o.skip = true; }); stopRest(); store.set('draft', d); overview(); render(); break;
      case 'unskipBlock': d.sets.forEach(function (o) { if (d.blocks[+t.dataset.i].slots.indexOf(o.slot) >= 0) o.skip = false; }); store.set('draft', d); overview(); render(); break;
      case 'viewBlock': d.view = +t.dataset.i; store.set('draft', d); closeModal(); window.scrollTo(0, 0); break;
      case 'toCurrent': d.view = null; store.set('draft', d); render(); break;
      case 'doNow': doNow(+t.dataset.i); closeModal(); window.scrollTo(0, 0); break;
      case 'doLater': doLater(+t.dataset.i); render(); window.scrollTo(0, 0); break;
      case 'lastRound': {
        var nx = nextStep(d), firstAcc = -1;
        d.blocks.forEach(function (b, bi) { if (firstAcc < 0 && b.paired && d.sets.some(function (o) { return b.slots.indexOf(o.slot) >= 0 && open(o); })) firstAcc = bi; });
        if (firstAcc >= 0) {
          var fb = d.blocks[firstAcc];
          var r = Math.min.apply(null, d.sets.filter(function (o) { return fb.slots.indexOf(o.slot) >= 0 && open(o); }).map(function (o) { return o.set; }));
          d.sets.forEach(function (o) {
            var bi2 = blockIndexOfSlot(d, o.slot);
            if (!open(o) || !d.blocks[bi2].paired) return;
            if (bi2 !== firstAcc || o.set > r) o.skip = true;
          });
        }
        d.timeOffer = true; store.set('draft', d); render(); break;
      }
      case 'skipRest': d.sets.forEach(function (o) { if (open(o) && d.blocks[blockIndexOfSlot(d, o.slot)].paired) o.skip = true; }); d.timeOffer = true; stopRest(); store.set('draft', d); render(); break;
      case 'timeLater': d.timeOffer = true; store.set('draft', d); render(); break;
      case 'finish': confirmFinish(); break;
      case 'finishAnyway': closeModalSilently(); goLanding(); break;
      case 'choose': chooser(t.dataset.slot, t.dataset.ctx, t.dataset.day); break;
      case 'scope': S.chooseScope = t.dataset.v; renderChooser(); break;
      case 'pick': pick(t.dataset.ex); break;
      case 'effort': d.effort = +t.dataset.v; keepNote(); store.set('draft', d); render(); break;
      case 'save': saveFlight(); break;
      case 'removePhoto': d.photo = null; store.set('draft', d); render(); break;
      case 'showPhoto': showPhoto(t.dataset.id); break;
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
      case 'deload': enqueue({ type: 'deload', date: todayStr() }); render(); break;
      case 'fatigueLater': S.seen['fat:' + t.dataset.id] = 1; store.set('seen', S.seen); render(); break;
      case 'day': daySheet(t.dataset.date); break;
      case 'mapToggle': S.mapOpen = !S.mapOpen; render(); break;
      case 'profile': profileSheet(); break;
      case 'avatarRemove': enqueue({ type: 'profilePhoto', dataUrl: '' }); profileSheet(); render(); break;
      case 'discard': {
        var done = S.draft ? S.draft.sets.filter(function (x) { return x.done; }).length : 0;
        showModal('<h2>Discard this workout?</h2><p>' + (done ? plural(done, 'logged set', 'logged sets') + ', the time and the km from it are thrown away.' : 'Nothing has been logged yet.') +
          ' Nothing is saved or sent to ' + esc(who()) + '.</p><div class="row"><button class="btn ghost" data-act="closeModal">Keep it</button><button class="btn warnbtn" data-act="discardYes">Discard</button></div>');
        break;
      }
      case 'discardYes':
        stopRest(); releaseAwake();
        S.draft = null; store.del('draft');
        S.view = 'home'; closeModalSilently(); render(); window.scrollTo(0, 0);
        break;
      case 'pcEmoji': {
        S.pcEmoji = S.pcEmoji === t.dataset.v ? '' : t.dataset.v;
        document.querySelectorAll('#pcReply [data-act="pcEmoji"]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.pcEmoji); });
        break;
      }
      case 'pcEdit': {
        var pe = S.state.postcards.filter(function (x) { return x.id === S.pcId; })[0];
        if (pe) document.getElementById('pcReply').innerHTML = pcReplyHTML(pe, true);
        break;
      }
      case 'pcSend': {
        var pc = S.state.postcards.filter(function (x) { return x.id === S.pcId; })[0];
        var txt = (document.getElementById('pcText') || {}).value || '';
        txt = txt.trim();
        if (!pc || (!S.pcEmoji && !txt)) { var ta = document.getElementById('pcText'); if (ta) { ta.placeholder = 'Pick an emoji or write something first :)'; ta.focus(); } break; }
        enqueue({ type: 'postcardReply', id: pc.id, emoji: S.pcEmoji, text: txt });
        pc.replyEmoji = S.pcEmoji; pc.replyText = txt; pc.repliedAt = nowIso();
        document.getElementById('pcReply').innerHTML = pcReplyHTML(pc, false) + '<p class="pcr-ok">Sent to ' + esc(who()) + ' ✈</p>';
        break;
      }
      case 'calMonth': S.calMonth = t.dataset.m; render(); break;
      case 'stamp': enqueue({ type: 'stamp', date: t.dataset.date, stampType: t.dataset.type, on: t.dataset.on === '1' }); daySheet(t.dataset.date); render(); break;
      case 'exDetail': exDetail(t.dataset.ex); break;
      case 'sendCheer': {
        var tx = document.getElementById('cheerText');
        if (tx && tx.value.trim()) { enqueue({ type: 'cheer', text: tx.value.trim() }); tx.value = ''; render(); }
        break;
      }
      case 'override': overrideSheet(t.dataset.ex, t.dataset.kg, t.dataset.name); break;
      case 'react': S.reactDraft = ''; reactSheet(t.dataset.id, t.dataset.n); break;
      case 'reactEmoji': { var rt = document.getElementById('reactText'); S.reactDraft = rt ? rt.value : ''; S.reactEmoji = t.dataset.v; reactSheet(S.reactFor.id, S.reactFor.n); break; }
      case 'sendReact': {
        var tx2 = (document.getElementById('reactText') || {}).value || '';
        if (S.reactEmoji || tx2.trim()) enqueue({ type: 'react', sessionId: S.reactFor.id, emoji: S.reactEmoji, text: tx2.trim() });
        S.reactDraft = ''; closeModal(); break;
      }
      case 'reactionSeen': S.seen['re:' + t.dataset.id] = 1; store.set('seen', S.seen); enqueue({ type: 'reactionSeen', id: t.dataset.id }); render(); break;
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
      if (el.dataset.f === 'kg' && !s.done) S.draft.sets.forEach(function (o) { if (o.slot === s.slot && open(o) && o.set > s.set) o.kg = v; });
      store.set('draft', S.draft);
      render();
    }
  });
  app.addEventListener('change', function (ev) {
    if (ev.target.id !== 'photoIn' || !ev.target.files || !ev.target.files[0] || !S.draft) return;
    keepNote();
    S.photoBusy = true; render();
    preparePhoto(ev.target.files[0]).then(function (url) {
      S.photoBusy = false;
      S.draft.photo = url;
      store.set('draft', S.draft);
      render();
    }, function () { S.photoBusy = false; render(); });
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id !== 'avatarIn' || !ev.target.files || !ev.target.files[0]) return;
    S.avatarBusy = true; profileSheet();
    prepareAvatar(ev.target.files[0]).then(function (url) {
      S.avatarBusy = false;
      enqueue({ type: 'profilePhoto', dataUrl: url });
      profileSheet(); render();
    }, function () { S.avatarBusy = false; profileSheet(); });
  });
  app.addEventListener('input', function (ev) {
    if (ev.target.id === 'note' && S.draft) { S.draft.note = ev.target.value; store.set('draft', S.draft); }
  });
  setInterval(function () {
    var c = document.getElementById('clock');
    if (c) c.textContent = elapsed();
    if (S.view === 'flight' && S.draft && !S.draft.timeOffer && elapsedMin() >= 68 && !document.querySelector('.offer.inline [data-act=lastRound]') &&
      document.getElementById('modal').hidden && accessoryOpen(S.draft)) render();
  }, 1000);

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
    if (!S.state.slots) { // the Sheet hasn't been upgraded yet
      app.innerHTML = '<div class="err"><h1>Almost ready</h1><p class="muted">The Sheet needs one update first. Ask your coach to run Flight → Upgrade in the Sheet.</p></div>';
      return;
    }
    var v = S.view || (role() === 'coach' ? 'coach' : 'home');
    if ((v === 'flight' || v === 'landing') && !S.draft) v = 'home';
    if (v === 'coach' && role() !== 'coach') v = 'home';
    S.view = v;
    var html = v === 'home' ? viewHome() : v === 'board' ? viewBoard() : v === 'flight' ? viewFlight() : v === 'landing' ? viewLanding()
      : v === 'log' ? viewLog() : v === 'trip' ? viewTrip() : viewCoach();
    if (v === 'home' || v === 'log' || v === 'coach' || v === 'trip') html += tabsHTML();
    app.innerHTML = html;
  }

  // ---------- boot ----------
  if (!DEMO && 'serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell unavailable */ }); } catch (e) { /* ignore */ }
  }
  if (S.draft && !S.draft.blocks) { S.draft = null; store.del('draft'); } // a draft from the old version
  if (S.draft) S.view = S.draft.finishedAt ? 'landing' : 'flight';
  render();
  if (DEMO || KEY) flush();
  window.FlightApp = { S: S, render: render };
})();
