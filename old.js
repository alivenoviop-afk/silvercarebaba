/* SilverCare БАБУШКИНА АПТЕЧКА — old.js
   Только HTML/CSS/Vanilla JS. Без сборки, без бэкенда.
   Весь текст русский. Везде try/catch. */
(function () {
'use strict';
var BUILD = '20260919-f'; // сборка: сверяй с опекуном, должна совпадать
var LOCKED_FAMILY = '6092-4nhl'; // зафиксированный код: держим только его

/* ---------- Помощники ---------- */
function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }
function isDemo() { try { return new URLSearchParams(window.location.search).get('demo') === '1'; } catch (e) { return false; } }
function isFileProto() { try { return window.location.protocol === 'file:'; } catch (e) { return false; } }
function todayKey() { try { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } catch (e) { return 'day'; } }
function nowHM() { try { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); } catch (e) { return '00:00'; } }
function isToday(m) {
  try {
    if (!m || !m.days || m.days.length >= 7) return true; // без дней = каждый день
    return m.days.indexOf(new Date().getDay()) !== -1;
  } catch (e) { return true; }
}
function status(t) { try { var el = $('status'); if (el) el.textContent = t; } catch (e) {} }

/* ---------- Состояние ---------- */
var K_FAM = 'silver_family', K_V = 'silver_v', K_MEDS = 'silver_meds',
    K_OUT = 'silver_outbox', K_SEEN = 'silver_seen', K_FIRED = 'silver_fired';
var meds = [];
var family = '';
var lastMed = null;
var lastText = '';
var soundOn = false;
var audioCtxUnlocked = false;

function getFamily() { try { return localStorage.getItem(K_FAM) || ''; } catch (e) { return family || ''; } }
function setFamily(f) { try { family = f; localStorage.setItem(K_FAM, f); } catch (e) { family = f; } }
function getV() { try { return parseInt(localStorage.getItem(K_V) || '0', 10) || 0; } catch (e) { return 0; } }
function setV(v) { try { localStorage.setItem(K_V, String(v)); } catch (e) {} }
function getMeds() { try { var s = localStorage.getItem(K_MEDS); return s ? JSON.parse(s) : []; } catch (e) { return []; } }
function setMeds(m) { try { localStorage.setItem(K_MEDS, JSON.stringify(m)); } catch (e) {} }
var lastLocalV = 0;
function onLocalSync() {
  try { // опекун на том же адресе что-то поменял: перерисовать без перезагрузки
    family = getFamily();
    var nv = getV();
    meds = getMeds();
    render();
    if (nv > lastLocalV) {
      lastLocalV = nv;
      speak('Новые лекарства получены!');
      status('Новые лекарства получены! Версия ' + nv);
    }
  } catch (e) {}
}

/* Дебаунс локального зеркала: опекун пишет 3 ключа подряд */
var localSyncT = null;
function scheduleLocalSync() {
  try {
    if (localSyncT) clearTimeout(localSyncT);
    localSyncT = setTimeout(function () { try { onLocalSync(); } catch (e) {} }, 400);
  } catch (e) {}
}

/* Топики: коды разные в обе стороны. Свой ящик (Deck+туннель) — вписать сюда ОДИН раз */
var NTFY_BASE = 'https://advice-apache-suspension-portion.trycloudflare.com';
var downCoolUntil = 0; // backoff: ящик сказал 429 — не долбим 5 минут
function downUrl(f) { return NTFY_BASE + '/silvercare-' + encodeURIComponent(f) + '-down'; }
function upUrl(f) { return NTFY_BASE + '/silvercare-' + encodeURIComponent(f) + '-up'; }

