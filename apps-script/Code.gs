/**
 * Flight TMP → LUX — Google Sheet backend.
 *
 * This project needs three script files:
 *   Code.gs    (this file)
 *   Engine.gs  (generated from web/engine.js)
 *   Core.gs    (generated from web/core.js)
 *
 * Engine.gs and Core.gs are generated from web/ by scripts/build.js and deployed with clasp.
 * Run setup() once on a new Sheet, then use the Flight menu to get her link and yours.
 */

var DATE_COLS = { Sessions: ['id', 'date', 'savedAt'], Sets: ['sessionId', 'date'], Overrides: ['date'], Stamps: ['date'],
  Postcards: ['id', 'openedAt'], Cheers: ['id', 'createdAt', 'seenAt'], Settings: ['value'], Choices: ['at'],
  Reactions: ['id', 'at', 'sessionId', 'seenAt'] };

// ---------- one-time setup ----------

function setup() {
  var ss = SpreadsheetApp.getActive();
  prepareTabs_(ss);
  var settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() < 2) {
    var me = '';
    try { me = Session.getEffectiveUser().getEmail(); } catch (e) { /* no email scope */ }
    var rows = FlightCore.seedSettings({ athleteKey: newKey_(), coachKey: newKey_(), coachEmail: me })
      .map(function (r) { return [r.key, r.value, r.note]; });
    settings.getRange(2, 1, rows.length, 3).setValues(rows);
    settings.setColumnWidth(1, 150); settings.setColumnWidth(2, 300); settings.setColumnWidth(3, 520);
  }
  seedIfEmpty_(ss, 'Slots', FlightCore.seedSlots());
  seedIfEmpty_(ss, 'Exercises', FlightCore.seedExercises());
  seedIfEmpty_(ss, 'Postcards', FlightCore.seedPostcards());
  var pc = ss.getSheetByName('Postcards');
  pc.setColumnWidth(FlightCore.TABS.Postcards.indexOf('message') + 1, 480);
  pc.getRange(2, FlightCore.TABS.Postcards.indexOf('message') + 1, pc.getMaxRows() - 1, 1).setWrap(true);
  var first = ss.getSheets()[0];
  if (ss.getSheets().length > Object.keys(FlightCore.TABS).length && first.getLastRow() === 0 && !FlightCore.TABS[first.getName()]) ss.deleteSheet(first);
  Logger.log('Setup done. Next: Deploy > New deployment > Web app, then put the app address in Settings > appUrl.');
}

