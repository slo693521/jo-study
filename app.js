/* app.js — 應用程式外殼：路由、導覽、共用元件，以及首頁／今日任務／課程總覽
 * 其他頁面在 js/view-*.js 中以 App.views.<名稱> 註冊。
 */
(function (root) {
  'use strict';
  const JP = root.JP, D = root.JP_DATA, Store = root.Store, Progress = root.Progress, Audio = root.JPAudio, QG = root.QuizGen;
  let idx = null;
  const App = { views: {}, acts: {}, ons: {}, ins: {}, cleanup: null, keyHandler: null, tmp: {}, current: '' };
  root.App = App;

  /* ---------- 小工具 ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  function fmtDate(ts, withTime) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}` + (withTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
  }
  const bar = (p, cls) => `<div class="bar ${cls || ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
  const chip = (t, cls) => `<span class="chip ${cls || ''}">${esc(t)}</span>`;
  const notice = (body, cls, title) => `<div class="notice ${cls || ''}">${title ? `<strong>${esc(title)}</strong>` : ''}${body}</div>`;
  const settings = () => Store.get().settings;

  /* 日文顯示：含振假名標記的字串 → HTML */
  const rubyWord = markup => JP.rubyToHtml(markup || '');
  const jpSentenceHtml = src => JP.sentence(src).html;
  // 測驗題幹／選項：有空白分詞的日文句子要去掉空白；一般中文或單詞直接轉 HTML
  function fmtQ(s) {
    s = String(s == null ? '' : s);
    if (/\s/.test(s.trim()) && /[぀-ヿ]/.test(s) && !/[，？；]/.test(s)) return `<span class="jp">${JP.sentence(s).html}</span>`;
    return JP.rubyToHtml(s).replace(/\n/g, '<br>');
  }
  const vocabRuby = v => rubyWord(v.ruby || v.word);

  /* 朗讀按鈕 */
  function playBtn(text, o) {
    o = o || {};
    return `<button class="icon-btn sm" data-act="say" data-t="${esc(text)}" title="播放發音" aria-label="播放發音">🔊</button>` +
      (o.slow === false ? '' : `<button class="icon-btn sm" data-act="say" data-slow="1" data-t="${esc(text)}" title="慢速播放" aria-label="慢速播放">🐢</button>`);
  }

  /* 逐詞拆解表 */
  function breakdown(src) {
    const s = JP.sentence(src);
    const rows = s.tokens.filter(t => !t.punct).map(t => {
      const g = idx.gloss(t);
      const note = g ? (g.readingMismatch ? `${g.gloss}（此處讀音與單字庫不同，請對照字典）` : g.gloss) : '（請參考上下文）';
      return `<tr><td class="jp">${JP.rubyToHtml(t.raw)}</td><td class="jp">${esc(t.kana)}</td><td class="romaji">${esc(t.romaji)}</td><td>${esc(note)}</td></tr>`;
    }).join('');
    return `<div class="tablewrap"><table><thead><tr><th>詞語</th><th>讀音</th><th class="romaji">羅馬拼音</th><th>意思／功能</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* 句子卡：日文（含振假名）、羅馬拼音、中文、播放、逐詞拆解 */
  function sentenceCard(src, zh, o) {
    o = o || {};
    const s = JP.sentence(src);
    return `<div class="sentence${o.cls ? ' ' + o.cls : ''}"${o.id ? ` id="${o.id}"` : ''} data-src="${esc(src)}" data-text="${esc(s.text)}">
      <div class="top"><div class="body">
        ${o.speaker ? `<span class="spk">${esc(o.speaker)}</span>` : ''}<span class="jp-text">${s.html}</span>
        <div class="romaji">${esc(s.romaji)}</div>
        ${zh != null ? `<div class="zh">${esc(zh)}</div>` : ''}
      </div><div class="tools">${o.noPlay ? '' : playBtn(s.text)}${o.noBreak ? '' : '<button class="icon-btn sm" data-act="bd" title="逐詞解釋" aria-label="逐詞解釋">詞</button>'}</div></div>
      <div class="breakdown" hidden></div></div>`;
  }

  function voiceNotice() {
    const st = Audio.getStatus();
    if (st === 'ready' || Audio.hasMap()) return '';
    if (st === 'loading') return notice('正在偵測瀏覽器的日文語音……請稍候幾秒。', '', '偵測語音中');
    return notice(esc(Audio.statusMessage()) + ' <a href="#/settings">前往設定檢查語音</a>', 'warn', '目前無法朗讀日文');
  }

  /* ---------- 版面互動 ---------- */
  App.render = function (html) { $('#main').innerHTML = html; };
  App.toast = function (msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(App._tt); App._tt = setTimeout(() => { t.className = ''; }, bad ? 4500 : 2200);
  };
  let confirmRes = null;
  App.modal = function (html) {
    const m = $('#modal'); m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
    const b = $('button, a, input, select', m); if (b) b.focus();
  };
  App.closeModal = function (val) {
    const m = $('#modal'); m.hidden = true; m.innerHTML = '';
    if (confirmRes) { const r = confirmRes; confirmRes = null; r(!!val); }
  };
  App.confirm = function (title, body, okLabel, danger) {
    return new Promise(res => {
      confirmRes = res;
      App.modal(`<h2>${esc(title)}</h2><div>${body}</div><div class="row" style="margin-top:1rem;justify-content:flex-end"><button class="btn" data-act="mcancel">取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="mok">${esc(okLabel || '確定')}</button></div>`);
    });
  };
  App.go = h => { if (location.hash === h) route(); else location.hash = h; };
  App.refresh = () => route(true);
  App.setKeys = f => { App.keyHandler = f; };
  Object.assign(App, { esc, $, $$, pad, fmtDate, bar, chip, notice, settings, rubyWord, jpSentenceHtml, fmtQ, vocabRuby, playBtn, breakdown, sentenceCard, voiceNotice });

  /* ---------- 設定套用 ---------- */
  App.applySettings = function () {
    const s = settings(), b = document.body, r = document.documentElement;
    b.dataset.furi = s.furigana ? 'on' : 'off';
    b.dataset.zh = s.zh ? 'on' : 'off';
    let rm = s.romaji;
    if (rm === 'auto') rm = Progress.currentLessonIndex() < 14 ? 'on' : 'off';
    b.dataset.romaji = rm;
    if (s.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', s.theme);
    r.style.setProperty('--scale', s.fontScale || 1);
    Audio.setRate(s.rate); Audio.setVoice(s.voiceURI);
  };

  /* ---------- 導覽 ---------- */
  const NAV = [
    ['home', '🏠', '首頁'], ['today', '✅', '今日任務'], ['lessons', '📚', '課程'], ['kana', 'あ', '五十音'], ['vocab', '🗂️', '單字'],
    ['grammar', '📐', '文法'], ['audiobook', '🎧', '有聲書'], ['listening', '👂', '聽力練習'], ['reading', '📖', '閱讀'], ['quiz', '📝', '測驗中心'],
    ['mistakes', '❗', '錯題本'], ['records', '📈', '學習紀錄'], ['settings', '⚙️', '設定與備份'], ['about', 'ℹ️', '使用說明']
  ];
  const NAV_ALIAS = { lesson: 'lessons', word: 'vocab', '': 'home' };
  const BOTTOM = ['home', 'today', 'vocab', 'quiz'];
  function buildNav() {
    $('#nav').innerHTML = NAV.map(([k, i, t], n) => (n === 2 || n === 10 ? '<div class="nav-sep"></div>' : '') + `<a href="#/${k}" data-nav="${k}"><span class="nav-ico">${i}</span><span>${t}</span></a>`).join('');
    $('#bottombar').innerHTML = BOTTOM.map(k => { const n = NAV.find(x => x[0] === k); return `<a href="#/${k}" data-nav="${k}"><span class="nav-ico">${n[1]}</span><span>${n[2]}</span></a>`; }).join('') +
      '<a href="#" data-act="menu" role="button"><span class="nav-ico">☰</span><span>更多</span></a>';
  }
  function setNav(name) {
    const key = NAV_ALIAS[name] || name;
    $$('[data-nav]').forEach(a => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function openNav(open) {
    document.body.classList.toggle('menu-open', open);
    $('#scrim').hidden = !open; $('#menuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function updateChips() {
    const n = Progress.streak();
    $('#streakChip').textContent = `🔥 ${n} 天`;
    $('#streakChip').title = n ? `已連續學習 ${n} 天` : '今天完成任一項學習就會開始計算連續天數';
    const st = Audio.getStatus(); const v = $('#voiceChip');
    const map = { ready: ['🔊 日文語音', ''], loading: ['⏳ 偵測語音', ''], 'no-voice': ['🔇 無日文語音', 'warn'], unsupported: ['🔇 無法朗讀', 'warn'] };
    let [t, c] = map[st] || map.loading;
    if ((st === 'no-voice' || st === 'unsupported') && Audio.hasMap()) { t = '🔊 錄音檔'; c = ''; }
    v.textContent = t; v.className = 'chip chip-btn ' + c;
  }
  App.updateChips = updateChips;

  /* ---------- 路由 ---------- */
  function route(again) {
    const hash = location.hash || '#/home';
    const parts = hash.replace(/^#\/?/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    const name = parts[0] || 'home';
    if (App.cleanup) { try { App.cleanup(); } catch (e) { console.error(e); } App.cleanup = null; }
    App.keyHandler = null; App.onVoiceChange = null;
    Audio.stopAll();
    openNav(false); App.closeModal();
    App.current = name;
    setNav(name);
    App.applySettings();
    updateChips();
    const view = App.views[name] || App.views.notfound;
    App.pageTitle = '';
    try {
      const r = view(parts.slice(1), name);
      if (typeof r === 'function') App.cleanup = r;
    } catch (e) {
      console.error(e);
      App.render(`<div class="card"><h1>發生錯誤</h1><p>這個頁面載入失敗：<code>${esc(e.message)}</code></p><p><a class="btn" href="#/home">回首頁</a></p></div>`);
    }
    if (again !== true) window.scrollTo(0, 0);
    document.title = (App.pageTitle ? App.pageTitle + '｜' : '') + '日本語ノート N5 自學系統';
  }

  /* ---------- 事件 ---------- */
  function bindEvents() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (el) { const f = App.acts[el.dataset.act]; if (f) { if (el.tagName === 'A') e.preventDefault(); f(el, e); } return; }
      if (e.target.id === 'modal') App.closeModal(false);
      if (e.target.id === 'scrim') openNav(false);
    });
    document.addEventListener('change', e => { const el = e.target.closest('[data-on]'); if (el && App.ons[el.dataset.on]) App.ons[el.dataset.on](el, e); });
    document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && App.ins[el.dataset.in]) App.ins[el.dataset.in](el, e); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#modal').hidden) App.closeModal(false); else openNav(false); return; }
      if (App.keyHandler && !$('#modal').hidden === false && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.ctrlKey && !e.metaKey && !e.altKey) App.keyHandler(e);
    });
    window.addEventListener('hashchange', () => route());
    $('#menuBtn').addEventListener('click', () => openNav(!document.body.classList.contains('menu-open')));
    $('#voiceChip').addEventListener('click', () => App.go('#/settings'));
    window.addEventListener('beforeunload', () => { try { Store.saveNow(); } catch (e) { /* ignore */ } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { try { Store.saveNow(); } catch (e) { /* ignore */ } } });
  }

  App.acts.menu = () => openNav(true);
  App.acts.mok = () => App.closeModal(true);
  App.acts.mcancel = () => App.closeModal(false);
  App.acts.closeModal = () => App.closeModal(false);
  App.acts.say = el => {
    const s = settings();
    Audio.speak(el.dataset.t, { rate: el.dataset.slow ? s.slowRate : s.rate });
  };
  App.acts.bd = el => {
    const box = el.closest('.sentence'); const bd = $('.breakdown', box);
    if (bd.hidden) { if (!bd.innerHTML) bd.innerHTML = breakdown(box.dataset.src); bd.hidden = false; } else bd.hidden = true;
  };
  App.acts.favToggle = el => {
    const on = Progress.toggleFav(el.dataset.id);
    el.textContent = on ? '★' : '☆'; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  let lastVoiceToast = 0;
  function bindAudioEvents() {
    Audio.onChange(ev => {
      if (ev.type === 'status') { updateChips(); if (App.onVoiceChange) App.onVoiceChange(); }
      else if (ev.type === 'novoice') {
        if (Date.now() - lastVoiceToast > 4000) { lastVoiceToast = Date.now(); App.toast(Audio.getStatus() === 'loading' ? '語音還在偵測中，請稍後再試。' : '沒有可用的日文語音，無法朗讀（請看「設定」頁的說明）。', true); }
      } else if (ev.type === 'silent' || ev.type === 'error') App.toast(ev.message, true);
    });
  }

  /* ================= 首頁 ================= */
  function dayRows(n) {
    const out = []; const d = new Date(); const days = Store.get().days;
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      const key = Store.today(x); const r = days[key] || {};
      out.push({ key, label: `${x.getMonth() + 1}/${x.getDate()}`, wd: '日一二三四五六'[x.getDay()], words: (r.newWords || 0) + (r.reviews || 0), quizzes: r.quizzes || 0, active: !!r.active, r });
    }
    return out;
  }
  App.dayRows = dayRows;
  function daybars(rows, field) {
    const max = Math.max(1, ...rows.map(r => r[field]));
    return `<div class="daybars" role="img" aria-label="近 ${rows.length} 天學習量">${rows.map(r => `<div class="b${r[field] ? '' : ' z'}" style="height:${Math.max(3, r[field] / max * 100)}%" title="${r.label}：${r[field]}"></div>`).join('')}</div>`;
  }
  App.daybars = daybars;

  function backupNotice() {
    const s = Store.get();
    const hasData = Object.keys(s.cards).length || s.quizzes.length || Object.keys(s.lessons).length;
    if (!Store.isPersistent()) return notice('瀏覽器目前不允許儲存資料（可能是無痕模式或封鎖網站資料），關閉分頁後進度會消失。請改用一般視窗，並定期到「設定與備份」匯出。', 'bad', '進度無法保存');
    if (!hasData) return '';
    const since = s.lastExport ? Math.floor((Date.now() - s.lastExport) / 86400000) : null;
    if (since === null && Progress.daysSinceStart() >= 3) return notice('進度只存在這個瀏覽器的 localStorage，不是雲端備份。清除瀏覽資料、換瀏覽器或換電腦都會遺失。 <a href="#/settings">立即匯出備份</a>', 'warn', '你還沒有備份過學習紀錄');
    if (since !== null && since >= 14) return notice(`上次匯出是 ${since} 天前。 <a href="#/settings">再匯出一次</a>`, 'warn', '該備份了');
    return '';
  }

  App.views.home = function () {
    const p = Progress.plan(), cur = p.current, st = Progress.stageOf(cur), cnt = Progress.counts();
    const gp = Progress.goalProgress(), done = Progress.lessonsDoneCount(), total = idx.lessons.length;
    const real = p.tasks.filter(t => !t.na), tasksDone = real.filter(t => t.done).length;
    const first = p.tasks.find(t => !t.done);
    const ret = Progress.retention(30), acc = Progress.quizAccuracy(10), streak = Progress.streak();
    const newLeft = Progress.newRemainingToday();
    const weekNow = Math.floor(Progress.daysSinceStart() / 7) + 1;
    const wg = Progress.weakGrammar(4), wv = Progress.weakVocab(6), wk = Progress.weakKana(8), rec = Progress.recommend(3);
    const rows = dayRows(7);
    const stageBars = D.stages.map(s => { const ls = idx.lessons.filter(l => l.stage === s.id); const d = ls.filter(l => Progress.isLessonDone(l.id)).length; return `<div class="hbar" style="grid-template-columns:7rem 1fr 3.6rem"><span>${esc(s.name.split('：')[0])}</span>${bar(d / ls.length * 100, d === ls.length ? 'ok' : '')}<span class="right">${d}/${ls.length}</span></div>`; }).join('');
    const pace = gp.ahead >= 5 ? `進度比時間表超前 ${gp.ahead}%。` : gp.ahead <= -10 ? `進度落後時間表約 ${-gp.ahead}%：不用急，每天固定做完「今日任務」就會追上。` : '進度大致符合時間表。';
    App.render(`
      <h1>歡迎回來</h1>
      ${backupNotice()}${voiceNotice()}
      <div class="card">
        <div class="row between"><div><div class="muted small">${esc(st.name)}</div>
          <h2 style="margin:.1rem 0">目前學到 ${esc(cur.id)}　${esc(cur.title)}</h2>
          <div class="muted small">教材第 ${cur.week} 週／共 26 週　·　你開始學習已 ${Progress.daysSinceStart()} 天（計畫第 ${weekNow} 週）</div></div>
          <div class="row">${first ? `<a class="btn primary lg" href="${first.href}">▶ 開始今日課程</a>` : '<a class="btn primary lg" href="#/today">今日任務已完成 🎉</a>'}</div></div>
        <div class="row" style="margin-top:.8rem">
          <a class="btn" href="#/vocab/review">🗂️ 單字複習${cnt.due ? `（${cnt.due}）` : ''}</a>
          <a class="btn" href="#/listening">👂 聽力練習</a>
          <a class="btn" href="#/quiz/daily">📝 每日測驗</a>
          <a class="btn" href="#/audiobook/${cur.id}">🎧 有聲書</a>
        </div>
      </div>
      <div class="grid g4 keep2">
        <div class="card stat"><div class="n">${tasksDone}/${real.length}</div><div class="l">今日任務完成</div></div>
        <div class="card stat"><div class="n">${cnt.due}</div><div class="l">待複習單字${newLeft ? `　·　今天還可學 ${newLeft} 個新字` : ''}</div></div>
        <div class="card stat"><div class="n">${done}/${total}</div><div class="l">課程完成</div></div>
        <div class="card stat"><div class="n">${streak}<span class="small"> 天</span></div><div class="l">連續學習</div></div>
        <div class="card stat"><div class="n">${ret == null ? '—' : ret + '%'}</div><div class="l">30 天單字記憶保持率${ret == null ? '（尚無複習紀錄）' : ''}</div></div>
        <div class="card stat"><div class="n">${acc == null ? '—' : acc + '%'}</div><div class="l">最近 10 次測驗正確率${acc == null ? '（尚無測驗）' : ''}</div></div>
        <div class="card stat"><div class="n">${cnt.learning + cnt.due + cnt.familiar}/${idx.vocab.length}</div><div class="l">已接觸的單字（已熟悉 ${cnt.familiar}）</div></div>
        <div class="card stat"><div class="n">${gp.daysLeft}</div><div class="l">距離 6 個月目標剩餘天數</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>今日任務</h2>${taskList(p.tasks)}<p class="small muted" style="margin:.6rem 0 0"><a href="#/today">查看完整的今日安排</a></p></div>
        <div class="card"><h2>6 個月目標進度</h2>
          <div class="small muted">時間已過 ${gp.elapsedPct}%</div>${bar(gp.elapsedPct, 'warn')}
          <div class="small muted" style="margin-top:.5rem">課程已完成 ${gp.donePct}%</div>${bar(gp.donePct, 'ok')}
          <p class="small" style="margin:.6rem 0">${pace}</p>${stageBars}
          <p class="tiny muted" style="margin:.5rem 0 0">完成全部課程只代表走完這套自學教材，不保證通過 JLPT N5。請另外用官方公開的樣題確認實力。</p></div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>近 7 天學習量</h2>${daybars(rows, 'words')}
          <div class="row between tiny muted" style="margin-top:.3rem">${rows.map(r => `<span>${r.label}</span>`).join('')}</div>
          <p class="tiny muted" style="margin:.4rem 0 0">計算方式：每天學習的新單字數＋單字複習／答題次數。</p></div>
        <div class="card"><h2>弱點</h2>${wg.length || wv.length || wk.length ? `
          ${wg.length ? `<div class="small muted">文法（錯誤率高）</div><div class="row" style="margin-bottom:.5rem">${wg.map(w => `<a class="chip bad" href="#/grammar/${w.id}">${esc(w.g.name)}</a>`).join('')}</div>` : ''}
          ${wv.length ? `<div class="small muted">常錯單字</div><div class="row" style="margin-bottom:.5rem">${wv.map(w => `<a class="chip bad jp" href="#/word/${encodeURIComponent(w.v.id)}">${esc(w.v.word)} ×${w.wrong}</a>`).join('')}</div>` : ''}
          ${wk.length ? `<div class="small muted">常錯假名</div><div class="row" style="margin-bottom:.5rem">${wk.map(w => `<span class="chip bad jp">${esc(w.k)} ×${w.wrong}</span>`).join('')}</div>` : ''}
          ${rec.length ? `<div class="small muted">建議重新學習</div>${rec.map(r => `<div><a href="#/lesson/${r.lesson.id}">${r.lesson.id} ${esc(r.lesson.title)}</a> <span class="tiny muted">（${r.why.join('、')}）</span></div>`).join('')}` : ''}`
          : '<p class="muted">還沒有資料。做完第一份測驗後，這裡會列出你常錯的文法、單字與假名，並推薦要重讀的課。</p>'}</div>
      </div>`);
  };

  function taskList(tasks) {
    return tasks.map(t => t.na ? `<div class="task na"><span class="tick">–</span><div style="flex:1;min-width:0"><div class="tname">${esc(t.name)}</div><div class="small muted">${esc(t.detail)}</div></div></div>` : `<div class="task${t.done ? ' done' : ''}${t.warn ? ' warn' : ''}"><span class="tick">${t.done ? '✓' : ''}</span>
      <div style="flex:1;min-width:0"><div class="tname">${esc(t.name)} <span class="tiny muted">${t.min ? '約 ' + t.min + ' 分' : ''}</span></div><div class="small muted">${esc(t.detail)}</div></div>
      <a class="btn sm${t.done ? '' : ' primary'}" href="${t.href}">${t.done ? '再做一次' : '開始'}</a></div>`).join('');
  }

  /* ================= 今日任務 ================= */
  App.views.today = function () {
    App.pageTitle = '今日任務';
    const p = Progress.plan(); const cur = p.current;
    const left = p.tasks.filter(t => !t.done && !t.na).length;
    App.render(`
      <h1>今日任務</h1>
      <p class="muted">${fmtDate(Date.now())}　·　每天約 30–45 分鐘。任務會依你的進度自動調整${p.weak ? '（上一課測驗偏低，今天先複習它）' : ''}。</p>
      ${voiceNotice()}
      ${p.weak ? notice(`上一課「${esc(p.weak.lesson.title)}」的測驗只有 ${p.weak.score}%（建議至少 70%）。先把它補穩，再進新課，後面會比較輕鬆。`, 'warn', '建議先複習') : ''}
      <div class="card">${left ? `<div class="small muted" style="margin-bottom:.4rem">還有 ${left} 項未完成</div>` : notice('今天的核心任務都完成了，辛苦了！明天繼續。想多練習的話可以到測驗中心自由練習。', 'ok', '全部完成 🎉')}${taskList(p.tasks)}</div>
      ${p.extras.length ? `<div class="card"><h2>額外安排</h2>${taskList(p.extras)}</div>` : ''}
      <div class="card"><h2>每日流程說明</h2>
        ${D.dailyFlow.map(f => `<div class="task"><span class="tick" style="border-style:dashed"></span><div><div class="tname">${esc(f.name)} <span class="tiny muted">約 ${f.min} 分鐘</span></div><div class="small muted">${esc(f.desc)}</div></div></div>`).join('')}
        <p class="small muted" style="margin:.6rem 0 0">時間不夠時，至少做「複習舊單字」和「每日測驗」，這兩項最能防止遺忘。每週日（或距離上次超過 7 天）會安排每週複習，每月一次階段測驗。</p></div>
      <div class="card"><div class="muted small">目前課程</div><h3><a href="#/lesson/${cur.id}">${cur.id}　${esc(cur.title)}</a></h3>
        <ul>${cur.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`);
  };

  /* ================= 課程總覽 ================= */
  App.views.lessons = function () {
    App.pageTitle = '課程';
    const cur = Progress.currentLesson();
    const onlyTodo = !!App.tmp.onlyTodo;
    const html = D.stages.map(s => {
      const ls = idx.lessons.filter(l => l.stage === s.id);
      const d = ls.filter(l => Progress.isLessonDone(l.id)).length;
      return `<div class="card"><div class="row between"><h2 style="margin:0">${esc(s.name)}</h2><span class="chip">${d}/${ls.length} 課完成</span></div>
        <p class="small muted">第 ${s.weeks[0]}–${s.weeks[1]} 週。${esc(s.desc)}</p>
        ${ls.filter(l => !onlyTodo || !Progress.isLessonDone(l.id)).map(l => {
          const stt = Progress.lessonStatus(l.id); const r = stt.rec;
          const tag = stt.done ? chip('已完成', 'ok') : l.id === cur.id ? chip('建議從這裡開始', 'acc') : stt.started ? chip('進行中', 'warn') : chip('未開始');
          return `<a class="lessonrow" href="#/lesson/${l.id}"><span class="id">${l.id}</span><span><strong>${esc(l.title)}</strong><br><span class="tiny muted">第 ${l.week} 週${r.quizBest != null ? '　·　測驗最佳 ' + r.quizBest + '%' : ''}${(idx.vocabByLesson.get(l.id) || []).length ? '　·　單字 ' + idx.vocabByLesson.get(l.id).length : ''}</span></span>${tag}</a>`;
        }).join('') || '<p class="muted">這個階段的課程都完成了。</p>'}</div>`;
    }).join('');
    App.render(`<h1>課程總覽</h1><p class="muted">共 ${idx.lessons.length} 課、26 週。建議依順序學習；前面的課還沒穩，後面會很吃力。</p>
      <div class="row" style="margin-bottom:1rem"><label class="chk"><input type="checkbox" data-on="onlyTodo" ${onlyTodo ? 'checked' : ''}> 只顯示未完成的課</label><a class="btn sm" href="#/lesson/${cur.id}">跳到建議的課 ${cur.id}</a></div>${html}`);
  };
  App.ons.onlyTodo = el => { App.tmp.onlyTodo = el.checked; route(true); };

  App.views.notfound = function () {
    App.render('<div class="card"><h1>找不到這個頁面</h1><p><a class="btn primary" href="#/home">回首頁</a></p></div>');
  };

  /* ================= 啟動 ================= */
  App.start = function () {
    try {
      idx = root.DataIndex.buildIndex(D); App.idx = idx;
      QG.init(idx, D); Progress.init(idx, D);
      Store.load();
    } catch (e) {
      console.error(e);
      document.getElementById('main').innerHTML = `<div class="card"><h1>啟動失敗</h1><p>${esc(e.message)}</p><p>請確認所有檔案都在、並用本機伺服器開啟（參考 README）。</p></div>`;
      return;
    }
    Audio.init();
    buildNav(); bindEvents(); bindAudioEvents();
    App.applySettings(); updateChips();
    if (!location.hash) location.hash = '#/home'; else route();
  };
})(window);