/* ---------- Речь (бесплатно, встроенная) ---------- */
function speak(text, onend) {
  try {
    lastText = text;
    if (!soundOn) { try { if (onend) onend(); } catch (e) {} return; }
    if (!('speechSynthesis' in window)) { try { if (onend) onend(); } catch (e) {} return; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU'; u.rate = 0.9; u.volume = 1; u.pitch = 1;
    try {
      u.onend = function () { try { if (onend) onend(); } catch (e) {} };
      u.onerror = function () { try { if (onend) onend(); } catch (e) {} };
    } catch (e) {}
    try {
      var vs = window.speechSynthesis.getVoices();
      for (var i = 0; i < vs.length; i++) {
        if (vs[i] && vs[i].lang && vs[i].lang.toLowerCase().indexOf('ru') === 0) { u.voice = vs[i]; break; }
      }
    } catch (e) {}
    window.speechSynthesis.speak(u);
  } catch (e) { try { if (onend) onend(); } catch (x) {} }
}
function speakWait(text) {
  try { // промис: резолвится когда фраза договорилась до конца
    return new Promise(function (res) {
      try { speak(text, function () { try { res(true); } catch (e) {} }); } catch (e) { try { res(true); } catch (x) {} }
    });
  } catch (e) { return Promise.resolve(true); }
}

/* Голос опекуна: voiceUrl -> voiceBase64 -> IndexedDB -> синтез */
var idb = null;
function idbOpen() {
  try {
    return new Promise(function (res) {
      try {
        var r = indexedDB.open('silvercare', 1);
        r.onupgradeneeded = function () { try { r.result.createObjectStore('voices'); } catch (e) {} };
        r.onsuccess = function () { idb = r.result; res(idb); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  } catch (e) { return Promise.resolve(null); }
}
function idbSet(key, val) {
  try {
    return idbOpen().then(function (db) {
      try {
        if (!db) return;
        var tx = db.transaction('voices', 'readwrite');
        tx.objectStore('voices').put(val, 'voice-' + key);
      } catch (e) {}
    });
  } catch (e) { return Promise.resolve(); }
}
function idbGet(key) {
  try {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        try {
          if (!db) { res(null); return; }
          var tx = db.transaction('voices', 'readonly');
          var q = tx.objectStore('voices').get('voice-' + key);
          q.onsuccess = function () { res(q.result || null); };
          q.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  } catch (e) { return Promise.resolve(null); }
}

var curAudio = null;
function playAudioSrc(src) {
  try {
    return new Promise(function (res, rej) {
      try {
        if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; }
        var a = new Audio(src);
        try { a.volume = 1; a.muted = false; } catch (e) {}
        curAudio = a;
        a.onended = function () { res(true); };
        a.onerror = function () { rej(new Error('audio')); };
        var p = a.play();
        if (p && p.catch) p.catch(function (e) { rej(e); });
      } catch (e) { rej(e); }
    });
  } catch (e) { return Promise.reject(e); }
}

function playMedVoice(m) {
  try {
    lastMed = m;
    var label = voiceLabel(m);
    var src = m.voiceUrl || m.voiceBase64 || null;
    if (src) {
      return playAudioSrc(src).catch(function () {
        try {
          return idbGet(m.id).then(function (saved) {
            if (saved && saved !== src) return playAudioSrc(saved);
            throw new Error('no-idb');
          }).catch(function () { return speakWait(label); });
        } catch (e) { return speakWait(label); }
      });
    }
    try {
      return idbGet(m.id).then(function (saved) {
        if (saved) return playAudioSrc(saved).catch(function () { return speakWait(label); });
        return speakWait(label);
      }).catch(function () { return speakWait(label); });
    } catch (e) { return speakWait(label); }
  } catch (e) { return speakWait('Время пить лекарство!'); }
}

/* ---------- ВНИЗ: syncDown каждые 30 сек ---------- */
function seenAdd(id) {
  try {
    var s = [];
    try { s = JSON.parse(localStorage.getItem(K_SEEN) || '[]'); } catch (e) { s = []; }
    if (s.indexOf(id) === -1) { s.push(id); if (s.length > 200) s = s.slice(-200); localStorage.setItem(K_SEEN, JSON.stringify(s)); }
  } catch (e) {}
}
function extractPacket(obj) {
  try {
    if (!obj) return null;
    if (obj.meds && (obj.v !== undefined)) return obj;                       // прямой пакет
    if (obj.message) { try { var m = JSON.parse(obj.message); if (m && m.meds) return m; } catch (e) {} }
    return null;
  } catch (e) { return null; }
}
function medsKey(v, meds) {
  try { // отпечаток пакета: лечит залипание версий (старая цифра + новое содержимое)
    var s = JSON.stringify(meds || []);
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return v + ':' + (h >>> 0);
  } catch (e) { return String(v) + ':0'; }
}
function applyPacket(pkt) {
  try {
    if (!pkt || !pkt.meds || !Array.isArray(pkt.meds)) return false;
    var v = parseInt(pkt.v || 0, 10) || 0;
    var key = medsKey(v, pkt.meds);
    var oldKey = '';
    try { oldKey = localStorage.getItem('silver_key') || ''; } catch (e) {}
    if (v <= getV() && getMeds().length > 0 && key === oldKey) return false;
    if (pkt.family) setFamily(pkt.family);
    setV(v);
    try { localStorage.setItem('silver_key', key); } catch (e) {}
    try { lastLocalV = v; } catch (e) {}
    setMeds(pkt.meds);
    meds = pkt.meds;
    pkt.meds.forEach(function (m) {
      try { if (m && m.id && m.voiceBase64) idbSet(m.id, m.voiceBase64); } catch (e) {}
    });
    try { if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
    render();
    speak('Новые лекарства получены!');
    status('Новые лекарства получены! Версия ' + v);
    return true;
  } catch (e) { return false; }
}
function syncDown() {
  try {
    var f = getFamily();
    if (!f) return Promise.resolve(false);
    try { if (Date.now() < downCoolUntil) return Promise.resolve('cool'); } catch (e) {}
    var cands = [f]; // полный код + короткий: какой бы ни ввели — найдём
    try { var h = String(f).split('-')[0]; if (h && h !== f) cands.push(h); } catch (e) {}
    var anyNetOk = false;
    var chain = Promise.resolve(false);
    cands.forEach(function (fam) {
      chain = chain.then(function (found) {
        if (found) return true;
        return fetch(downUrl(fam) + '/json?poll=1', { method: 'GET', cache: 'no-store' }).then(function (r) {
          if (r.status === 429) { try { downCoolUntil = Date.now() + 5 * 60 * 1000; } catch (e) {} throw new Error('http 429'); }
          if (!r.ok) throw new Error('http ' + r.status);
          return r.text();
        }).then(function (txt) {
          try {
            anyNetOk = true;
        var best = null;
        var items = [];
        try {
          var parsed = JSON.parse(txt);
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          items = txt.split('\n').map(function (ln) { try { return JSON.parse(ln); } catch (x) { return null; } }).filter(Boolean);
        }
        items.forEach(function (it) {
          try {
            var p = extractPacket(it);
            if (p && (!best || (parseInt(p.v || 0, 10) > parseInt(best.v || 0, 10)))) best = p;
          } catch (e) {}
        });
        if (best) {
          if (applyPacket(best)) return true;
          return false;
        }
        // дубли по id игнорируем
        try {
          items.forEach(function (it) { try { if (it && it.id) seenAdd(String(it.id)); } catch (e) {} });
        } catch (e) {}
        return false;
      } catch (e) { return false; }
    }).catch(function () { return false; });
      });
    });
    return chain.then(function (r) { return r ? true : (anyNetOk ? false : 'net'); }).catch(function () { return 'net'; });
  } catch (e) { return Promise.resolve(false); }
}

/* ---------- ВВЕРХ: publishUp + outbox ---------- */
function outboxRead() { try { return JSON.parse(localStorage.getItem(K_OUT) || '[]'); } catch (e) { return []; } }
function outboxWrite(a) { try { if (Array.isArray(a) && a.length > 100) a = a.slice(-100); localStorage.setItem(K_OUT, JSON.stringify(a)); } catch (e) {} }
function logLocalUp(entry) {
  try { // зеркало для вкладки опекуна на том же адресе: журнал мгновенно, без ntfy
    var a = []; try { a = JSON.parse(localStorage.getItem('silver_up_log') || '[]'); } catch (e) { a = []; }
    a.push(entry); if (a.length > 100) a = a.slice(-100);
    localStorage.setItem('silver_up_log', JSON.stringify(a));
  } catch (e) {}
}
function publishUp(type, medId) {
  try {
    var f = getFamily();
    if (!f) return Promise.resolve(false);
    var entry = { family: f, type: type, medId: medId || '', at: new Date().toISOString(), id: (medId || type) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) };
    var box = outboxRead();
    box.push(entry);
    outboxWrite(box);
    try { logLocalUp(entry); } catch (e) {}
    return flushOutbox();
  } catch (e) { return Promise.resolve(false); }
}
function flushOutbox() {
  try {
    var f = getFamily();
    if (!f) return Promise.resolve(false);
    var box = outboxRead();
    if (!box.length) return Promise.resolve(true);
    if (!navigator.onLine) return Promise.resolve(false);
    var chain = Promise.resolve(true);
    var left = [];
    box.forEach(function (entry) {
      chain = chain.then(function () {
        var url;
        try { url = upUrl((entry && entry.family) || f); } catch (e) { url = upUrl(f); }
        var req = function (mm) { return fetch(url, { method: mm, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }); };
        return req('PUT').then(function (r) { if (!r || !r.ok) throw new Error('bad-put'); })
          .catch(function () { return req('POST').then(function (r2) { if (!r2 || !r2.ok) throw new Error('bad-post'); }); })
          .catch(function () { left.push(entry); });
      });
    });
    return chain.then(function () { outboxWrite(left); status(left.length ? 'Нет сети. Сохранено: ' + left.length : 'Отправлено!'); return left.length === 0; })
      .catch(function () { return false; });
  } catch (e) { return Promise.resolve(false); }
}

/* ---------- Экран: часы, список ---------- */
var colorMap = { blue: '#0066FF', red: '#FF0000', green: '#00AA00', yellow: '#FFD800', orange: '#FF8800', pink: '#FF66CC', white: '#FFFFFF' };
var colorRu = { blue: 'синяя', red: 'красная', green: 'зелёная', yellow: 'жёлтая', white: 'белая', orange: 'оранжевая', pink: 'розовая' };
function pillColorRu(c) { try { return colorRu[c] || ''; } catch (e) { return ''; } }
var UNIT_FORMS = {
  'штука': ['штука', 'штуки', 'штук'], 'флакон': ['флакон', 'флакона', 'флаконов'],
  'стаканчик': ['стаканчик', 'стаканчика', 'стаканчиков'], 'капля': ['капля', 'капли', 'капель'],
  'ложка': ['ложка', 'ложки', 'ложек'], 'вдох': ['вдох', 'вдоха', 'вдохов']
};
function pluralRu(n, forms) {
  try {
    if (Math.abs(n % 1) > 0.001) return forms[1];
    var a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return forms[0];
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms[1];
    return forms[2];
  } catch (e) { return forms[0]; }
}
function unitWord(unit, qty) {
  try { var f = UNIT_FORMS[unit] || [unit, unit, unit]; return pluralRu(parseFloat(qty) || 0, f); } catch (e) { return unit || ''; }
}
function actionPhrase(m) {
  try {
    var k = (m && m.kind) || 'pill';
    if (k === 'inhal') return 'Время делать ингаляцию!';
    if (k === 'gargle') return 'Время полоскать горло!';
    if (k === 'custom') { try { return (String(m.action || '').trim()) || 'Время по расписанию!'; } catch (e) { return 'Время по расписанию!'; } }
    return 'Время пить лекарство!';
  } catch (e) { return 'Время пить лекарство!'; }
}
function voiceLabel(m) {
  try { // как скажет опекун: действие + название + количество + цвет
    var head = actionPhrase(m);
    var name = (m && m.name) || '';
    var k = (m && m.kind) || 'pill';
    var qtyPart = '';
    try {
      if (m && m.qty !== undefined && m.qty !== null && String(m.qty) !== '') {
        var q = parseFloat(String(m.qty).replace(',', '.'));
        if (!isNaN(q)) qtyPart = String(m.qty) + ' ' + unitWord(m.unit || 'штука', q);
      }
    } catch (e) {}
    if (!qtyPart) { try { qtyPart = (m && m.dose) || ''; } catch (e) {} }
    var colorBit = '';
    try { if (k === 'pill' && m.color) { var pcx = pillColorRu(m.color); if (pcx) colorBit = ', ' + pcx; } } catch (e) {}
    return (head + (name ? ' ' + name : '') + (qtyPart ? ', ' + qtyPart : '') + colorBit + '.').replace(/\s+/g, ' ').trim();
  } catch (e) { return 'Время пить лекарство!'; }
}
function tickClock() {
  try {
    var c = $('clock'); if (c) c.textContent = nowHM();
  } catch (e) {}
}
function demoShift(list) {
  try {
    if (!isDemo() || !list.length) return list;
    var d = new Date(Date.now() + 60000);
    var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var copy = JSON.parse(JSON.stringify(list));
    copy.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
    copy[0].time = hm; // ближайшее = сейчас+1мин для жюри
    return copy;
  } catch (e) { return list; }
}
function render() {
  try {
    var f = getFamily();
    var fl = $('familyLine');
    if (fl) fl.textContent = 'Семья: ' + (f ? f : '—');
    var setup = $('setup');
    var ul = $('meds');
    var shown = demoShift(meds.filter(isToday));
    if (!f) { if (setup) setup.hidden = false; }
    else { if (setup) setup.hidden = true; }
    if (ul) {
      ul.innerHTML = '';
      if (!shown.length) {
        var li = document.createElement('li');
        li.innerHTML = '<div><div class="med-name">Пока нет лекарств</div><div class="med-dose">Опекун пришлёт их сюда</div></div>';
        ul.appendChild(li);
      } else {
        shown.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
        shown.forEach(function (m) {
          try {
            var li2 = document.createElement('li');
            var dot = document.createElement('div');
            dot.className = 'med-dot';
            dot.style.background = colorMap[m.color] || '#0066FF';
            var box = document.createElement('div');
            var t = document.createElement('div'); t.className = 'med-time'; t.textContent = m.time || '--:--';
            var n2 = document.createElement('div'); n2.className = 'med-name'; n2.textContent = m.name || 'Лекарство';
            var dz = document.createElement('div'); dz.className = 'med-dose'; dz.textContent = m.dose || '';
            box.appendChild(t); box.appendChild(n2); box.appendChild(dz);
            li2.appendChild(dot); li2.appendChild(box);
            ul.appendChild(li2);
          } catch (e) {}
        });
      }
    }
  } catch (e) {}
}

function toMin(hm) { try { var p = String(hm || '').split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); } catch (e) { return -99999; } }

/* ---------- ГРОМКОСТЬ ПО МАКСИМУМУ: сирена + уведомление на заблокированный экран ---------- */
var sirenCtx = null, sirenOsc = null, sirenGain = null, sirenTimer = null;
function warmAudio() {
  try { // греем AudioContext заранее, пока был жест пользователя
    try { if ('audioSession' in navigator) navigator.audioSession.type = 'playback'; } catch (e) {}
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!sirenCtx) { try { sirenCtx = new AC(); } catch (e) { return; } }
    try { var pr = sirenCtx.resume(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
  } catch (e) {}
}
function startSiren() {
  try { // двухтональная сирена поверх голоса: "орать громче" после пропуска
    stopSiren();
    if (!sirenCtx) warmAudio();
    if (!sirenCtx) return;
    try { var pr2 = sirenCtx.resume(); if (pr2 && pr2.catch) pr2.catch(function () {}); } catch (e) {}
    sirenOsc = sirenCtx.createOscillator();
    sirenGain = sirenCtx.createGain();
    try { sirenGain.gain.value = 1.0; } catch (e) {}
    try { sirenOsc.type = 'square'; sirenOsc.frequency.value = 880; } catch (e) {}
    try { sirenOsc.connect(sirenGain); sirenGain.connect(sirenCtx.destination); } catch (e) { return; }
    try { sirenOsc.start(); } catch (e) { return; }
    var hi = false;
    sirenTimer = setInterval(function () { try { hi = !hi; sirenOsc.frequency.value = hi ? 1174 : 880; } catch (e) {} }, 400);
  } catch (e) {}
}
function stopSiren() {
  try { if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; } } catch (e) { sirenTimer = null; }
  try { if (sirenOsc) { try { sirenOsc.stop(); } catch (e) {} sirenOsc = null; } } catch (e) { sirenOsc = null; }
}
function loudNotify(title, body) {
  try { // баннер долетает даже до заблокированного экрана (Android), там же вибрация
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    var opts = { body: body, tag: 'silver-alarm', requireInteraction: true, renotify: true, vibrate: [1000, 500, 1000], actions: [{ action: 'taken', title: '✓ Я ВЫПИЛ' }] };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) {
          try { reg.showNotification(title, opts); } catch (e) { try { new Notification(title, opts); } catch (x) {} }
        }).catch(function () { try { new Notification(title, opts); } catch (e) {} });
      } else { new Notification(title, opts); }
    } catch (e) {}
  } catch (e) {}
}