/** Creates missing tabs, adds missing columns at the end (never reorders), sets text formats. */
function prepareTabs_(ss) {
  var tabs = FlightCore.TABS;
  Object.keys(tabs).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, tabs[name].length).setValues([tabs[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
      var missing = tabs[name].filter(function (h) { return head.indexOf(h) < 0; });
      if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
    var headNow = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    (DATE_COLS[name] || []).forEach(function (col) {
      var c = headNow.indexOf(col) + 1;
      if (c > 0) sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
}

/**
 * Upgrades a Sheet made with an earlier version to the Heavy/Volume program. Safe to run twice.
 * Keeps sessions, postcards, keys and everything you wrote. The old Program tab is renamed, not deleted.
 */
function upgrade() {
  var ss = SpreadsheetApp.getActive();
  var old = ss.getSheetByName('Program');
  if (old) old.setName('Program (old, unused)');
  prepareTabs_(ss);
  seedIfEmpty_(ss, 'Slots', FlightCore.seedSlots());
  seedIfEmpty_(ss, 'Exercises', FlightCore.seedExercises());
  var data = readAll_(ss);
  var plan = FlightCore.upgradePlan(data);
  var writes = FlightCore.exerciseSync(data).concat(FlightCore.postcardSync(data));
  plan.settings.forEach(function (s) {
    writes.push({ tab: 'Settings', kind: 'setting', key: s.key, value: s.value });
  });
  plan.postcards.forEach(function (p) { writes.push({ tab: 'Postcards', kind: 'patch', by: 'id', value: p.id, patch: p.patch }); });
  applyWrites_(ss, writes);
  // notes for new settings, and mark settings that are no longer used
  var sh = ss.getSheetByName('Settings');
  var values = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 3).getValues();
  values.forEach(function (row, i) {
    var key = String(row[0]).trim();
    var add = plan.settings.filter(function (s) { return s.key === key; })[0];
    if (add && add.note) sh.getRange(i + 2, 3).setValue(add.note);
    if (plan.unused.indexOf(key) >= 0) sh.getRange(i + 2, 3).setValue('No longer used (safe to delete)');
  });
  recalculate_(ss);
  // keep the Postcards tab in route order
  var pc = ss.getSheetByName('Postcards');
  if (pc.getLastRow() > 2) {
    var kmCol = pc.getRange(1, 1, 1, pc.getLastColumn()).getValues()[0].map(String).indexOf('km') + 1;
    if (kmCol > 0) pc.getRange(2, 1, pc.getLastRow() - 1, pc.getLastColumn()).sort(kmCol);
  }
  var pcs = writes.filter(function (w) { return w.tab === 'Postcards'; }).length + plan.postcards.length;
  Logger.log('Upgrade done: ' + plan.settings.length + ' settings, ' + pcs + ' postcards changed.');
  try { ss.toast('Upgrade done, ' + pcs + ' postcards moved or added. Deploy a new version of the web app next.'); } catch (e) { /* run from the editor */ }
}

function seedIfEmpty_(ss, name, rows) {
  var sh = ss.getSheetByName(name);
  if (sh.getLastRow() >= 2) return;
  var head = FlightCore.TABS[name];
  sh.getRange(2, 1, rows.length, head.length).setValues(rows.map(function (r) { return head.map(function (h) { return toCell_(r[h]); }); }));
}

function newKey_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

// ---------- Sheet menu ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Flight')
    .addItem('Show app links', 'showLinks')
    .addItem('Recalculate flight columns', 'recalculate')
    .addItem('Upgrade to the Heavy/Volume program', 'upgrade')
    .addItem('Send a test landing email', 'testEmail')
    .addToUi();
}

function showLinks() {
  var ui = SpreadsheetApp.getUi();
  var s = readAll_(SpreadsheetApp.getActive()).settings;
  var base = String(s.appUrl || '').trim();
  if (!base) { ui.alert('Add the app address (your GitHub Pages URL) to Settings > appUrl first.'); return; }
  var sep = base.indexOf('?') >= 0 ? '&' : '?';
  ui.alert('App links',
    'Her link (send this to her):\n' + base + sep + 'k=' + s.athleteKey + '\n\n' +
    'Your coach link:\n' + base + sep + 'k=' + s.coachKey + '\n\n' +
    'Changing a key in Settings makes the old link stop working.', ui.ButtonSet.OK);
}

function recalculate() {
  var res = recalculate_(SpreadsheetApp.getActive());
  SpreadsheetApp.getActive().toast('Recalculated ' + res.sessions.length + ' workouts. Plane at ' + Math.round(res.cumKm) + ' km.');
}

function recalculate_(ss) {
  var data = readAll_(ss);
  var names = {};
  data.exercises.forEach(function (e) { names[String(e.id)] = String(e.name); });
  var res = FlightEngine.replay(FlightCore.toEngineInput(data));
  applyWrites_(ss, res.sessions.map(function (c) {
    return { tab: 'Sessions', kind: 'patch', by: 'id', value: c.id, patch: { week: c.week, reps: c.reps, km: c.km, cumKm: c.cumKm,
      volumeKg: c.volume, upgrades: c.upgrades.map(function (id) { return names[id] || id; }).join(', '), completed: c.completed } };
  }));
  return res;
}

function testEmail() {
  var data = readAll_(SpreadsheetApp.getActive());
  sendMail_(data, { subject: '✈ Test: workout reports work', body: 'This is how reports will arrive after each of her workouts.' });
}

// ---------- web app ----------

function doGet(e) { return handle_((e && e.parameter) || {}, null); }

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  return handle_(body, body.ops || []);
}

function handle_(params, ops) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var ss = SpreadsheetApp.getActive();
    var data = readAll_(ss);
    var key = String(params.k || '');
    var role = key.length >= 20 && key === String(data.settings.athleteKey) ? 'athlete'
      : key.length >= 20 && key === String(data.settings.coachKey) ? 'coach' : null;
    if (!role) return json_({ ok: false, error: 'bad_key' });

    if (params.a === 'photo') return json_(readPhoto_(data, String(params.id || '')));

    var notes = [], skipped = [], photos = {};
    (ops || []).slice(0, 50).forEach(function (op) {
      try {
        var out = FlightCore.applyOp(data, op, role, new Date().toISOString());
        applyWrites_(ss, out.writes);
        if (out.notify) notes.push(out.notify);
        if (out.photo) photos[out.photo.sessionId] = savePhoto_(ss, data, out.photo);
      } catch (err) {
        skipped.push((op && op.type) + ': ' + err.message);
      }
    });
    if (ops && ops.length) SpreadsheetApp.flush();

    var today = /^\d{4}-\d{2}-\d{2}$/.test(String(params.today || '')) ? params.today
      : Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var state = FlightCore.buildState(data, role, today);
    if (role === 'coach') state.settings.sheetUrl = ss.getUrl();
    notes.forEach(function (n) {
      var ph = photos[n.sessionId];
      if (ph) { delete photos[n.sessionId]; n.attachments = [ph]; n.body += '\n\nHer photo is attached :)'; }
      sendMail_(data, n);
    });
    Object.keys(photos).forEach(function (id) {
      sendMail_(data, { subject: '📷 Photo from her workout', body: 'She added a photo to the workout of ' + id.slice(0, 10) + '.', attachments: [photos[id]] });
    });
    return json_({ ok: true, state: state, skipped: skipped });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e) { /* not held */ }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sendMail_(data, note) {
  var to = String(data.settings.coachEmail || '').trim();
  if (!to || !note) return;
  try { MailApp.sendEmail(to, note.subject, note.body, note.attachments ? { attachments: note.attachments } : {}); } catch (e) { console.warn('mail failed: ' + e.message); }
}

