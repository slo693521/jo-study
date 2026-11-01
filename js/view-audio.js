/* view-audio.js — 有聲書（逐句播放／跟讀）與聽力練習 */
(function (root) {
  'use strict';
  const App = root.App, JP = root.JP, D = root.JP_DATA, Progress = root.Progress, Store = root.Store, Audio = root.JPAudio, QG = root.QuizGen;
  const { esc, chip, notice, bar, fmtQ } = App;
  const I = () => App.idx;
  const P = Audio.Player;

  /* ================= 有聲書 ================= */
  function lessonItems(l, withVocab) {
    const out = [];
    (l.sentences || []).forEach(s => out.push({ src: s[0], zh: s[1], sec: l.kana ? '練習單字／短句' : '重點句子' }));
    if (l.dialogue) l.dialogue.lines.forEach(x => out.push({ src: x[1], zh: x[2], speaker: x[0], sec: '對話：' + l.dialogue.title }));
    if (withVocab) (I().vocabByLesson.get(l.id) || []).forEach(v => { if (v.ex) out.push({ src: v.ex, zh: v.exZh, sec: '單字例句' }); });
    return out;
  }

  let AB = null, raf = 0;
  App.views.audiobook = function (parts) {
    const I_ = I();
    if (!parts[0]) {
      App.pageTitle = '有聲書';
      const fd = Store.get().notes.followDone || {};
      App.render(`<h1>有聲書</h1><p class="muted">把課程的句子和對話做成逐句播放：可調語速、單句重複、跟讀（聽一句、停一下、你自己念）。聲音來自瀏覽器內建的日文語音合成，<b>不是真人錄音</b>，語調可能不如真人自然。</p>
        ${App.voiceNotice()}
        ${D.stages.map(s => `<div class="card"><h2>${esc(s.name)}</h2>${I_.lessons.filter(l => l.stage === s.id).map(l => { const n = lessonItems(l).length; return `<a class="lessonrow" href="#/audiobook/${l.id}"><span class="id">${l.id}</span><span><strong>${esc(l.title)}</strong><br><span class="tiny muted">${n} 句${l.dialogue ? '（含對話）' : ''}</span></span>${fd[l.id] ? chip('已跟讀', 'ok') : ''}</a>`; }).join('')}</div>`).join('')}`);
      return;
    }
    const l = I_.lById.get(parts[0]); if (!l) return App.views.notfound();
    App.pageTitle = `有聲書 ${l.id}`;
    const s = Store.get().settings;
    AB = { l, withVocab: !!App.tmp.abVocab, items: [], mode: App.tmp.abMode || 'normal', repeat: App.tmp.abRepeat || 'none', rate: s.rate, view: Object.assign({ furi: s.furigana, roma: document.body.dataset.romaji === 'on', zh: s.zh, hide: false }, App.tmp.abView || {}) };
    AB.items = lessonItems(l, AB.withVocab);
    const i = I_.lessons.indexOf(l), prev = I_.lessons[i - 1], next = I_.lessons[i + 1];
    let lastSec = '';
    const list = AB.items.map((it, k) => {
      const head = it.sec !== lastSec ? `<h3 style="margin:1rem 0 .4rem">${esc(it.sec)}</h3>` : ''; lastSec = it.sec;
      return head + `<div data-act="abGo" data-i="${k}">${App.sentenceCard(it.src, it.zh, { id: 'ab' + k, speaker: it.speaker ? it.speaker + '：' : '' })}</div>`;
    }).join('');
    App.render(`<p class="small"><a href="#/audiobook">← 有聲書列表</a>　<a href="#/lesson/${l.id}">查看課程 ${l.id}</a></p>
      <h1>${l.id}　${esc(l.title)}</h1>${App.voiceNotice()}
      ${AB.items.length ? '' : notice('這一課沒有可播放的句子。', 'warn')}
      <div class="card tight"><div class="row">
        <label class="chk"><input type="checkbox" data-on="abView" data-k="furi" ${AB.view.furi ? 'checked' : ''}> 振假名</label>
        <label class="chk"><input type="checkbox" data-on="abView" data-k="roma" ${AB.view.roma ? 'checked' : ''}> 羅馬拼音</label>
        <label class="chk"><input type="checkbox" data-on="abView" data-k="zh" ${AB.view.zh ? 'checked' : ''}> 中文翻譯</label>
        <button class="btn sm" data-act="abPure">純日文模式</button>
        <label class="chk"><input type="checkbox" data-on="abView" data-k="hide" ${AB.view.hide ? 'checked' : ''}> 隱藏文字（純聽力，點句子可揭曉）</label>
        <label class="chk"><input type="checkbox" data-on="abVocab" ${AB.withVocab ? 'checked' : ''}> 加入單字例句</label></div></div>
      <div id="abList">${list}</div>
      <div class="player" id="abPlayer" role="region" aria-label="播放控制">
        <div class="row between small"><span id="abStatus" aria-live="polite">準備播放</span><span class="muted">${AB.items.length} 句</span></div>
        <div class="ctrls" style="margin:.4rem 0">
          <button class="icon-btn" data-act="abPrev" aria-label="上一句" title="上一句">⏮</button>
          <button class="btn primary" id="abPlay" data-act="abToggle">▶ 播放</button>
          <button class="icon-btn" data-act="abStop" aria-label="停止" title="停止">⏹</button>
          <button class="icon-btn" data-act="abNext" aria-label="下一句" title="下一句">⏭</button>
          <button class="icon-btn" data-act="abReplay" aria-label="重播這一句" title="重播這一句">🔂</button></div>
        <div class="ctrls">
          <button class="btn sm" data-act="abSpeed" data-v="slow">🐢 慢速</button><button class="btn sm" data-act="abSpeed" data-v="normal">正常</button>
          <label class="small">語速 <span id="abRateV">${AB.rate.toFixed(2)}</span>× <input type="range" min="0.5" max="1.5" step="0.05" value="${AB.rate}" data-in="abRate" style="width:140px" aria-label="語速"></label>
          <select data-on="abRepeat" aria-label="重複"><option value="none" ${AB.repeat === 'none' ? 'selected' : ''}>不重複</option><option value="one" ${AB.repeat === 'one' ? 'selected' : ''}>單句重複</option><option value="all" ${AB.repeat === 'all' ? 'selected' : ''}>全部循環</option></select>
          <select data-on="abMode" aria-label="模式"><option value="normal" ${AB.mode === 'normal' ? 'selected' : ''}>連續播放</option><option value="follow" ${AB.mode === 'follow' ? 'selected' : ''}>跟讀模式（每句留白）</option></select></div>
        <div class="gapbar" id="abGap" ${AB.mode === 'follow' ? '' : 'hidden'}><i id="abGapI"></i></div>
        <div class="tiny muted" style="margin-top:.3rem">${'跟讀模式：每句播完後留一段空白（長度依句長與「設定」的跟讀間隔），請自己大聲念；按 ⏭ 可提早進下一句。'}</div></div>
      <div class="row between" style="margin-top:1rem">${prev ? `<a class="btn" href="#/audiobook/${prev.id}">← ${prev.id}</a>` : '<span></span>'}${next ? `<a class="btn" href="#/audiobook/${next.id}">${next.id} →</a>` : ''}</div>`);
    applyView();
    loadPlayer();
    return () => { cancelAnimationFrame(raf); P.onEnd = null; P.onUpdate = null; AB = null; };
  };

  function applyView() {
    const el = App.$('#abList'); if (!el) return;
    el.classList.toggle('ab-nofuri', !AB.view.furi);
    el.classList.toggle('ab-noroma', !AB.view.roma);
    el.classList.toggle('ab-nozh', !AB.view.zh);
    el.classList.toggle('ab-hide', !!AB.view.hide);
    // 這一頁的顯示開關優先於全域設定（全域設定用 body 屬性，這裡用 class 蓋過）
    el.classList.toggle('ab-forceroma', !!AB.view.roma);
    el.classList.toggle('ab-forcezh', !!AB.view.zh);
    el.classList.toggle('ab-forcefuri', !!AB.view.furi);
  }
  function loadPlayer() {
    const s = Store.get().settings;
    P.gapMs = (s.followGap || 1.4) * 1000;
    P.load(AB.items.map((it, k) => ({ text: JP.sentence(it.src).text, id: k })), { mode: AB.mode, rate: AB.rate, repeat: AB.repeat, onUpdate: onUpdate });
    P.onEnd = onEnd;
  }
  let gapStart = 0, lastState = '';
  function onUpdate(u) {
    if (!AB) return;
    App.$$('#abList .sentence.current').forEach(e => e.classList.remove('current'));
    const cur = App.$('#ab' + u.i);
    if (cur && u.state !== 'idle') {
      cur.classList.add('current');
      if (u.state === 'playing' && lastState !== 'playing' || u.i !== AB.lastI) cur.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    AB.lastI = u.i;
    const names = { idle: '準備播放', playing: '播放中', paused: '已暫停', gap: '輪到你念了……', done: '播放完畢' };
    const st = App.$('#abStatus'); if (st) st.textContent = `${names[u.state] || ''}　第 ${Math.min(u.i + 1, u.total)}/${u.total} 句`;
    const b = App.$('#abPlay'); if (b) b.textContent = (u.state === 'playing' || u.state === 'gap') ? '⏸ 暫停' : (u.state === 'paused' ? '▶ 繼續' : '▶ 播放');
    if (u.state === 'gap') { gapStart = Date.now(); animateGap(u.gapEnd); } else { cancelAnimationFrame(raf); const gi = App.$('#abGapI'); if (gi) gi.style.width = '0'; }
    lastState = u.state;
  }
  function animateGap(end) {
    cancelAnimationFrame(raf);
    const total = Math.max(1, end - gapStart);
    const step = () => {
      const gi = App.$('#abGapI'); if (!gi) return;
      const f = Math.min(1, (Date.now() - gapStart) / total); gi.style.width = (f * 100) + '%';
      if (f < 1 && P.state === 'gap') raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function onEnd() {
    if (!AB) return;
    Progress.markTask('listening');
    if (AB.mode === 'follow') { const n = Store.get().notes; n.followDone = n.followDone || {}; n.followDone[AB.l.id] = Date.now(); Store.save(); App.toast(`已記錄：${AB.l.id} 跟讀完成。`); }
    else App.toast('播放完畢。');
  }

  App.acts.abToggle = () => {
    if (P.state === 'playing' || P.state === 'gap') P.pause();
    else if (P.state === 'paused') P.resume();
    else if (!P.play()) App.toast('無法播放：沒有可用的日文語音。', true);
  };
  App.acts.abStop = () => P.stop();
  App.acts.abNext = () => { if (P.state === 'idle') { P.i = Math.min(P.items.length - 1, P.i + 1); P._notify(); } else P.next(); };
  App.acts.abPrev = () => { if (P.state === 'idle') { P.i = Math.max(0, P.i - 1); P._notify(); } else P.prev(); };
  App.acts.abReplay = () => { if (!P.items.length) return; if (P.state === 'idle' || P.state === 'done') { if (P.state === 'done') P.i = 0; P.play(); } else P.replay(); };
  App.acts.abGo = (el, e) => {
    const k = +el.dataset.i;
    if (AB.view.hide) { const sc = App.$('#ab' + k); sc.classList.toggle('rev'); }
    P.stop(true); P.i = k; P._notify();
    if (!P.play()) App.toast('無法播放：沒有可用的日文語音。', true);
  };
  App.acts.abSpeed = el => {
    const s = Store.get().settings;
    AB.rate = el.dataset.v === 'slow' ? s.slowRate : s.rate; P.setRate(AB.rate);
    App.$('#abRateV').textContent = AB.rate.toFixed(2); App.$('[data-in="abRate"]').value = AB.rate;
  };
  App.ins.abRate = el => { AB.rate = +el.value; P.setRate(AB.rate); App.$('#abRateV').textContent = AB.rate.toFixed(2); };
  App.ons.abRepeat = el => { AB.repeat = el.value; App.tmp.abRepeat = el.value; P.repeat = el.value; };
  App.ons.abMode = el => { AB.mode = el.value; App.tmp.abMode = el.value; P.setMode(el.value); App.$('#abGap').hidden = el.value !== 'follow'; };
  App.ons.abView = el => { AB.view[el.dataset.k] = el.checked; App.tmp.abView = Object.assign({}, AB.view); applyView(); };
  App.acts.abPure = () => {
    AB.view.furi = false; AB.view.roma = false; AB.view.zh = false; App.tmp.abView = Object.assign({}, AB.view);
    App.$$('[data-on="abView"]').forEach(c => { if (['furi', 'roma', 'zh'].includes(c.dataset.k)) c.checked = false; });
    applyView(); App.toast('純日文模式：只顯示日文，不顯示振假名、羅馬拼音、中文。');
  };
  App.ons.abVocab = el => { App.tmp.abVocab = el.checked; App.refresh(); };

  /* ================= 聽力練習 ================= */
  let LT = null;
  App.views.listening = function (parts) {
    const I_ = I();
    if (parts[0]) return listenItem(parts[0]);
    App.pageTitle = '聽力練習';
    const st = Store.get().listening, items = D.listening;
    const done = Object.keys(st).length, ok = Object.values(st).filter(x => x.ok).length;
    const curI = I_.lessonOrder.get(Progress.currentLesson().id);
    const nl = Progress.nextListening();
    App.render(`<h1>聽力練習</h1><p class="muted">共 ${items.length} 題。每題先<b>看不到文字</b>，聽完選答案，作答後才顯示原文、翻譯與解析。聽力在 N5 占總分三分之一，要定期練。聲音是瀏覽器的語音合成，不是真人錄音。</p>
      ${App.voiceNotice()}
      <div class="grid g3 keep2"><div class="card stat"><div class="n">${done}/${items.length}</div><div class="l">已作答題數</div></div><div class="card stat"><div class="n">${done ? Math.round(ok / done * 100) + '%' : '—'}</div><div class="l">最近一次作答的正確率</div></div>
        <a class="card stat linkcard" href="#/listening/${nl ? nl.item.id : items[0].id}"><div class="n">▶</div><div class="l">${nl && nl.fresh ? '做下一題' : '複習一題'}</div></a></div>
      <div class="card">${items.map(t => {
        const x = st[t.id], locked = I_.lessonOrder.get(t.unlock) > curI;
        return `<a class="lessonrow" href="#/listening/${t.id}"><span class="id">${t.id}</span><span><strong>${esc(t.title)}</strong><br><span class="tiny muted">建議學完 ${t.unlock} 後${x ? `　·　已做 ${x.tries} 次` : ''}</span></span>${x ? chip(x.ok ? '答對' : '答錯', x.ok ? 'ok' : 'bad') : locked ? chip('還沒學到') : chip('未做')}</a>`;
      }).join('')}</div>`);
  };

  function listenItem(id) {
    const t = D.listening.find(x => x.id === id); if (!t) return App.views.notfound();
    App.pageTitle = '聽力 ' + id;
    const q = QG.listenQ(t, Math.random);
    LT = { t, q, picked: null, revealed: false, plays: 0 };
    drawListen();
    return () => { LT = null; P.onUpdate = null; };
  }
  function drawListen() {
    const { t, q } = LT, answered = LT.picked != null;
    const idxT = D.listening.indexOf(t), next = D.listening[idxT + 1], prev = D.listening[idxT - 1];
    const noVoice = !Audio.available();
    App.render(`<p class="small"><a href="#/listening">← 聽力列表</a></p>
      <div class="qwrap"><div class="card"><div class="muted small">${t.id}　${esc(t.title)}</div>
        ${App.voiceNotice()}
        <div class="row" style="margin:.6rem 0"><button class="btn primary lg" data-act="ltPlay">🔊 播放對話</button><button class="btn" data-act="ltPlay" data-slow="1">🐢 慢速</button><button class="btn" data-act="ltStop">⏹ 停止</button>
          <span class="small muted" id="ltCount">已播放 ${LT.plays} 次</span></div>
        <div class="qprompt">${esc(q.sub)}</div>
        <div class="opts">${q.options.map((o, k) => { let cls = 'opt'; if (answered) { if (o === q.answer) cls += ' correct'; else if (o === LT.picked) cls += ' wrong'; } return `<button class="${cls}" data-act="ltPick" data-n="${k}" ${answered ? 'disabled' : ''}><span class="lt">${'ABCD'[k]}</span><span>${esc(o)}</span></button>`; }).join('')}</div>
        ${answered ? `<div class="feedback ${LT.picked === q.answer ? 'ok' : 'bad'}"><strong>${LT.picked === q.answer ? '答對了 ✔' : '答錯了 ✘'}　正確答案：${esc(q.answer)}</strong><div class="small">解析：${esc(t.explain)}</div></div>` : ''}
        ${noVoice && !answered ? `<div class="row" style="margin-top:.6rem"><button class="btn sm" data-act="ltReveal">沒有日文語音：直接看原文自學（不計分）</button></div>` : ''}
        ${answered || LT.revealed ? `<h3 style="margin-top:1rem">對話原文與翻譯</h3>${t.lines.map(l => App.sentenceCard(l[1], l[2], { speaker: l[0] + '：' })).join('')}` : '<p class="tiny muted" style="margin:.8rem 0 0">作答前不顯示原文。可以重複聽，先不要急著選。</p>'}
      </div>
      <div class="row between">${prev ? `<a class="btn" href="#/listening/${prev.id}">← ${prev.id}</a>` : '<span></span>'}${answered && LT.picked !== q.answer ? '<a class="btn" href="#/listening/' + t.id + '">再做一次這題</a>' : ''}${next ? `<a class="btn ${answered ? 'primary' : ''}" href="#/listening/${next.id}">${next.id} 下一題 →</a>` : ''}</div></div>`);
  }
  App.acts.ltPlay = el => {
    const s = Store.get().settings;
    P.load(LT.t.lines.map((l, k) => ({ text: JP.sentence(l[1]).text, id: k })), { rate: el.dataset.slow ? s.slowRate : s.rate });
    if (P.play()) { LT.plays++; const c = App.$('#ltCount'); if (c) c.textContent = `已播放 ${LT.plays} 次`; }
  };
  App.acts.ltStop = () => Audio.stopAll();
  App.acts.ltReveal = () => { LT.revealed = true; drawListen(); };
  App.acts.ltPick = el => {
    if (LT.picked != null) return;
    Audio.stopAll();
    LT.picked = LT.q.options[+el.dataset.n];
    const correct = LT.picked === LT.q.answer;
    const S = Store.get(), prev = S.listening[LT.t.id];
    Progress.recordQuiz({ mode: 'listening', label: '聽力練習 ' + LT.t.id, answers: [{ q: LT.q, correct }] });
    S.listening[LT.t.id] = { ok: correct, tries: (prev ? prev.tries : 0) + 1, t: Date.now(), best: (prev && prev.best) || correct };
    Progress.markTask('listening');
    Store.save();
    drawListen();
  };
})(window);