var vibT = null;
function vib(p) {
  try { // вибрация + её видимый двойник (видно в эмуляторе и на проекторе)
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
    var total = 500;
    try {
      if (Array.isArray(p)) { total = 0; for (var i = 0; i < p.length; i++) total += p[i] || 0; }
    } catch (e) {}
    var d = $('vibDot');
    if (d) {
      d.classList.add('on');
      if (vibT) clearTimeout(vibT);
      vibT = setTimeout(function () { try { d.classList.remove('on'); } catch (e) {} }, Math.min(Math.max(total, 400), 5000));
    }
  } catch (e) {}
}
function keepAwake() {
  try { // держать экран включённым, пока страница открыта
    if (navigator.wakeLock && navigator.wakeLock.request && !document.hidden) {
      navigator.wakeLock.request('screen').catch(function () {});
    }
  } catch (e) {}
}

/* ---------- СВЁРНУТ: неснимаемое уведомление в шторке + догонялка ---------- */
var hbSrc = null;
function nextPillText() {
  try {
    var hm = nowHM();
    var list = meds.filter(isToday).filter(function (m) { return String(m.time || '') >= hm; });
    list.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
    if (!list.length) return 'На сегодня всё! Молодец!';
    return 'Следующая: ' + list[0].time + ' ' + (list[0].name || 'лекарство');
  } catch (e) { return ''; }
}
function startHeart() {
  try { // бесшумное сердцебиение: держит аудиосессию живой в фоне
    warmAudio();
    if (!sirenCtx || hbSrc) return;
    var len = sirenCtx.sampleRate * 2;
    var buf = sirenCtx.createBuffer(1, len, sirenCtx.sampleRate);
    hbSrc = sirenCtx.createBufferSource();
    hbSrc.buffer = buf; hbSrc.loop = true;
    hbSrc.connect(sirenCtx.destination);
    hbSrc.start();
  } catch (e) {}
}
function stopHeart() {
  try { if (hbSrc) { try { hbSrc.stop(); } catch (e) {} hbSrc = null; } } catch (e) { hbSrc = null; }
}
function watchNotify() {
  try { // неснимаемый дежурный в шторке: свернула — напоминание висит
    if (!soundOn) return;
    var body = '';
    try { body = nextPillText(); } catch (e) {}
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        try {
          reg.showNotification('SilverCare дежурит', { body: body || 'Напоминания включены', tag: 'silver-watch', requireInteraction: true, silent: true });
        } catch (e) {}
      }).catch(function () {});
    }
  } catch (e) {}
}
function watchHide() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        try {
          reg.getNotifications({ tag: 'silver-watch' }).then(function (list) {
            try { list.forEach(function (n) { try { n.close(); } catch (e) {} }); } catch (e) {}
          }).catch(function () {});
        } catch (e) {}
      }).catch(function () {});
    }
    try { diag(); } catch (e) {}
  } catch (e) {}
}
function diag() {
  try { // техстрока для поддержки: семья, версия, ящик, сборка
    var el = $('diag');
    if (el) el.textContent = 'Семья ' + (family || '—') + ' • v' + getV() + ' • ' + String(NTFY_BASE || '').replace('https://', '') + ' • ' + BUILD;
  } catch (e) {}
}

