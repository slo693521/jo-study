/* view-quiz.js — 測驗中心、答題流程（練習／模擬考）、成績分析、錯題本、閱讀理解 */
(function (root) {
  'use strict';
  const App = root.App, JP = root.JP, D = root.JP_DATA, Progress = root.Progress, Store = root.Store, Audio = root.JPAudio, QG = root.QuizGen;
  const { esc, chip, notice, bar, playBtn, fmtQ } = App;
  const I = () => App.idx;
  const CAT = Progress.CAT_NAME;
  const LETTERS = 'ABCDEFGH';
  let Q = null, timer = null;
  App.debugQuiz = () => Q;

  /* ---------- 範圍 ---------- */
  function scopeIds(scope) {
    const cur = Progress.currentLesson().id;
    if (scope === 'cur') return [cur];
    if (scope === 'every') return I().lessons.map(l => l.id);
    return QG.lessonsUpTo(cur);
  }
  function kanaSetsFor(scope) {
    const ids = new Set(scopeIds(scope));
    const ks = Object.keys(D.kana.sets);
    if (scope === 'cur') { const k = ks.filter(k => ids.has(k)); if (k.length) return k; }
    const cur = I().lessonOrder.get(Progress.currentLesson().id);
    return scope === 'every' ? ks : ks.filter(k => I().lessonOrder.get(k) <= cur);
  }
  const todayKey = () => Store.today();

  /* ================= 測驗中心 ================= */
  App.views.quiz = function (parts) {
    if (parts[0]) return runRoute(parts);
    App.pageTitle = '測驗中心';
    const st = Store.get(), cur = Progress.currentLesson();
    const scope = App.tmp.qscope || 'all', n = App.tmp.qn || 10;
    const lastMock = id => { const r = st.quizzes.filter(q => q.mode === 'mock' && q.mockId === id).slice(-1)[0]; return r ? `上次 ${r.pct}%（${App.fmtDate(r.t)}）` : '尚未作答'; };
    const recent = st.quizzes.slice(-5).reverse();
    const types = Object.entries(QG.TYPES).filter(([k]) => k !== 'mock' && k !== 'reading');
    App.render(`<h1>測驗中心</h1>${App.voiceNotice()}
      <div class="grid g3">
        <a class="card linkcard" href="#/quiz/daily"><h3>📝 每日測驗</h3><p class="small muted">10 題，混合新舊內容。同一天內容固定。</p></a>
        <a class="card linkcard" href="#/quiz/lesson/${cur.id}"><h3>📘 目前課程測驗</h3><p class="small muted">${cur.id} ${esc(cur.title)}（通過標準 80%）</p></a>
        <a class="card linkcard" href="#/quiz/weekly"><h3>🗓️ 每週複習</h3><p class="small muted">15 題，涵蓋至今學過的內容。</p></a>
        <a class="card linkcard" href="#/quiz/monthly"><h3>📅 每月階段測驗</h3><p class="small muted">30 題，含假名、單字、文法。</p></a>
        <a class="card linkcard" href="#/quiz/redo/all"><h3>❗ 重做錯題</h3><p class="small muted">${st.mistakes.filter(m => !m.mastered).length} 題待加強。<a href="#/mistakes">錯題本</a></p></a>
        <a class="card linkcard" href="#/reading"><h3>📖 短篇閱讀理解</h3><p class="small muted">12 篇自編短文，每篇 2–3 題。</p></a>
      </div>
      <div class="card"><h2>依題型練習</h2>
        <div class="row" style="margin-bottom:.8rem"><label>範圍 <select data-on="qscope"><option value="cur" ${scope === 'cur' ? 'selected' : ''}>目前這一課</option><option value="all" ${scope === 'all' ? 'selected' : ''}>學過的所有課（到目前進度）</option><option value="every" ${scope === 'every' ? 'selected' : ''}>全部教材</option></select></label>
          <label>題數 <select data-on="qn">${[5, 10, 20, 30].map(x => `<option ${n === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
        <div class="grid g3">${types.map(([k, t]) => `<button class="card tight linkcard" style="text-align:left;cursor:pointer;font:inherit;color:inherit" data-act="qType" data-t="${k}"><b>${esc(t.name)}</b><div class="small muted">${esc(t.desc)}</div></button>`).join('')}</div></div>
      <div class="card"><h2>綜合模擬考</h2><p class="small muted">依 N5 公開題型分為「文字・語彙」「文法」「讀解」「聽解」四部分，共 54 題，限時 47 分鐘。兩回的單字題互不重複。這是自編的自我檢測，不是正式考題，也不能預測實際成績。建議學完 L49 後再做。</p>
        <div class="row"><a class="btn primary" href="#/quiz/mock/M1">模擬考（1）</a><span class="small muted">${lastMock('M1')}</span><a class="btn primary" href="#/quiz/mock/M2">模擬考（2）</a><span class="small muted">${lastMock('M2')}</span></div></div>
      <div class="card"><h2>最近的測驗</h2>${recent.length ? `<div class="tablewrap"><table><thead><tr><th>日期</th><th>類型</th><th>成績</th></tr></thead><tbody>${recent.map(r => `<tr><td>${App.fmtDate(r.t, true)}</td><td>${esc(r.label || r.mode)}</td><td>${r.correct}/${r.total}（${r.pct}%）</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有測驗紀錄。</p>'}</div>`);
  };
  App.ons.qscope = el => { App.tmp.qscope = el.value; };
  App.ons.qn = el => { App.tmp.qn = +el.value; };
  App.acts.qType = el => App.go(`#/quiz/type/${el.dataset.t}/${App.tmp.qn || 10}/${App.tmp.qscope || 'all'}`);

  /* ================= 路由：產生題目 ================= */
  function runRoute(parts) {
    const kind = parts[0];
    const cur = Progress.currentLesson();
    if (kind === 'lesson') {
      const id = parts[1] || cur.id, l = I().lById.get(id); if (!l) return App.views.notfound();
      return start({ mode: 'lesson', label: `課程測驗 ${id} ${l.title}`, lesson: id, back: `#/lesson/${id}`, gen: () => QG.lessonQuiz(id, Math.random) });
    }
    if (kind === 'daily') return start({ mode: 'daily', label: '每日測驗', back: '#/today', gen: () => QG.daily(todayKey(), scopeIds('all'), { weakVocab: Progress.weakVocab(10).map(w => w.v) }) });
    if (kind === 'weekly') return start({ mode: 'weekly', label: '每週複習測驗', back: '#/today', gen: () => QG.weekly(todayKey(), scopeIds('all')) });
    if (kind === 'monthly') return start({ mode: 'monthly', label: '每月階段測驗', back: '#/today', gen: () => QG.monthly(todayKey(), scopeIds('all')) });
    if (kind === 'type') {
      const t = parts[1], n = +parts[2] || 10, scope = parts[3] || 'all';
      if (!QG.TYPES[t]) return App.views.notfound();
      if (t === 'reading') return App.go('#/reading');
      if (t === 'mock') return App.go('#/quiz/mock/M1');
      return start({ mode: 'practice', label: `題型練習：${QG.TYPES[t].name}`, back: '#/quiz', gen: () => QG.byType(t, scopeIds(scope), n, JP.seeded(Date.now() & 0xffffff), { kanaSets: kanaSetsFor(scope) }), needVoice: t === 'listen' });
    }
    if (kind === 'grammar') {
      const g = I().gById.get(parts[1]); if (!g) return App.views.notfound();
      return start({ mode: 'practice', label: `文法練習 ${g.id} ${g.name}`, back: `#/grammar/${g.id}`, gen: () => g.exercises.map(ex => QG.grammarQ(ex, g, Math.random)) });
    }
    if (kind === 'mock') return mockIntro(parts[1]);
    if (kind === 'redo') return redoRoute(parts);
    return App.views.notfound();
  }

  function redoRoute(parts) {
    const ms = Store.get().mistakes.filter(m => !m.mastered && m.snap);
    let list;
    if (parts[1] === 'key') list = ms.filter(m => m.key === parts[2]);
    else if (parts[1] === 'all') list = ms.slice().sort((a, b) => b.wrong - a.wrong || (b.last || 0) - (a.last || 0)).slice(0, 20);
    else list = ms.filter(m => m.cat === parts[1]).slice(0, 20);
    return start({ mode: 'review', label: '錯題重做', back: '#/mistakes', empty: '目前沒有需要重做的錯題。', gen: () => list.map(m => { const q = QG.fromSnapshot(m.snap); if (q.type === 'mc' && q.options) q.options = JP.shuffle(q.options); if (q.type === 'order' && q.chunks) q.chunks = JP.shuffle(q.chunks); return q; }) });
  }

  /* ---------- 模擬考說明頁 ---------- */
  function mockIntro(id) {
    const m = (D.mocks || []).find(x => x.id === id); if (!m) return App.views.notfound();
    App.pageTitle = m.title;
    const done = Progress.lessonsDoneCount(), cur = Progress.currentLesson();
    App.render(`<p class="small"><a href="#/quiz">← 測驗中心</a></p><div class="card"><h1>${esc(m.title)}</h1>
      <ul><li>文字・語彙 20 題（12 分鐘）、文法 15 題（10 分鐘）、讀解 9 題（13 分鐘）、聽解 10 題（12 分鐘），共 54 題。</li>
      <li>聽解的對話最多只能播放 2 次，和正式考試接近；請戴耳機、先確認「設定」頁能發出日文語音。</li>
      <li>作答中不會顯示對錯，交卷後才看解析；中途離開這一頁不會記錄成績。</li>
      <li>成績僅供自我檢測：語言知識（文字・語彙・文法・讀解）換算 120 分，聽解換算 60 分，總分 80 分且兩項都過門檻（38／19 分）時顯示「接近通過水準」。這是仿官方計分方式的自行估算，不是官方成績。</li></ul>
      ${done < 45 ? notice(`你目前在 ${cur.id}，完成的課程是 ${done}/54。模擬考以 L49 之前的內容為範圍，太早做會有很多沒學過的內容，成績參考價值低。`, 'warn') : ''}
      ${App.voiceNotice()}
      <div class="row"><button class="btn primary lg" data-act="mockGo" data-id="${id}" data-timed="1">開始（計時 47 分鐘）</button><button class="btn" data-act="mockGo" data-id="${id}" data-timed="0">不計時練習</button></div></div>`);
  }
  App.acts.mockGo = el => {
    const id = el.dataset.id, timed = el.dataset.timed === '1';
    const m = D.mocks.find(x => x.id === id);
    let ex = [];
    if (id !== 'M1') ex = QG.mock(D.mocks.find(x => x.id === 'M1')).usedVocab;
    const mk = QG.mock(m, ex);
    const qs = [].concat(...mk.sections.map(s => s.items));
    startQuiz({ mode: 'mock', label: m.title, mockId: id, exam: true, timed, sections: mk.sections.map(s => ({ key: s.key, name: s.name, group: s.group, minutes: s.minutes })), qs, back: '#/quiz', maxPlays: 2 });
  };

  /* ================= 啟動答題 ================= */
  function start(o) {
    let qs;
    try { qs = o.qs || o.gen(); } catch (e) { console.error(e); qs = []; }
    qs = (qs || []).filter(Boolean);
    if (!qs.length) {
      App.render(`<p class="small"><a href="${o.back || '#/quiz'}">← 返回</a></p><div class="card center"><h2>沒有題目</h2><p>${esc(o.empty || '這個範圍內沒有足夠的資料可以出題，換一個範圍或先學更多課程。')}</p><a class="btn" href="#/quiz">回測驗中心</a></div>`);
      return;
    }
    return startQuiz(Object.assign({}, o, { qs }));
  }
  function startQuiz(o) {
    clearInterval(timer);
    Audio.stopAll();
    Q = Object.assign({ i: 0, t0: Date.now(), st: [], done: false }, o);
    Q.st = Q.qs.map(() => ({ resp: null, done: false, correct: null, order: [], sel: {}, plays: 0, skipped: false }));
    Q.totalMin = o.sections ? o.sections.reduce((a, s) => a + s.minutes, 0) : 0;
    if (o.exam && o.timed) { Q.deadline = Date.now() + Q.totalMin * 60000; timer = setInterval(tick, 1000); }
    App.pageTitle = o.label;
    App.render('<div class="qwrap" id="qa"></div>');
    drawQ();
    App.cleanup = () => { clearInterval(timer); Q = null; };
    App.setKeys(e => {
      if (!Q || Q.done) return;
      const q = Q.qs[Q.i], st = Q.st[Q.i];
      if (q.type === 'mc') {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= q.options.length && !(st.done && !Q.exam)) { App.acts.qPick({ dataset: { n: n - 1 } }); return; }
        if (e.key >= 'a' && e.key <= 'h') { const k = e.key.charCodeAt(0) - 97; if (k < q.options.length && !(st.done && !Q.exam)) App.acts.qPick({ dataset: { n: k } }); return; }
      }
      if (e.key === 'Enter' && !Q.exam && st.done) { e.preventDefault(); App.acts.qNext(); }
    });
  }
  function tick() {
    if (!Q || !Q.deadline) return;
    const left = Q.deadline - Date.now();
    const el = App.$('#timer');
    if (left <= 0) { clearInterval(timer); App.toast('時間到，自動交卷。', true); finishQuiz(); return; }
    if (el) { const s = Math.ceil(left / 1000); el.textContent = `${Math.floor(s / 60)}:${App.pad(s % 60)}`; el.className = 'chip ' + (s < 300 ? 'bad' : 'acc'); }
  }

  /* ================= 題目畫面 ================= */
  function answerText(q) {
    if (q.type === 'mc') return fmtQ(q.answer);
    if (q.type === 'order') return `<span class="jp">${JP.sentence(q.answer.join(' ') + ' ' + (q.tail || '')).html}</span>`;
    if (q.type === 'match') return q.pairs.map(p => `<span class="jp">${esc(p.l)}</span>＝${esc(p.r)}`).join('　');
    return '';
  }
  function respText(q, st) {
    if (q.type === 'mc') return st.resp == null ? '（未作答）' : fmtQ(st.resp);
    if (q.type === 'order') return st.order.length ? `<span class="jp">${JP.sentence(st.order.map(i => q.chunks[i]).join(' ') + ' ' + (q.tail || '')).html}</span>` : '（未作答）';
    if (q.type === 'match') return q.pairs.map(p => `<span class="jp">${esc(p.l)}</span>＝${esc(st.sel[p.l] || '？')}`).join('　');
    return '';
  }

  function passageHtml(q) {
    if (!q.passageId) return '';
    const r = (D.readings || []).find(x => x.id === q.passageId); if (!r) return '';
    return `<details class="fold" open><summary>📖 ${esc(r.title)}</summary>${r.lines.map(l => App.sentenceCard(l[0], null, { noBreak: false })).join('')}
      <details class="fold"><summary>顯示中文翻譯（想不通再看）</summary>${r.lines.map(l => `<p class="zh" style="margin:.3rem 0">${esc(l[1])}</p>`).join('')}</details></details>`;
  }
  function listenHtml(q, st) {
    if (!q.listenId && !(q.listen && q.speak)) return '';
    const left = Q.maxPlays ? Q.maxPlays - st.plays : null;
    const dis = left === 0 ? 'disabled' : '';
    return `<div class="row" style="margin:.4rem 0 .8rem"><button class="btn primary" data-act="qListen" ${dis}>🔊 播放${q.listenId ? '對話' : '發音'}${left != null ? `（剩 ${left} 次）` : ''}</button>
      ${Q.maxPlays ? '' : '<button class="btn" data-act="qListen" data-slow="1">🐢 慢速</button>'}<button class="btn" data-act="qStopListen">⏹ 停止</button></div>
      ${(Audio.available() ? '' : `<div class="notice warn">目前沒有日文語音，這題無法聽。你可以 <button class="btn sm" data-act="qSkip">略過這題（不計分）</button></div>`)}`;
  }
  function transcriptHtml(q) {
    if (!q.listenId) return '';
    const t = (D.listening || []).find(x => x.id === q.listenId); if (!t) return '';
    return `<div style="margin-top:.8rem"><b>對話原文：</b>${t.lines.map(l => App.sentenceCard(l[1], l[2], { speaker: l[0] + '：' })).join('')}</div>`;
  }

  function drawQ() {
    const el = App.$('#qa'); if (!el || !Q) return;
    const q = Q.qs[Q.i], st = Q.st[Q.i], n = Q.qs.length;
    const showFeedback = st.done && !Q.exam;
    const sec = Q.sections && Q.sections.find(s => s.key === q.section);
    let body = '';
    if (q.type === 'mc') {
      body = `<div class="opts${q.bigOptions ? ' two' : ''}">${q.options.map((o, k) => {
        let cls = 'opt' + (q.bigOptions ? ' bigo' : '');
        if (showFeedback) { if (o === q.answer) cls += ' correct'; else if (o === st.resp) cls += ' wrong'; }
        else if (Q.exam && st.resp === o) cls += ' picked';
        return `<button class="${cls}" data-act="qPick" data-n="${k}" ${showFeedback ? 'disabled' : ''}><span class="lt">${LETTERS[k]}</span><span>${fmtQ(o)}</span></button>`;
      }).join('')}</div>`;
    } else if (q.type === 'order') {
      const full = st.order.length === q.chunks.length;
      body = `<div class="chunks" aria-label="你排好的句子">${st.order.map((ci, k) => `<button class="chunk" data-act="qUnorder" data-k="${k}" ${showFeedback ? 'disabled' : ''}>${JP.rubyToHtml(q.chunks[ci])}</button>`).join('')}${q.tail ? `<span class="jp" style="align-self:center">${esc(q.tail)}</span>` : ''}${st.order.length ? '' : '<span class="muted small">點下面的詞語，依序排進來</span>'}</div>
        <div class="chunks" style="border-style:solid">${q.chunks.map((c, ci) => `<button class="chunk${st.order.includes(ci) ? ' used' : ''}" data-act="qOrder" data-ci="${ci}" ${showFeedback ? 'disabled' : ''}>${JP.rubyToHtml(c)}</button>`).join('')}</div>
        ${showFeedback ? '' : `<div class="row"><button class="btn" data-act="qOrderReset">重排</button>${Q.exam ? '' : `<button class="btn primary" data-act="qOrderCheck" ${full ? '' : 'disabled'}>檢查答案</button>`}</div>`}`;
    } else if (q.type === 'match') {
      const full = q.pairs.every(p => st.sel[p.l]);
      body = q.pairs.map(p => `<div class="matchrow"><div class="kana-l jp">${esc(p.l)}</div><select data-on="qMatch" data-l="${esc(p.l)}" aria-label="${esc(p.l)} 的羅馬拼音" ${showFeedback ? 'disabled' : ''}><option value="">選擇羅馬拼音…</option>${q.options.map(o => `<option ${st.sel[p.l] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`).join('') +
        (showFeedback ? '' : (Q.exam ? '' : `<div class="row"><button class="btn primary" data-act="qMatchCheck" ${full ? '' : 'disabled'}>檢查答案</button></div>`));
    }
    let fb = '';
    if (showFeedback) {
      const note = st.correct ? '' : (q.type === 'mc' && q.optNotes && q.optNotes[st.resp] ? `<div class="small">你選的：${esc(q.optNotes[st.resp])}</div>` : '');
      fb = `<div class="feedback ${st.correct ? 'ok' : 'bad'}" role="status"><strong>${st.correct ? '答對了 ✔' : '答錯了 ✘'}</strong>
        ${st.correct ? '' : `<div>你的答案：${respText(q, st)}</div>`}<div>正確答案：${answerText(q)}</div>${note}
        ${q.explain ? `<div class="small" style="margin-top:.4rem">解析：${esc(q.explain)}</div>` : ''}
        ${q.type === 'mc' && q.cat === 'grammar' && q.ref && q.ref.grammar ? `<div class="small"><a href="#/grammar/${q.ref.grammar}">查看這個文法</a></div>` : ''}${transcriptHtml(q)}</div>
        <div class="row" style="margin-top:.8rem"><button class="btn primary lg" data-act="qNext">${Q.i === n - 1 ? '看成績' : '下一題 →'}</button></div>`;
    }
    const nav = Q.exam ? `<div class="qnav" aria-label="題號">${Q.qs.map((qq, k) => `<button class="${Q.st[k].resp != null || Q.st[k].order.length || Object.keys(Q.st[k].sel).length ? 'done' : ''}${k === Q.i ? ' cur' : ''}" data-act="qGo" data-k="${k}" aria-label="第 ${k + 1} 題">${k + 1}</button>`).join('')}</div>
      <div class="row between"><button class="btn" data-act="qGo" data-k="${Q.i - 1}" ${Q.i === 0 ? 'disabled' : ''}>← 上一題</button><button class="btn" data-act="qGo" data-k="${Q.i + 1}" ${Q.i === n - 1 ? 'disabled' : ''}>下一題 →</button><button class="btn primary" data-act="qFinish">交卷</button></div>` : '';
    el.innerHTML = `
      <div class="qtop"><div><span class="chip acc">${esc(CAT[q.cat] || q.cat)}</span> ${sec ? chip(`第${sec.key}部分 ${sec.name}`) : ''} <span class="small muted">第 ${Q.i + 1} / ${n} 題</span></div>
        <div class="row">${Q.deadline ? '<span id="timer" class="chip acc">--:--</span>' : ''}<a class="btn sm" href="${Q.back || '#/quiz'}" data-act="qQuit">離開</a></div></div>
      ${bar((Q.exam ? Q.st.filter(s => s.resp != null || s.order.length).length : Q.i) / n * 100)}
      <div class="card" style="margin-top:1rem">
        ${passageHtml(q)}${q.sub ? `<div class="small muted">${esc(q.sub)}</div>` : ''}
        ${listenHtml(q, st)}
        <div class="qprompt${q.big ? ' big' : ''}">${q.listenId || (q.listen && q.hideSpeakText) ? '' : fmtQ(q.prompt)}${q.speak && !q.hideSpeakText ? ' ' + playBtn(q.speak, { slow: true }) : ''}</div>
        ${q.hint && st.done ? `<div class="romaji small">${esc(q.hint)}</div>` : ''}
        ${body}${fb}
      </div>${nav}
      <p class="tiny muted center">${Q.exam ? '' : '快速鍵：1–4 或 A–D 選擇，Enter 下一題。'}中途離開不會計入成績。</p>`;
    if (Q.deadline) tick();
    if (Q.i !== (Q.lastShown || 0) || Q.forceScroll) { window.scrollTo(0, 0); }
    Q.lastShown = Q.i; Q.forceScroll = false;
  }

  /* ---------- 作答動作 ---------- */
  function judge(q, st) {
    let resp;
    if (q.type === 'mc') resp = st.resp;
    else if (q.type === 'order') resp = st.order.map(i => q.chunks[i]);
    else resp = st.sel;
    st.correct = QG.check(q, resp);
  }
  App.acts.qPick = el => {
    const q = Q.qs[Q.i], st = Q.st[Q.i];
    if (st.done && !Q.exam) return;
    st.resp = q.options[+el.dataset.n];
    if (Q.exam) { drawQ(); return; }
    st.done = true; judge(q, st); drawQ();
    const f = App.$('.feedback'); if (f) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  App.acts.qOrder = el => {
    const st = Q.st[Q.i], q = Q.qs[Q.i]; const ci = +el.dataset.ci;
    if (st.order.includes(ci)) return; st.order.push(ci); if (Q.exam) st.resp = st.order.length === q.chunks.length ? 'x' : null; drawQ();
  };
  App.acts.qUnorder = el => { const st = Q.st[Q.i]; st.order.splice(+el.dataset.k, 1); drawQ(); };
  App.acts.qOrderReset = () => { Q.st[Q.i].order = []; drawQ(); };
  App.acts.qOrderCheck = () => { const q = Q.qs[Q.i], st = Q.st[Q.i]; st.done = true; judge(q, st); drawQ(); };
  App.ons.qMatch = el => {
    const q = Q.qs[Q.i], st = Q.st[Q.i]; st.sel[el.dataset.l] = el.value;
    if (!el.value) delete st.sel[el.dataset.l];
    if (!Q.exam) { const b = App.$('[data-act="qMatchCheck"]'); if (b) b.disabled = !q.pairs.every(p => st.sel[p.l]); } else drawQ();
  };
  App.acts.qMatchCheck = () => { const q = Q.qs[Q.i], st = Q.st[Q.i]; st.done = true; judge(q, st); drawQ(); };
  App.acts.qNext = () => { if (Q.i >= Q.qs.length - 1) return finishQuiz(); Q.i++; Audio.stopAll(); drawQ(); };
  App.acts.qGo = el => { const k = +el.dataset.k; if (k < 0 || k >= Q.qs.length) return; Audio.stopAll(); Q.i = k; drawQ(); };
  App.acts.qSkip = () => { const st = Q.st[Q.i]; st.skipped = true; st.done = true; st.correct = null; if (Q.i >= Q.qs.length - 1) finishQuiz(); else { Q.i++; drawQ(); } };
  App.acts.qStopListen = () => Audio.stopAll();
  App.acts.qListen = el => {
    const q = Q.qs[Q.i], st = Q.st[Q.i], s = Store.get().settings;
    if (Q.maxPlays && st.plays >= Q.maxPlays) return;
    st.plays++;
    const rate = el.dataset.slow ? s.slowRate : s.rate;
    if (q.listenId) {
      const t = D.listening.find(x => x.id === q.listenId);
      Audio.Player.load(t.lines.map((l, k) => ({ text: JP.sentence(l[1]).text, id: k })), { rate });
      if (!Audio.Player.play()) st.plays--;
    } else Audio.speak(q.speak, { rate });
    if (Q.maxPlays) { const b = App.$('[data-act="qListen"]'); if (b) { b.disabled = st.plays >= Q.maxPlays; b.textContent = `🔊 播放${q.listenId ? '對話' : '發音'}（剩 ${Q.maxPlays - st.plays} 次）`; } }
  };
  App.acts.qQuit = async (el, e) => {
    if (Q && !Q.done && Q.st.some(s => s.done || s.resp != null)) {
      if (!await App.confirm('離開測驗？', '中途離開不會計入成績，這次的作答也不會保留。', '離開', true)) return;
    }
    App.go(el.getAttribute('href'));
  };
  App.acts.qFinish = async () => {
    const un = Q.st.filter(s => s.resp == null && !s.skipped).length;
    if (await App.confirm('交卷', un ? `還有 ${un} 題沒作答，交卷後不能再修改。` : '確定要交卷嗎？交卷後不能再修改。', '交卷')) finishQuiz();
  };

  /* ================= 成績 ================= */
  function finishQuiz() {
    clearInterval(timer); Audio.stopAll();
    if (Q.done) return;
    Q.done = true;
    const answers = [];
    Q.qs.forEach((q, i) => {
      const st = Q.st[i];
      if (st.skipped) return;
      if (!st.done) { // 模擬考：交卷時才判分；練習中沒作答的題不計
        if (Q.exam) { if (q.type === 'mc' && st.resp != null) judge(q, st); else if (q.type === 'order' && st.order.length === q.chunks.length) judge(q, st); else if (q.type === 'match' && q.pairs.every(p => st.sel[p.l])) judge(q, st); else st.correct = false; st.done = true; }
        else return;
      }
      answers.push({ q, correct: !!st.correct, i });
    });
    const secs = Math.round((Date.now() - Q.t0) / 1000);
    let sectionRes = null;
    if (Q.sections) sectionRes = Q.sections.map(s => { const a = answers.filter(x => x.q.section === s.key); return { key: s.key, name: s.name, group: s.group, total: Q.qs.filter(q => q.section === s.key).length, correct: a.filter(x => x.correct).length }; });
    const rec = Progress.recordQuiz({ mode: Q.mode, label: Q.label, lesson: Q.lesson, mockId: Q.mockId, answers, sections: sectionRes, seconds: secs });
    const s = Store.get();
    if (Q.mode === 'weekly') { s.notes.lastWeekly = Date.now(); Progress.markTask('weekly'); }
    if (Q.mode === 'monthly') { s.notes.lastMonthly = Date.now(); Progress.markTask('monthly'); }
    if (Q.readingId) { const r = s.readings[Q.readingId] || (s.readings[Q.readingId] = { tries: 0, best: 0 }); r.tries++; r.last = rec.pct; r.best = Math.max(r.best || 0, rec.pct); r.t = Date.now(); }
    Store.save();
    Q.rec = rec; Q.answers = answers; Q.sectionRes = sectionRes; Q.secs = secs;
    drawResult();
  }

  function drawResult() {
    const rec = Q.rec, answers = Q.answers, el = App.$('#qa');
    const wrong = answers.filter(a => !a.correct);
    const skipped = Q.st.filter(s => s.skipped).length;
    const unanswered = Q.exam ? Q.st.filter((s, i) => !s.skipped && s.resp == null && !s.order.length && !Object.keys(s.sel).length).length : 0;
    // 課程完成狀態
    let lessonBox = '';
    if (Q.mode === 'lesson' && Q.lesson) {
      const ls = Progress.lessonStatus(Q.lesson), pass = rec.pct >= 80;
      lessonBox = `<div class="notice ${pass ? 'ok' : 'warn'}"><strong>${pass ? '達到通過標準（80%）' : '還沒達到通過標準（80%）'}</strong>${pass ? '' : '建議先重讀下面推薦的重點，再重做一次測驗。'}
        <div style="margin-top:.4rem">${ls.steps.map(x => `<div class="step${x.ok ? ' ok' : ''}"><span class="tick">${x.ok ? '✓' : ''}</span><span>${esc(x.text)}</span></div>`).join('')}</div>
        ${ls.done ? '<div style="margin-top:.4rem"><b>🎉 這一課已完成！</b></div>' : ''}</div>`;
    }
    // 依類別
    const cats = Object.entries(rec.byCat).map(([k, v]) => `<div class="hbar"><span>${esc(CAT[k] || k)}</span>${bar(v.c / v.t * 100, v.c / v.t >= 0.8 ? 'ok' : v.c / v.t < 0.6 ? 'warn' : '')}<span class="right">${v.c}/${v.t}</span></div>`).join('');
    // 錯誤分類與建議
    const wc = {}; wrong.forEach(a => { wc[a.q.cat] = (wc[a.q.cat] || 0) + 1; });
    const ADV = { vocab: ['單字', '#/vocab/review', '到單字頁用單字卡複習，錯的字已自動排進複習'], grammar: ['文法', '#/grammar', '重讀對應的文法說明與常見錯誤'], kana: ['假名', '#/kana', '回五十音表，多聽多念，特別注意易混淆字'], listening: ['聽力', '#/listening', '做聽力練習，先隱藏文字聽，再對照原文'], reading: ['閱讀', '#/reading', '重讀短文，先找時間、地點、人物、動作'] };
    const errBox = wrong.length ? `<div class="card"><h2>錯誤類型與建議</h2>${Object.entries(wc).map(([k, n]) => { const a = ADV[k]; return a ? `<div class="task"><span class="tick" style="border-color:var(--bad)">${n}</span><div><div class="tname">${a[0]}類錯 ${n} 題</div><div class="small muted">${a[2]}　<a href="${a[1]}">前往</a></div></div></div>` : ''; }).join('')}
      ${(() => { const ids = [...new Set(wrong.map(a => a.q.lesson).filter(Boolean))].slice(0, 4); const gs = [...new Set(wrong.map(a => a.q.ref && a.q.ref.grammar).filter(Boolean))].slice(0, 4);
        return (ids.length ? `<p class="small" style="margin:.6rem 0 0">建議重讀的課：${ids.map(id => `<a href="#/lesson/${id}">${id} ${esc((I().lById.get(id) || {}).title || '')}</a>`).join('、')}</p>` : '') + (gs.length ? `<p class="small" style="margin:.3rem 0 0">相關文法：${gs.map(id => `<a href="#/grammar/${id}">${id} ${esc((I().gById.get(id) || {}).name || '')}</a>`).join('、')}</p>` : ''); })()}</div>` : '';
    // 模擬考分項
    let mockBox = '';
    if (Q.mode === 'mock') {
      const L = Q.sectionRes.filter(s => s.group === 'lang'), Ls = Q.sectionRes.filter(s => s.group === 'listen');
      const lt = L.reduce((a, s) => a + s.total, 0), lc = L.reduce((a, s) => a + s.correct, 0), st_ = Ls.reduce((a, s) => a + s.total, 0), sc = Ls.reduce((a, s) => a + s.correct, 0);
      const lang = lt ? Math.round(lc / lt * 120) : 0, lis = st_ ? Math.round(sc / st_ * 60) : 0, tot = lang + lis;
      const pass = tot >= 80 && lang >= 38 && lis >= 19;
      mockBox = `<div class="card"><h2>分項成績</h2><div class="tablewrap"><table><thead><tr><th>部分</th><th>答對</th><th>正確率</th></tr></thead><tbody>${Q.sectionRes.map(s => `<tr><td>${s.key} ${esc(s.name)}</td><td>${s.correct}/${s.total}</td><td>${s.total ? Math.round(s.correct / s.total * 100) : 0}%</td></tr>`).join('')}</tbody></table></div>
        <p style="margin-top:.7rem">自行換算：語言知識 <b>${lang}</b>/120（門檻 38）＋ 聽解 <b>${lis}</b>/60（門檻 19）＝ <b>${tot}</b>/180（目標 80）</p>
        ${notice(pass ? '以這份自編模擬考換算，已達到「接近通過水準」。但這不是官方成績，也不能保證實際考試結果；請另外做官方公開的樣題確認。' : '以這份自編模擬考換算，還有項目沒達到參考門檻。看下面的錯誤類型，針對最弱的一項補強，再做另一回。', pass ? 'ok' : 'warn')}
        ${unanswered ? `<p class="small muted">有 ${unanswered} 題沒作答，視為答錯。</p>` : ''}</div>`;
    }
    const details = Q.qs.map((q, i) => ({ q, i, st: Q.st[i] })).filter(x => x.st.skipped || !x.st.correct);
    el.innerHTML = `
      <div class="card center"><div class="muted">${esc(Q.label)}</div><div class="score-ring" style="color:${rec.pct >= 80 ? 'var(--ok)' : rec.pct >= 60 ? 'var(--warn)' : 'var(--bad)'}">${rec.pct}%</div>
        <div>答對 ${rec.correct} / ${rec.total} 題　·　用時 ${Math.floor(Q.secs / 60)} 分 ${Q.secs % 60} 秒${skipped ? `　·　略過 ${skipped} 題（不計分）` : ''}</div>
        <div class="small muted">已記錄於 ${App.fmtDate(rec.t, true)}。答錯的題目已加入錯題本，答錯的單字已排進複習。</div></div>
      ${lessonBox}${mockBox}
      <div class="card"><h2>各類別正確率</h2>${cats}</div>
      ${errBox}
      <div class="card"><h2>${details.length ? `需要檢討的題目（${details.length}）` : '全部答對 👏'}</h2>${details.map(({ q, i, st }) => `<div class="task" style="display:block"><div class="small muted">第 ${i + 1} 題　${esc(CAT[q.cat] || q.cat)}${st.skipped ? '　（略過）' : ''}</div>
        <div class="qprompt" style="margin:.2rem 0">${q.listenId ? '🔊 聽力題：' + esc(q.sub || '') : (q.listen && q.hideSpeakText ? '🔊 聽音辨字' : fmtQ(q.prompt))}</div>
        ${st.skipped ? '' : `<div>你的答案：${respText(q, st)}</div>`}<div>正確答案：${answerText(q)}</div>${q.explain ? `<div class="small muted">解析：${esc(q.explain)}</div>` : ''}${transcriptHtml(q)}</div>`).join('')}</div>
      <div class="row">${wrong.length ? '<button class="btn primary" data-act="qRedoWrong">重做答錯的題目</button>' : ''}<button class="btn" data-act="qAgain">再做一次</button>${Q.lesson ? `<a class="btn" href="#/lesson/${Q.lesson}">回到課程</a>` : ''}<a class="btn" href="${Q.back || '#/quiz'}">返回</a><a class="btn" href="#/home">回首頁</a></div>`;
    window.scrollTo(0, 0);
  }
  App.acts.qAgain = () => {
    const o = Q; if (o.mode === 'mock') return App.go('#/quiz/mock/' + o.mockId);
    App.refresh();
  };
  App.acts.qRedoWrong = () => {
    const qs = Q.answers.filter(a => !a.correct).map(a => { const q = QG.fromSnapshot(a.q); if (q.type === 'mc') q.options = JP.shuffle(q.options); if (q.type === 'order') q.chunks = JP.shuffle(q.chunks); return q; });
    startQuiz({ mode: 'review', label: '錯題重做（本次答錯的題目）', back: Q.back, qs });
  };

  /* ================= 錯題本 ================= */
  App.views.mistakes = function () {
    App.pageTitle = '錯題本';
    const st = Store.get(), cat = App.tmp.mcat || '';
    const all = st.mistakes.filter(m => m.snap);
    const open = all.filter(m => !m.mastered), done = all.filter(m => m.mastered);
    const list = open.filter(m => !cat || m.cat === cat).sort((a, b) => (b.last || 0) - (a.last || 0));
    const counts = {}; open.forEach(m => { counts[m.cat] = (counts[m.cat] || 0) + 1; });
    const rec = Progress.recommend(4);
    const card = m => {
      const q = m.snap;
      return `<div class="card"><div class="row between"><div class="small muted">${esc(CAT[m.cat] || m.cat)}　·　錯 ${m.wrong} 次　·　最近 ${App.fmtDate(m.last)}${m.lesson ? `　·　<a href="#/lesson/${m.lesson}">${m.lesson}</a>` : ''}</div>
        <div class="row"><a class="btn sm primary" href="#/quiz/redo/key/${m.key}">重做</a><button class="btn sm" data-act="mDel" data-key="${m.key}">移除</button></div></div>
        <div class="qprompt" style="margin:.4rem 0">${q.listenId ? '🔊 聽力題：' + esc(q.sub || '') : (q.listen && q.hideSpeakText ? '🔊 聽音辨字' : fmtQ(q.prompt))}${q.speak && !q.hideSpeakText ? ' ' + playBtn(q.speak) : ''}</div>
        <div>正確答案：${answerText(q)}</div>${q.explain ? `<div class="small muted">解析：${esc(q.explain)}</div>` : ''}
        <div class="small" style="margin-top:.3rem">${q.ref && q.ref.grammar ? `<a href="#/grammar/${q.ref.grammar}">文法 ${q.ref.grammar}</a>　` : ''}${q.ref && q.ref.vocab && I().byId.has(q.ref.vocab) ? `<a href="#/word/${encodeURIComponent(q.ref.vocab)}">單字詳情</a>` : ''}</div></div>`;
    };
    App.render(`<h1>錯題本</h1><p class="muted">答錯的題目會自動收進來；同一題之後連續答對 2 次就視為掌握，移到下方。答錯的單字也同時排進了單字複習。</p>
      <div class="card"><div class="row"><span class="chip ${cat === '' ? 'acc' : ''}"><a href="#" data-act="mCat" data-c="" style="text-decoration:none;color:inherit">全部 ${open.length}</a></span>${Object.entries(counts).map(([k, n]) => `<span class="chip ${cat === k ? 'acc' : ''}"><a href="#" data-act="mCat" data-c="${k}" style="text-decoration:none;color:inherit">${esc(CAT[k] || k)} ${n}</a></span>`).join('')}</div>
        <div class="row" style="margin-top:.7rem"><a class="btn primary" href="#/quiz/redo/${cat || 'all'}">重做${cat ? CAT[cat] : '全部'}錯題（最多 20 題）</a></div>
        ${rec.length ? `<div class="small" style="margin-top:.7rem"><b>建議重新學習：</b>${rec.map(r => `<a href="#/lesson/${r.lesson.id}">${r.lesson.id} ${esc(r.lesson.title)}</a>`).join('、')}</div>` : ''}</div>
      ${list.length ? list.map(card).join('') : '<div class="card center muted">目前沒有待加強的錯題。繼續保持！</div>'}
      ${done.length ? `<details class="fold"><summary>已掌握（${done.length}）</summary>${done.slice(-30).reverse().map(m => `<div class="small" style="padding:.3rem 0;border-bottom:1px solid var(--line)">${esc(CAT[m.cat] || m.cat)}：${fmtQ(m.snap.listenId ? '（聽力題）' + (m.snap.sub || '') : (m.snap.listen ? '（聽音辨字）' : m.snap.prompt))}</div>`).join('')}</details>` : ''}`);
  };
  App.acts.mCat = el => { App.tmp.mcat = el.dataset.c; App.refresh(); };
  App.acts.mDel = async el => {
    if (!await App.confirm('移除這題？', '只會從錯題本移除，不影響單字複習進度。', '移除', true)) return;
    const s = Store.get(); s.mistakes = s.mistakes.filter(m => m.key !== el.dataset.key); Store.tombstone('mis:' + el.dataset.key); Store.save(); App.refresh();
  };

  /* ================= 閱讀理解 ================= */
  App.views.reading = function (parts) {
    if (parts[0]) {
      const r = (D.readings || []).find(x => x.id === parts[0]); if (!r) return App.views.notfound();
      return start({ mode: 'reading', readingId: r.id, label: `閱讀：${r.title}`, back: '#/reading', gen: () => QG.readingQs(r, Math.random) });
    }
    App.pageTitle = '閱讀';
    const st = Store.get().readings, curI = I().lessonOrder.get(Progress.currentLesson().id);
    const n = Object.keys(st).length;
    App.render(`<h1>短篇閱讀理解</h1><p class="muted">12 篇自編短文，只用已學過的單字和句型。先讀文章，不要逐字翻譯，抓「誰、什麼時候、哪裡、做什麼」。每篇 2–3 題；文章可以按 🔊 朗讀、按「詞」看逐詞拆解。已完成 ${n}/12 篇。</p>
      <div class="card">${D.readings.map(r => {
        const x = st[r.id], early = I().lessonOrder.get(r.unlock) > curI;
        return `<a class="lessonrow" href="#/reading/${r.id}"><span class="id">${r.id}</span><span><strong>${esc(r.title)}</strong><br><span class="tiny muted">${r.questions.length} 題　·　建議學完 ${r.unlock} 後${x ? `　·　最佳 ${x.best}%（${x.tries} 次）` : ''}</span></span>${x ? chip(x.best >= 70 ? '已通過' : '再練習', x.best >= 70 ? 'ok' : 'warn') : early ? chip('還沒學到') : chip('未做')}</a>`;
      }).join('')}</div>`);
  };
})(window);