// ---------- workout photos (private Drive folder, never shared) ----------

function photoFolder_() {
  var it = DriveApp.getFoldersByName('Flight photos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Flight photos');
}

/** Saves the photo, links it from the Sessions row, returns the image blob for the email. */
function savePhoto_(ss, data, ph) {
  var m = ph.dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], ph.sessionId + '.jpg');
  var file = photoFolder_().createFile(blob);
  applyWrites_(ss, [{ tab: 'Sessions', kind: 'patch', by: 'id', value: ph.sessionId, patch: { photo: file.getId() } }]);
  data.sessions.forEach(function (r) { if (String(r.id) === ph.sessionId) r.photo = file.getId(); });
  return blob;
}

function readPhoto_(data, sessionId) {
  var row = data.sessions.filter(function (r) { return String(r.id) === sessionId; })[0];
  if (!row || !row.photo) return { ok: false, error: 'no_photo' };
  var blob = DriveApp.getFileById(String(row.photo)).getBlob();
  return { ok: true, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

// ---------- reading and writing the tabs ----------

function readAll_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var data = {};
  Object.keys(FlightCore.TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var rows = [];
    if (sh && sh.getLastRow() >= 2) {
      var values = sh.getDataRange().getValues();
      var head = values[0].map(String);
      for (var i = 1; i < values.length; i++) {
        var o = {}, empty = true;
        for (var j = 0; j < head.length; j++) {
          if (!head[j]) continue;
          var v = values[i][j];
          if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
          if (v !== '' && v !== null) empty = false;
          o[head[j]] = v;
        }
        if (!empty) rows.push(o);
      }
    }
    data[FlightCore.KEY[name]] = rows;
  });
  var map = {};
  data.settings.forEach(function (r) { if (r.key) map[String(r.key).trim()] = r.value; });
  data.settings = map;
  return data;
}

function toCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function applyWrites_(ss, writes) {
  var i = 0;
  while (i < writes.length) {
    var w = writes[i];
    var sh = ss.getSheetByName(w.tab);
    if (!sh) { prepareTabs_(ss); sh = ss.getSheetByName(w.tab); } // a tab added in a newer version
    var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);

    if (w.kind === 'append') {
      // batch consecutive appends to the same tab into one write
      var rows = [];
      while (i < writes.length && writes[i].kind === 'append' && writes[i].tab === w.tab) {
        var r = writes[i].row;
        rows.push(head.map(function (h) { return toCell_(r[h]); }));
        i++;
      }
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
      continue;
    }

    var tz = ss.getSpreadsheetTimeZone();
    var values = (sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues() : [])
      .map(function (row) { return row.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v; }); });
    var col = function (name) { return head.indexOf(name); };

    if (w.kind === 'upsert') {
      var bi = col(w.by), found = -1;
      for (var a = 0; a < values.length; a++) if (String(values[a][bi]) === String(w.row[w.by])) { found = a; break; }
      var line = head.map(function (h) { return toCell_(w.row[h]); });
      if (found >= 0) sh.getRange(found + 2, 1, 1, head.length).setValues([line]);
      else sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setValues([line]);
    } else if (w.kind === 'patch') {
      var tabCols = FlightCore.TABS[w.tab] || [];
      if (Object.keys(w.patch).some(function (k) { return col(k) < 0 && tabCols.indexOf(k) >= 0; })) {
        prepareTabs_(ss); // a column from a newer version, before Flight -> Upgrade was run
        head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
        values = values.map(function (row) { while (row.length < head.length) row.push(''); return row; });
      }
      var pi = col(w.by);
      for (var b = 0; b < values.length; b++) {
        if (String(values[b][pi]) !== String(w.value)) continue;
        Object.keys(w.patch).forEach(function (k) {
          var c = col(k);
          if (c >= 0) sh.getRange(b + 2, c + 1).setValue(toCell_(w.patch[k]));
        });
      }
    } else if (w.kind === 'deleteWhere' || w.kind === 'deleteWhere2') {
      var cols = w.kind === 'deleteWhere' ? [w.col] : w.cols, vals = w.kind === 'deleteWhere' ? [w.value] : w.values;
      var idx = cols.map(col);
      for (var d = values.length - 1; d >= 0; d--) {
        var match = idx.every(function (ci, n) { return String(values[d][ci]) === String(vals[n]); });
        if (!match) continue;
        var end = d; // delete contiguous runs in one call
        while (d - 1 >= 0 && idx.every(function (ci, n) { return String(values[d - 1][ci]) === String(vals[n]); })) d--;
        sh.deleteRows(d + 2, end - d + 1);
      }
    } else if (w.kind === 'setting') {
      var ki = col('key'), vi = col('value'), done = false;
      for (var s = 0; s < values.length; s++) {
        if (String(values[s][ki]).trim() === w.key) { sh.getRange(s + 2, vi + 1).setValue(w.value); done = true; break; }
      }
      if (!done) sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setValues([[w.key, w.value]]);
    }
    i++;
  }
}