/* ---------- АЛАРМ ---------- */
var alarmQueue = [];
var alarmActive = false;
var alarmMed = null;
var voiceTimer = null, blinkTimer = null, missedTimer = null, vibTimer = null, blinkOn = false;
var voiceGen = 0;
function voiceLoop() {
  try { // каждый звук договаривается до конца, потом пауза 1.5 сек — ничего не обрезается
    if (!alarmActive || !alarmMed) return;
    var g = ++voiceGen, m = alarmMed, settled = false;
    var done = function () {
      try {
        if (settled || g !== voiceGen || !alarmActive) return;
        settled = true;
        voiceTimer = setTimeout(function () { try { voiceLoop(); } catch (e) {} }, 1500);
      } catch (e) {}
    };
    try {
      var r = playMedVoice(m);
      if (r && r.then) r.then(function () { done(); }).catch(function () { done(); });
      else done();
    } catch (e) { done(); }
    setTimeout(function () { try { done(); } catch (e) {} }, 25000); // страховка от зависшего звука
  } catch (e) {}
}
var recog = null;

function firedToday(medId, time) {
  try {
    var k = K_FIRED + '-' + todayKey();
    var s = []; try { s = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { s = []; }
    return s.indexOf(medId + '@' + time) !== -1;
  } catch (e) { return false; }
}
function markFired(medId, time) {
  try {
    var k = K_FIRED + '-' + todayKey();
    var s = []; try { s = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { s = []; }
    s.push(medId + '@' + time);
    localStorage.setItem(k, JSON.stringify(s));
    try { // чистим метки старше 3 дней, иначе копятся вечно
      var now2 = new Date(); now2.setHours(0, 0, 0, 0);
      var drop = [];
      for (var j = 0; j < localStorage.length; j++) {
        try {
          var kk2 = localStorage.key(j);
          if (!kk2 || kk2.indexOf(K_FIRED + '-') !== 0 || kk2 === k) continue;
          var dd2 = new Date(kk2.slice((K_FIRED + '-').length) + 'T00:00:00');
          if (isNaN(dd2.getTime()) || (now2 - dd2) >= 3 * 24 * 60 * 60 * 1000) drop.push(kk2);
        } catch (e) {}
      }
      drop.forEach(function (kk3) { try { localStorage.removeItem(kk3); } catch (e) {} });
    } catch (e) {}
  } catch (e) {}
}
function checkTime() {
  try {
    if (!meds.length || !soundOn) return;
    var shown = demoShift(meds.filter(isToday));
    var hm = nowHM();
    var nowMin = toMin(hm);
    shown.forEach(function (m) {
      try {
        var late = nowMin - toMin(m.time || ''); // окно 10 мин: догоняем, если вкладка спала
        if (late >= 0 && late <= 10 && !firedToday(m.id, m.time)) {
          markFired(m.id, m.time);
          // найти оригинал по id (голос/название)
          var orig = meds.filter(function (x) { return x.id === m.id; })[0] || m;
          orig = JSON.parse(JSON.stringify(orig)); orig.time = m.time;
          queueAlarm(orig);
        }
      } catch (e) {}
    });
  } catch (e) {}
}
function reportSkipped() {
  try { // задний отчёт: время+10мин прошло, а taken/missed нет — шлём missed
    if (!getFamily() || !meds.length) return;
    var nowMin = toMin(nowHM());
    var log = []; try { log = JSON.parse(localStorage.getItem('silver_up_log') || '[]'); } catch (e) { log = []; }
    var cutoff = Date.now() - 12 * 60 * 60 * 1000;
    meds.filter(isToday).forEach(function (m) {
      try {
        var late = nowMin - toMin(m.time || '');
        if (!(late > 10)) return; // окно ещё живо — разберётся аларм
        var done = log.some(function (e) {
          try { return e && e.medId === m.id && (e.type === 'taken' || e.type === 'missed') && Date.parse(e.at) >= cutoff; } catch (x) { return false; }
        });
        if (!done) publishUp('missed', m.id);
      } catch (e) {}
    });
  } catch (e) {}
}
function queueAlarm(m) {
  try {
    var dup = alarmQueue.filter(function (x) { return x.id === m.id && x.time === m.time; });
    if (dup.length) return;
    if (alarmActive && alarmMed && alarmMed.id === m.id) return;
    alarmQueue.push(m);
    if (!alarmActive) nextAlarm();
    else speak('Ещё одно лекарство скоро!');
  } catch (e) {}
}
function nextAlarm() {
  try {
    if (!alarmQueue.length) return;
    fireAlarm(alarmQueue.shift());
  } catch (e) {}
}
function fireAlarm(m) {
  try {
    alarmActive = true; alarmMed = m; lastMed = m;
    try { // объявляем системе медиасессию: фон с медиа душат в последнюю очередь
      if ('mediaSession' in navigator && window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Время пить лекарство!', artist: 'SilverCare', album: (m.name || '') + ' ' + (m.dose || '') });
      }
    } catch (e) {}
    var al = $('alarm'); if (al) { al.style.display = 'block'; al.classList.add('show'); }
    var nm = $('alarmName'); if (nm) nm.textContent = m.name || 'Лекарство';
    var dz = $('alarmDose'); if (dz) { var pc2 = '', k2 = 'pill'; try { k2 = m.kind || 'pill'; } catch (e) {} try { if (k2 === 'pill') pc2 = pillColorRu(m.color); } catch (e) {} dz.textContent = (m.dose || '') + (pc2 ? ' · ' + pc2 + ' таблетка' : ''); }
    var tm = $('alarmTime'); if (tm) tm.textContent = m.time || '';
    var cir = $('alarmCircle'); if (cir) cir.style.background = colorMap[m.color] || '#0066FF';
    var s = $('alarmSos'); if (s) s.hidden = true;
    try { publishUp('reminded', m.id); } catch (e) {}
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
    try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
    try { vib([1000, 500, 1000]); } catch (e) {}
    if (vibTimer) clearInterval(vibTimer);
    vibTimer = setInterval(function () { try { vib([500, 200, 500, 200, 500]); } catch (e) {} }, 4000);
    // орать без обрезания: запись/фраза целиком, потом пауза
    playMedVoice(m);
    if (voiceTimer) { try { clearTimeout(voiceTimer); } catch (e) {} try { clearInterval(voiceTimer); } catch (e) {} voiceTimer = null; }
    voiceLoop();
    // мигание красный/желтый
    if (blinkTimer) clearInterval(blinkTimer);
    blinkOn = false;
    blinkTimer = setInterval(function () {
      try {
        blinkOn = !blinkOn;
        document.body.classList.remove('alarm-blink-red', 'alarm-blink-yellow');
        document.body.classList.add(blinkOn ? 'alarm-blink-red' : 'alarm-blink-yellow');
        try { document.title = blinkOn ? '🔴 ВРЕМЯ ПИТЬ!' : '💊 ВРЕМЯ ПИТЬ!'; } catch (e) {}
      } catch (e) {}
    }, 500);
    // окно тишины: 10 мин, в демо 2 мин
    var winMs = isDemo() ? 2 * 60 * 1000 : 10 * 60 * 1000;
    if (missedTimer) clearTimeout(missedTimer);
    missedTimer = setTimeout(function () {
      try {
        if (!alarmActive) return;
        publishUp('missed', m.id);
        var s2 = $('alarmSos'); if (s2) s2.hidden = false;
        try { startSiren(); } catch (e) {}
        try { loudNotify('ВЫ НЕ ВЫПИЛИ!', (m.name || 'Лекарство') + ' — нажмите SOS!'); } catch (e) {}
        speak('Вы не выпили лекарство! Позовите на помощь! Нажмите SOS!');
        try { vib([2000, 500, 2000, 500, 2000]); } catch (e) {}
      } catch (e) {}
    }, winMs);
    startListen();
  } catch (e) {}
}
function stopAlarmTaken(how) {
  try {
    if (!alarmActive) return;
    try { var al0 = $('alarm'); if (al0) { al0.style.display = 'none'; al0.classList.remove('show'); } } catch (e) {}
    try { stopSiren(); } catch (e) {}
    var m = alarmMed;
    if (voiceTimer) { try { clearInterval(voiceTimer); } catch (e) {} try { clearTimeout(voiceTimer); } catch (e) {} voiceTimer = null; }
    try { voiceGen++; } catch (e) {}
    if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
    if (missedTimer) { clearTimeout(missedTimer); missedTimer = null; }
    if (vibTimer) { clearInterval(vibTimer); vibTimer = null; }
    document.body.classList.remove('alarm-blink-red', 'alarm-blink-yellow');
    try { if (curAudio) { curAudio.pause(); curAudio = null; } } catch (e) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
    try { if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(function () {}); } catch (e) {}
    stopListen();
    var al = $('alarm'); if (al) { al.style.display = 'none'; al.classList.remove('show'); }
    try { stopSiren(); } catch (e) {}
    try { document.title = 'Мои Таблетки — SilverCare'; } catch (e) {}
    alarmActive = false; alarmMed = null;
    if (m) { try { publishUp('taken', m.id); } catch (e) {} }
    speak(how === 'voice' ? 'Молодец! Я записала!' : 'Молодец! Вы выпили!');
    status('Выпито! Молодец!');
    try { vib([300, 100, 300]); } catch (e) {}
    // автозапуск 1 раунда памяти
    setTimeout(function () { try { startMemory(1); } catch (e) {} }, 1500);
    // очередь: следующее в то же время
    setTimeout(function () { try { nextAlarm(); } catch (e) {} }, 2000);
  } catch (e) {}
}
/* Слушать слово "выпил" — микрофон спрашиваем один раз на воротах, не посреди аларма */
var voiceStopOK = true;
function micDead() {
  try { // микрофон сдох: прячем подсказку про «выпил», остаётся большая кнопка
    voiceStopOK = false;
    stopListen();
    var vh = $('voiceHint'); if (vh) vh.style.display = 'none';
    status('Микрофон не отвечает — жми кнопку Я ВЫПИЛ!');
  } catch (e) {}
}
function startListen() {
  try {
    stopListen();
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !soundOn || !voiceStopOK || isFileProto()) return;
    var errs = 0;
    recog = new SR();
    recog.lang = 'ru-RU';
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = function (ev) {
      try {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var txt = (ev.results[i][0].transcript || '').toLowerCase();
          if (txt.indexOf('выпил') !== -1 || txt.indexOf('выпила') !== -1) { stopAlarmTaken('voice'); break; }
        }
      } catch (e) {}
    };
    recog.onerror = function (ev) {
      try {
        var er = '';
        try { er = String((ev && ev.error) || ''); } catch (x) {}
        if (er === 'not-allowed' || er === 'service-not-allowed') { try { micDead(); } catch (e) {} return; }
        errs++;
        if (errs > 5) { try { micDead(); } catch (e) {} } // хватит долбить, остаёмся на кнопке
      } catch (e) {}
    };
    recog.onend = function () { try { if (alarmActive && recog && voiceStopOK) recog.start(); } catch (e) {} };
    recog.start();
  } catch (e) {}
}
function stopListen() {
  try { if (recog) { try { recog.onend = null; recog.stop(); } catch (e) {} recog = null; } } catch (e) {}
}

/* ---------- ИГРЫ ПАМЯТИ: пары, что пропало, Шульте — чередуются случайно ---------- */
var MEM_ITEMS = [
  { e: '💊', w: 'ТАБЛЕТКА' }, { e: '❤️', w: 'СЕРДЦЕ' }, { e: '🍎', w: 'ЯБЛОКО' },
  { e: '⭐', w: 'ЗВЕЗДА' }, { e: '🐱', w: 'КОТ' }, { e: '🚗', w: 'МАШИНА' },
  { e: '🌹', w: 'ЦВЕТОК' }, { e: '🐶', w: 'СОБАКА' }
];
var memRound = 0, memTotal = 3, memScore = 0, memSession = 0;
function memAlive(s) { try { return s === memSession && $('memory') && $('memory').classList.contains('show'); } catch (e) { return false; } }
function memHead(sub) {
  try {
    var tt = $('memTitle'); if (tt) tt.textContent = sub;
    var ss = $('memScore'); if (ss) ss.textContent = 'Счёт: ' + memScore + ' • Игра ' + Math.min(memRound + 1, memTotal) + ' из ' + memTotal;
  } catch (e) {}
}
function startMemory(rounds) {
  try {
    memTotal = rounds || 3; memRound = 0; memScore = 0; memSession++;
    var m = $('memory'); if (m) m.classList.add('show');
    memNext();
  } catch (e) {}
}
function memNext() {
  try {
    var bx = $('memCards'); if (bx) { try { bx.classList.remove('mem-grid'); } catch (e) {} }
    if (memRound >= memTotal) {
      var t = $('memTitle'); if (t) t.textContent = 'Игра окончена!';
      var s = $('memScore'); if (s) s.textContent = 'Набрано: ' + memScore + '. Отлично!';
      var c = $('memCards'); if (c) c.innerHTML = '';
      speak('Игра окончена! Набрано ' + memScore + '. Отлично!');
      return;
    }
    var g = ['pairs', 'missing', 'schulte'][Math.floor(Math.random() * 3)];
    if (g === 'pairs') memPairs();
    else if (g === 'missing') memMissing();
    else memSchulte();
  } catch (e) {}
}
function memDone(s) {
  try {
    memRound++;
    setTimeout(function () { try { if (memAlive(s)) memNext(); } catch (e) {} }, 1500);
  } catch (e) {}
}
/* Парные карточки: найди две одинаковые */
function memPairs() {
  try {
    var s = memSession;
    var pool = MEM_ITEMS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
    var deck = pool.concat(pool).sort(function () { return Math.random() - 0.5; });
    var first = -1, lock = false, found = 0;
    memHead('Найди две одинаковые!');
    speak('Найди две одинаковые картинки!');
    var box = $('memCards'); if (!box) return;
    box.innerHTML = '';
    var btns = [];
    deck.forEach(function (it, i) {
      try {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mem-card';
        b.innerHTML = '<span class="mem-face">' + it.e + '</span><span class="mem-word">' + it.w + '</span>';
        b.setAttribute('aria-label', 'Карточка ' + it.w);
        b.onclick = function () {
          try {
            if (lock || !memAlive(s)) return;
            if (b.classList.contains('mem-done') || i === first) return;
            b.classList.add('mem-sel');
            if (first === -1) { first = i; return; }
            if (deck[first].w === it.w) {
              btns[first].classList.remove('mem-sel'); b.classList.remove('mem-sel');
              btns[first].classList.add('mem-done'); b.classList.add('mem-done');
              first = -1; found++; memScore++;
              memHead('Найди две одинаковые!');
              speak('Молодец! Пара!');
              if (found >= 3) memDone(s);
            } else {
              lock = true;
              var a = first; first = -1;
              speak('Попробуй ещё!');
              setTimeout(function () {
                try { btns[a].classList.remove('mem-sel'); b.classList.remove('mem-sel'); } catch (e) {}
                lock = false;
              }, 900);
            }
          } catch (e) {}
        };
        btns.push(b); box.appendChild(b);
      } catch (e) {}
    });
  } catch (e) {}
}
/* Что пропало: запомни 3, найди спрятанное */
function memMissing() {
  try {
    var s = memSession;
    var three = MEM_ITEMS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
    var gone = Math.floor(Math.random() * 3);
    var rest = MEM_ITEMS.filter(function (x) { return three.indexOf(x) === -1; }).sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    memHead('Запомни картинки!');
    speak('Запомни три картинки! Смотри внимательно!');
    var box = $('memCards'); if (!box) return;
    box.innerHTML = '';
    three.forEach(function (it) {
      try {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mem-card';
        b.innerHTML = '<span class="mem-face">' + it.e + '</span><span class="mem-word">' + it.w + '</span>';
        b.disabled = true;
        box.appendChild(b);
      } catch (e) {}
    });
    setTimeout(function () {
      try {
        if (!memAlive(s)) return;
        memHead('Чего не хватает?');
        speak('Чего не хватает? Выбери!');
        box.innerHTML = '';
        var variants = ([three[gone]].concat(rest)).sort(function () { return Math.random() - 0.5; });
        variants.forEach(function (it) {
          try {
            var v = document.createElement('button');
            v.type = 'button'; v.className = 'mem-card';
            v.innerHTML = '<span class="mem-face">' + it.e + '</span><span class="mem-word">' + it.w + '</span>';
            v.setAttribute('aria-label', 'Вариант ' + it.w);
            v.onclick = function () {
              try {
                if (!memAlive(s)) return;
                if (it.w === three[gone].w) {
                  memScore++; memHead('Чего не хватает?');
                  speak('Молодец! Пропал ' + three[gone].w + '!');
                  memDone(s);
                } else speak('Попробуй ещё!');
              } catch (e) {}
            };
            box.appendChild(v);
          } catch (e) {}
        });
      } catch (e) {}
    }, 6000);
  } catch (e) {}
}
/* Таблица Шульте 3х3: жми 1..9 по порядку */
function memSchulte() {
  try {
    var s = memSession;
    var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(function () { return Math.random() - 0.5; });
    var next = 1;
    memHead('Жми по порядку: 1 ... 9');
    speak('Жми цифры по порядку! Начни с единицы!');
    var box = $('memCards'); if (!box) return;
    box.innerHTML = '';
    try { box.classList.add('mem-grid'); } catch (e) {}
    nums.forEach(function (n) {
      try {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mem-card mem-num';
        b.textContent = n;
        b.setAttribute('aria-label', 'Цифра ' + n);
        b.onclick = function () {
          try {
            if (!memAlive(s)) return;
            if (n === next) {
              b.classList.add('mem-done');
              try { speak(String(n)); } catch (e) {}
              next++;
              if (next > 9) {
                memScore++;
                speak('Молодец! Все по порядку!');
                memDone(s);
              } else memHead('Жми по порядку: дальше ' + next);
            } else speak('Попробуй ещё! Ищи ' + next);
          } catch (e) {}
        };
        box.appendChild(b);
      } catch (e) {}
    });
  } catch (e) {}
}

/* ---------- Старт: #p= / #family= / localStorage ---------- */
function parseStart() {
  try {
    var h = window.location.hash || '';
    // 1) #p= -> LZString -> {family,v,meds}
    if (h.indexOf('#p=') === 0) {
      try {
        var enc = h.slice(3);
        var json = (window.LZString) ? window.LZString.decompressFromEncodedURIComponent(enc) : null;
        if (json) {
          var pkt = JSON.parse(json);
          if (pkt && pkt.meds) {
            applyPacket(pkt);
            return true;
          }
        }
        status('Не смогла прочитать письмо. Введите 4 цифры.');
      } catch (e) { status('Не смогла прочитать письмо.'); }
      return false;
    }
    // 2) #family=FAMILY
    if (h.indexOf('#family=') === 0) {
      try {
        var f = decodeURIComponent(h.slice(8)).trim();
        if (f) { setFamily(f); family = f; syncDown().then(function () { render(); }); return true; }
      } catch (e) {}
      return false;
    }
    // 3) localStorage
    try {
      family = getFamily();
      meds = getMeds();
      render();
    } catch (e) {}
    return false;
  } catch (e) { return false; }
}

/* ---------- Разблокировка звука (первый экран) ---------- */
function unlockAll() {
  try {
    soundOn = true; audioCtxUnlocked = true;
    try { warmAudio(); } catch (e) {}
    try { startHeart(); } catch (e) {} // сердцебиение СРАЗУ при видимой: фон с живым аудио душат последним
    try { // разбудить Audio
      var a = new Audio();
      a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
      a.play().catch(function () {});
    } catch (e) {}
    try { if ('speechSynthesis' in window) { var u = new SpeechSynthesisUtterance('Звук включён! Я буду напоминать о таблетках!'); u.lang = 'ru-RU'; u.rate = 0.9; u.volume = 1; window.speechSynthesis.speak(u); lastText = u.text; } } catch (e) {}
    try { if ('Notification' in window && Notification.requestPermission) Notification.requestPermission().catch(function () {}); } catch (e) { try { Notification.requestPermission(); } catch (x) {} }
    try { // микрофон — один раз здесь, чтобы не всплывал посреди аларма
      var SR2 = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR2 && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !isFileProto()) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
          try { st.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } catch (e) {}
        }).catch(function () { try { micDead(); } catch (e) {} });
      }
    } catch (e) {}
    try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
    var g = $('gate'); if (g) g.style.display = 'none';
    status('Звук включён!');
    try { vib([400, 150, 400]); } catch (e) {} // тестовый виброзвонок сразу в руке
    setTimeout(function () {
      try { // отчёт по разрешениям: что дали, что нет
        var rep = 'Звук включён!';
        try { rep += ' Уведомления ' + (('Notification' in window && Notification.permission === 'granted') ? '✅' : '❌'); } catch (e) {}
        try { rep += ' Микрофон ' + (voiceStopOK ? '✅' : '❌'); } catch (e) {}
        status(rep);
      } catch (e) {}
    }, 1500);
    try { syncDown().then(function () { render(); }); } catch (e) {}
    try { flushOutbox(); } catch (e) {}
    try { reportSkipped(); } catch (e) {}
    try { publishUp('alive', ''); } catch (e) {}
  } catch (e) {}
}

/* ---------- Привязка кнопок ---------- */
function bind() {
  try {
    var g = $('gateBtn'); if (g) g.addEventListener('click', function () { try { unlockAll(); } catch (e) {} });
    var fb = $('findBtn');
    if (fb) fb.addEventListener('click', function () {
      try {
        var inp = $('familyInput');
        var raw = inp ? (inp.value || '').trim().toLowerCase() : '';
        var v = '';
        if (/^\d{4}-[0-9a-z]{4}$/.test(raw)) v = raw;
        else { var d = raw.replace(/\D/g, '').slice(0, 4); if (d.length === 4) v = d; }
        if (!v) { speak('Введите 4 цифры или полный код!'); status('Нужно 4 цифры или код!'); return; }
        setFamily(v); family = v;
        status('Ищу лекарства...');
        speak('Ищу ваши лекарства!');
        syncDown().then(function (ok) { try { render(); status(ok ? 'Нашла!' : 'Пока пусто. Проверю ещё.'); if (!ok) speak('Пока пусто. Проверю ещё раз.'); } catch (e) {} });
      } catch (e) {}
    });
    var tk = $('takenBtn'); if (tk) tk.addEventListener('click', function () { try { stopAlarmTaken('button'); } catch (e) {} });
    var rp = $('repeatBtn'); if (rp) rp.addEventListener('click', function () {
      try { if (lastMed) playMedVoice(lastMed); else if (lastText) speak(lastText); else speak('Пока нечего повторять!'); } catch (e) {} });
    var mb = $('memoryBtn'); if (mb) mb.addEventListener('click', function () { try { startMemory(3); } catch (e) {} });
    var mc = $('memClose'); if (mc) mc.addEventListener('click', function () { try { var m = $('memory'); if (m) m.classList.remove('show'); } catch (e) {} });
    var sos = $('sosBtn');
    if (sos) sos.addEventListener('click', function () {
      try {
        speak('Помогите! Мне нужна помощь! Зову семью!');
        publishUp('sos', '');
        status('SOS отправлен семье!');
        try { vib([1000, 500, 1000]); } catch (e) {}
        try { if (Notification.permission === 'granted') { try { new Notification('SOS отправлен!', { body: 'Семья уже знает.', tag: 'silver-sos' }); } catch (e) {} } } catch (e) {}
      } catch (e) {}
    });
    var as = $('alarmSos');
    if (as) as.addEventListener('click', function () {
      try {
        speak('Помогите! Мне нужна помощь!');
        publishUp('sos', alarmMed ? alarmMed.id : '');
        status('SOS отправлен!');
      } catch (e) {}
    });
    try {
      document.addEventListener('visibilitychange', function () {
        try {
          if (document.hidden) {
            if (alarmActive && alarmMed) {
              try { loudNotify('ВРЕМЯ ПИТЬ!', (alarmMed.name || 'Лекарство') + ' ' + (alarmMed.dose || '')); } catch (e) {}
              try { vib([2000, 500, 2000]); } catch (e) {}
            } else if (soundOn) {
              try { startHeart(); } catch (e) {}
              try { watchNotify(); } catch (e) {}
            }
          } else {
            try { watchHide(); } catch (e) {}
            if (soundOn) flushOutbox();
            try { syncDown().then(function (ch) { if (ch && ch !== 'net') render(); }); } catch (e) {} // список тоже догнать, а не только время
            try { checkTime(); } catch (e) {} // догнать пропущенное, пока вкладка спала
            try { if (alarmActive && navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
          }
        } catch (e) {}
      });
    } catch (e) {}
    try { window.addEventListener('online', function () { try { flushOutbox(); syncDown().then(function () { render(); }); } catch (e) {} }); } catch (e) {}
  } catch (e) {}
}

/* ---------- Поехали ---------- */
function init() {
  try {
    family = getFamily();
    meds = getMeds();
    try { if (LOCKED_FAMILY) { setFamily(LOCKED_FAMILY); family = LOCKED_FAMILY; } } catch (e) {}
    bind();
    tickClock(); setInterval(tickClock, 1000);
    try { lastLocalV = getV(); } catch (e) {}
    try { window.addEventListener('storage', function (ev) { try { if (ev && (ev.key === 'silver_family' || ev.key === 'silver_v' || ev.key === 'silver_meds')) scheduleLocalSync(); } catch (e) {} }); } catch (e) {}
    try { if (isFileProto()) { voiceStopOK = false; var vhf = $('voiceHint'); if (vhf) vhf.style.display = 'none'; } } catch (e) {}
    parseStart();
    render();
    try { reportSkipped(); } catch (e) {}
    if (!family) status('Введите 4 цифры семьи.');
    else status(isDemo() ? 'Демо: проверка каждую минуту!' : 'Жду время таблеток...');
    // фон: вниз каждые 30 сек, проверка времени каждые 5 сек, alive каждые 5 мин
    setInterval(function () { try { if (soundOn) { syncDown().then(function (ch) { try { if (ch === 'cool') status('Ящик просит подождать...'); else if (ch === 'net') status('Нет связи с ящиком ' + nowHM()); else { if (ch) render(); else status('Всё свежо! Версия ' + getV()); } } catch (e) {} }); try { keepAwake(); } catch (e) {} try { if (alarmActive && alarmMed && document.hidden) { loudNotify('ВРЕМЯ ПИТЬ!', (alarmMed.name || 'Лекарство') + ' ' + (alarmMed.dose || '')); try { vib([2000, 500, 2000]); } catch (e) {} } } catch (e) {} } } catch (e) {} }, 10000);
    setInterval(function () { try { checkTime(); } catch (e) {} }, 5000);
    setInterval(function () { try { if (soundOn) publishUp('alive', ''); } catch (e) {} }, 30 * 60 * 1000); // alive раз в 30 мин: бережём суточную квоту ntfy (250/сутки)
    // PWA: service worker + кнопка из шторки гасит аларм
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.addEventListener) {
        navigator.serviceWorker.addEventListener('message', function (ev) {
          try { if (ev && ev.data === 'silver-taken') stopAlarmTaken('button'); } catch (e) {}
        });
      }
    } catch (e) {}
    try { // новая версия сайта — обновиться самому, если не орёт и не пишет код
      if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(function (reg) {
        try {
          if (reg.addEventListener) reg.addEventListener('updatefound', function () {
            try {
              var nw2 = reg.installing;
              if (nw2 && nw2.addEventListener) nw2.addEventListener('statechange', function () {
                try {
                  if (nw2.state !== 'activated' || alarmActive) return;
                  var ae2 = null;
                  try { ae2 = document.activeElement; } catch (e) {}
                  if (ae2 && (ae2.tagName === 'INPUT' || ae2.tagName === 'TEXTAREA' || ae2.tagName === 'SELECT')) return;
                  window.location.reload();
                } catch (e) {}
              });
            } catch (e) {}
          });
        } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.getVoices(); } catch (e) {}
  } catch (e) {}
}
try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
} catch (e) {}
})();
