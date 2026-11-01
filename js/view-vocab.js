/* view-vocab.js — 單字列表、單字詳情、單字卡（間隔複習／新字學習／自由練習） */
(function (root) {
  'use strict';
  const App = root.App, JP = root.JP, D = root.JP_DATA, Progress = root.Progress, Store = root.Store, Audio = root.JPAudio;
  const { esc, chip, notice, bar, playBtn, vocabRuby } = App;
  const I = () => App.idx;
  const PAGE = 40;
  const zhMain = v => v.zh.split('；')[0];
  const posName = v => D.pos[v.pos] || v.pos;

  /* ---------- 活用表 ---------- */
  const FORM_NAMES = Object.assign({}, JP.VERB_FORMS, JP.ADJ_FORMS, { attr: '修飾名詞（な形）', naru: '〜なる（變成）' });
  function formsTable(v) {
    if (!v.forms) return '';
    const rows = Object.entries(v.forms).map(([k, f]) => `<tr><td>${esc(FORM_NAMES[k] || k)}</td><td class="jp">${esc(f[0])}</td><td class="jp">${esc(f[1])}</td><td class="romaji">${esc(JP.kanaToRomaji(f[1]))}</td></tr>`).join('');
    return `<div class="tablewrap"><table><thead><tr><th>形態</th><th>寫法</th><th>讀音</th><th class="romaji">羅馬拼音</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  App.formsTable = formsTable;

  /* ================= 單字列表 ================= */
  const vf = () => (App.tmp.vf = App.tmp.vf || { q: '', cat: '', pos: '', lesson: '', status: '', fav: false, wrong: false, page: 0 });

  function filtered() {
    const f = vf(), q = f.q.trim().toLowerCase(), now = Date.now();
    return I().vocab.filter(v => {
      if (f.cat && v.cat !== f.cat) return false;
      if (f.pos && v.pos !== f.pos) return false;
      if (f.lesson && v.lesson !== f.lesson) return false;
      if (f.fav && !Progress.isFav(v.id)) return false;
      if (f.wrong) { const c = Progress.card(v.id); if (!c || !c.wrong) return false; }
      if (f.status && Progress.status(v.id, now) !== f.status) return false;
      if (q && !(v.word.toLowerCase().includes(q) || v.kana.includes(q) || JP.kataToHira(v.kana).includes(JP.kataToHira(q)) || v.romaji.toLowerCase().includes(q) || v.zh.includes(q))) return false;
      return true;
    });
  }
  function listRows() {
    const f = vf(), all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    if (f.page >= pages) f.page = pages - 1;
    const rows = all.slice(f.page * PAGE, (f.page + 1) * PAGE);
    const now = Date.now();
    const body = rows.map(v => {
      const s = Progress.status(v.id, now), c = Progress.card(v.id), fav = Progress.isFav(v.id);
      return `<tr><td><button class="icon-btn sm${fav ? ' on' : ''}" data-act="favToggle" data-id="${esc(v.id)}" aria-pressed="${fav}" aria-label="收藏">${fav ? '★' : '☆'}</button></td>
        <td class="jp" style="font-size:1.1rem"><a href="#/word/${encodeURIComponent(v.id)}" style="text-decoration:none;color:inherit">${vocabRuby(v)}</a></td>
        <td class="jp">${esc(v.kana)}</td><td class="romaji">${esc(v.romaji)}</td><td>${esc(v.zh)}</td><td class="small">${esc(v.pos)}</td><td class="small">${v.lesson}</td>
        <td><span class="badge ${s}">${Progress.STATUS_NAME[s]}</span>${c && c.wrong ? ` <span class="tiny muted">錯${c.wrong}</span>` : ''}</td><td>${playBtn(v.kana.replace(/^〜/, ''), { slow: false })}</td></tr>`;
    }).join('');
    const pager = `<div class="row between" style="margin-top:.6rem"><span class="small muted">共 ${all.length} 個，第 ${f.page + 1}/${pages} 頁</span><span class="row"><button class="btn sm" data-act="vpage" data-d="-1" ${f.page <= 0 ? 'disabled' : ''}>← 上一頁</button><button class="btn sm" data-act="vpage" data-d="1" ${f.page >= pages - 1 ? 'disabled' : ''}>下一頁 →</button></span></div>`;
    return { body: body || '<tr><td colspan="9" class="muted">沒有符合條件的單字。</td></tr>', pager };
  }
  function drawList() {
    const r = listRows(); App.$('#vbody').innerHTML = r.body; App.$('#vpager').innerHTML = r.pager;
  }

  function vocabHome() {
    App.pageTitle = '單字';
    const f = vf(), cnt = Progress.counts(), st = Store.get();
    const cands = Progress.newCandidates().length, left = Progress.newRemainingToday();
    const nFav = Object.keys(st.favs).filter(id => I().byId.has(id)).length;
    const nWrong = Object.entries(st.cards).filter(([id, c]) => c.wrong > 0 && I().byId.has(id)).length;
    const learned = Object.keys(st.cards).length;
    const opts = (obj, cur) => Object.entries(obj).map(([k, n]) => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const r = listRows();
    App.render(`<h1>單字</h1>
      ${App.voiceNotice()}
      <div class="grid g4 keep2" style="margin-bottom:1rem">
        <a class="card linkcard stat" href="#/vocab/review"><div class="n">${cnt.due}</div><div class="l">待複習 · 開始複習 →</div></a>
        <a class="card linkcard stat" href="#/vocab/new"><div class="n">${Math.min(left, cands)}</div><div class="l">今天可學新字（上限 ${Store.get().settings.newPerDay}）→</div></a>
        <a class="card linkcard stat" href="#/vocab/fav"><div class="n">${nFav}</div><div class="l">收藏單字 →</div></a>
        <a class="card linkcard stat" href="#/vocab/wrong"><div class="n">${nWrong}</div><div class="l">答錯過的單字 →</div></a>
      </div>
      <div class="card"><div class="row">
        <a class="btn primary" href="#/vocab/review">🗂️ 間隔複習</a><a class="btn" href="#/vocab/new">✨ 學新單字</a><a class="btn" href="#/vocab/random">🎲 隨機練習（${learned ? '已學過的字' : '全部單字'}）</a>
        <a class="btn" href="#/quiz/type/listen">🔊 聽音辨字</a><a class="btn" href="#/quiz/type/zh2jp">中翻日測驗</a></div>
        <p class="small muted" style="margin:.6rem 0 0">狀態說明：<span class="badge new">尚未學習</span> 還沒看過；<span class="badge learning">學習中</span> 已排進複習；<span class="badge due">待複習</span> 已到期；<span class="badge familiar">已熟悉</span> 複習間隔 ≥ 21 天且最近 7 天沒答錯。目前：尚未學習 ${cnt.new}、學習中 ${cnt.learning}、待複習 ${cnt.due}、已熟悉 ${cnt.familiar}（共 ${I().vocab.length}）。</p></div>
      <div class="card"><h2>單字表</h2>
        <div class="grid g4" style="gap:.6rem">
          <div class="field" style="margin:0"><label for="vq">搜尋</label><input id="vq" type="search" data-in="vq" value="${esc(f.q)}" placeholder="日文、假名、羅馬拼音或中文"></div>
          <div class="field" style="margin:0"><label for="vcat">主題</label><select id="vcat" data-on="vf" data-k="cat"><option value="">全部</option>${opts(D.categories, f.cat)}</select></div>
          <div class="field" style="margin:0"><label for="vpos">詞性</label><select id="vpos" data-on="vf" data-k="pos"><option value="">全部</option>${opts(D.pos, f.pos)}</select></div>
          <div class="field" style="margin:0"><label for="vles">課程</label><select id="vles" data-on="vf" data-k="lesson"><option value="">全部</option>${I().lessons.filter(l => (I().vocabByLesson.get(l.id) || []).length).map(l => `<option value="${l.id}" ${f.lesson === l.id ? 'selected' : ''}>${l.id} ${esc(l.title)}</option>`).join('')}</select></div>
          <div class="field" style="margin:0"><label for="vst">學習狀態</label><select id="vst" data-on="vf" data-k="status"><option value="">全部</option>${opts(Progress.STATUS_NAME, f.status)}</select></div>
          <div class="field" style="margin:0;justify-content:end"><label class="chk"><input type="checkbox" data-on="vfc" data-k="fav" ${f.fav ? 'checked' : ''}> 只看收藏</label><label class="chk"><input type="checkbox" data-on="vfc" data-k="wrong" ${f.wrong ? 'checked' : ''}> 只看答錯過的</label></div>
          <div class="field" style="margin:0;justify-content:end"><button class="btn sm" data-act="vclear">清除篩選</button></div>
        </div>
        <div class="tablewrap" style="margin-top:.8rem"><table><thead><tr><th></th><th>單字</th><th>讀音</th><th class="romaji">羅馬拼音</th><th>意思</th><th>詞性</th><th>課</th><th>狀態</th><th></th></tr></thead><tbody id="vbody">${r.body}</tbody></table></div>
        <div id="vpager">${r.pager}</div></div>`);
  }
  App.ins.vq = el => { vf().q = el.value; vf().page = 0; drawList(); };
  App.ons.vf = el => { vf()[el.dataset.k] = el.value; vf().page = 0; drawList(); };
  App.ons.vfc = el => { vf()[el.dataset.k] = el.checked; vf().page = 0; drawList(); };
  App.acts.vpage = el => { vf().page += +el.dataset.d; drawList(); window.scrollTo(0, App.$('#vbody').getBoundingClientRect().top + window.scrollY - 140); };
  App.acts.vclear = () => { App.tmp.vf = null; App.refresh(); };

  /* ================= 單字詳情 ================= */
  App.views.word = function (parts) {
    const v = I().byId.get(parts[0]);
    if (!v) return App.views.notfound();
    App.pageTitle = v.word;
    const c = Progress.card(v.id), s = Progress.status(v.id), fav = Progress.isFav(v.id);
    const l = I().lById.get(v.lesson);
    const srs = c ? `<table><tbody>
      <tr><th>狀態</th><td><span class="badge ${s}">${Progress.STATUS_NAME[s]}</span></td></tr>
      <tr><th>目前間隔</th><td>${c.st === 'review' ? c.ivl + ' 天' : '學習階段（短間隔）'}</td></tr>
      <tr><th>下次複習</th><td>${App.fmtDate(c.due, true)}${c.due <= Date.now() ? '（已到期）' : ''}</td></tr>
      <tr><th>複習次數</th><td>${c.reps || 0}（答對 ${c.right || 0}／答錯 ${c.wrong || 0}／重學 ${c.lapses || 0} 次）</td></tr>
      <tr><th>最近複習</th><td>${App.fmtDate(c.last, true)}</td></tr><tr><th>首次學習</th><td>${App.fmtDate(c.first)}</td></tr></tbody></table>`
      : '<p class="muted">尚未學習這個單字。</p>';
    App.render(`<p class="small"><a href="#/vocab">← 單字表</a></p>
      <div class="card"><div class="row between"><div class="muted small">${esc(D.categories[v.cat] || v.cat)}　·　${esc(posName(v))}　·　<a href="#/lesson/${v.lesson}">${v.lesson}${l ? ' ' + esc(l.title) : ''}</a></div>
        <button class="icon-btn${fav ? ' on' : ''}" data-act="favToggle" data-id="${esc(v.id)}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button></div>
        <div class="flash-word" style="font-size:3rem">${vocabRuby(v)}</div>
        <div class="jp" style="font-size:1.3rem">${esc(v.kana)} <span class="romaji">${esc(v.romaji)}</span> ${playBtn(v.kana.replace(/^〜/, ''))}</div>
        <h2 style="margin-top:.6rem">${esc(v.zh)}</h2>${v.note ? `<p class="muted">${esc(v.note)}</p>` : ''}
        ${v.ex ? `<h3>例句</h3>${App.sentenceCard(v.ex, v.exZh)}` : ''}
        ${v.forms ? `<h3>${v.pos.startsWith('動') ? '動詞變化' : '形容詞變化'}</h3>${formsTable(v)}` : ''}</div>
      <div class="card"><h3>學習紀錄</h3>${srs}${c ? '<button class="btn sm danger" data-act="wordReset" data-id="' + esc(v.id) + '">重設這個單字的進度</button>' : ''}</div>`);
  };
  App.acts.wordReset = async el => {
    if (await App.confirm('重設進度', '這個單字會回到「尚未學習」，答錯次數也會清掉。', '重設', true)) { delete Store.get().cards[el.dataset.id]; Store.save(); App.refresh(); }
  };

  /* ================= 單字卡 session ================= */
  let F = null;
  const DIRS = { jp2zh: '日 → 中', zh2jp: '中 → 日', kana2zh: '假名 → 中', listen: '聽音 → 詞' };

  function buildSession(mode, arg) {
    const st = Store.get(), cap = st.settings.reviewCap;
    let ids = [], title = '', chunked = false, free = false, empty = '';
    const has = id => I().byId.has(id);
    if (mode === 'review') { ids = Progress.dueIds(Date.now(), cap); title = '間隔複習'; empty = 'due'; }
    else if (mode === 'wrong') { ids = Object.entries(st.cards).filter(([id, c]) => c.wrong > 0 && has(id)).sort((a, b) => b[1].wrong - a[1].wrong).slice(0, 30).map(x => x[0]); title = '答錯過的單字'; empty = '你還沒有答錯過的單字。'; }
    else if (mode === 'fav') { ids = Object.keys(st.favs).filter(has).slice(0, 40); title = '收藏的單字'; empty = '還沒有收藏單字。在單字表或單字卡按 ☆ 就能收藏。'; }
    else if (mode === 'new') { const n = arg === 'extra' ? 5 : Progress.newRemainingToday(); ids = n ? Progress.newCandidates(n).map(v => v.id) : []; title = '學新單字'; chunked = true; empty = n ? '目前沒有可學的新單字（需先完成更多課程才會解鎖）。' : 'quota'; }
    else if (mode === 'learn') { const l = I().lById.get(arg); if (!l) return null; ids = (I().vocabByLesson.get(arg) || []).filter(v => !Progress.card(v.id)).map(v => v.id); title = `${l.id} 本課單字`; chunked = true; empty = '這一課的單字你都學過了。要再練習可以用「隨機練習」。'; }
    else if (mode === 'random') {
      free = true; title = '隨機練習（不影響複習排程，答不出來的字會加入複習）';
      let pool;
      if (arg && I().lById.has(arg)) { pool = (I().vocabByLesson.get(arg) || []).map(v => v.id); title = `${arg} 隨機練習`; }
      else { pool = Object.keys(st.cards).filter(has); if (!pool.length) pool = I().vocab.map(v => v.id); }
      ids = JP.shuffle(pool).slice(0, 20); empty = '沒有單字可練習。';
    } else return null;
    F = { mode, arg, title, chunked, free, empty, total: ids.length, ids, queue: [], pending: [], chunkTest: [], shown: false, finished: 0, ok: 0, again: 0, missed: [], seen: new Set(), t0: Date.now(), done: false, dir: App.tmp.flashDir || 'jp2zh' };
    if (chunked) { F.pending = ids.slice(); loadChunk(); }
    else F.queue = ids.map(id => ({ id, phase: free ? 'free' : (Progress.card(id) ? 'test' : 'intro') }));
    return F;
  }
  function loadChunk() {
    const part = F.pending.splice(0, 5);
    F.queue = part.map(id => ({ id, phase: 'intro' })); F.chunkTest = [];
  }

  function flashFront(v, dir) {
    const sub = `<div class="muted small">${esc(posName(v))}</div>`;
    if (dir === 'jp2zh') return `<div class="flash-word">${vocabRuby(v)}</div>${sub}`;
    if (dir === 'zh2jp') return `<div class="flash-word" style="font-family:var(--zh);font-size:2rem">${esc(zhMain(v))}</div>${sub}<div class="muted small">請回想日文怎麼說、怎麼寫</div>`;
    if (dir === 'kana2zh') return `<div class="flash-word">${esc(v.kana)}</div>${sub}`;
    return `<button class="btn lg" data-act="fPlay">🔊 播放發音</button><div class="muted small">聽發音，回想意思和寫法（可按 P 重聽）</div>`;
  }
  function flashBack(v) {
    return `<div class="flash-back"><div class="flash-word" style="font-size:2.2rem">${vocabRuby(v)}</div>
      <div class="jp" style="font-size:1.2rem">${esc(v.kana)} <span class="romaji">${esc(v.romaji)}</span></div>
      <div style="font-size:1.15rem"><b>${esc(v.zh)}</b> <span class="muted small">${esc(posName(v))}</span></div>${v.note ? `<div class="small muted">${esc(v.note)}</div>` : ''}
      ${v.ex ? `<div style="margin-top:.6rem"><span class="jp-text" style="font-size:1.05rem;line-height:2">${JP.sentence(v.ex).html}</span> ${playBtn(JP.sentence(v.ex).text, { slow: false })}<div class="romaji">${esc(JP.sentence(v.ex).romaji)}</div><div class="zh muted">${esc(v.exZh)}</div></div>` : ''}</div>`;
  }

  function drawSession() {
    const el = App.$('#fs'); if (!el || !F) return;
    if (F.done) return drawSummary();
    const it = F.queue[0];
    if (!it) return finish();
    const v = I().byId.get(it.id);
    const remaining = F.queue.length + F.pending.length + F.chunkTest.length;
    const dir = F.dir;
    const fav = Progress.isFav(v.id);
    const isIntro = it.phase === 'intro';
    let body, actions;
    if (isIntro) {
      body = `<div class="flash-face card"><div class="chip acc">新單字 · 先看一遍，大聲念出來</div>${flashBack(v)}</div>`;
      actions = `<div class="row" style="justify-content:center"><button class="btn primary lg" data-act="fIntro" data-k="remember">記起來了，加入複習（Enter）</button><button class="btn" data-act="fIntro" data-k="known">我本來就會（略過）</button></div>`;
    } else {
      body = `<div class="flash-face card">${flashFront(v, dir)}${F.shown ? flashBack(v) : ''}</div>`;
      if (!F.shown) actions = `<div class="row" style="justify-content:center"><button class="btn primary lg" data-act="fShow">顯示答案（空白鍵）</button></div>`;
      else if (F.free) actions = `<div class="grades" style="grid-template-columns:repeat(2,1fr)"><button class="btn danger" data-act="fGrade" data-g="0">還不熟（1）</button><button class="btn primary" data-act="fGrade" data-g="2">記得（2）</button></div>`;
      else {
        const iv = Progress.nextIntervals(v.id);
        actions = `<div class="grades">${['重來', '困難', '良好', '簡單'].map((n, g) => `<button class="btn${g === 0 ? ' danger' : g === 2 ? ' primary' : ''}" data-act="fGrade" data-g="${g}">${n} (${g + 1})<small>${iv[g]}後</small></button>`).join('')}</div>`;
      }
    }
    el.innerHTML = `
      <div class="row between" style="margin-bottom:.6rem"><div><b>${esc(F.title)}</b> <span class="muted small">剩餘 ${remaining} 張</span></div>
        <div class="row">${isIntro ? '' : `<select data-on="fDir" aria-label="出題方向">${Object.entries(DIRS).map(([k, n]) => `<option value="${k}" ${dir === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`}
        <label class="chk small"><input type="checkbox" data-on="fAuto" ${App.tmp.flashAuto ? 'checked' : ''}> 自動朗讀</label>
        <button class="icon-btn${fav ? ' on' : ''}" data-act="favToggle" data-id="${esc(v.id)}" aria-label="收藏（F）" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>
        <button class="icon-btn" data-act="fPlay" aria-label="朗讀（P）" title="朗讀（P）">🔊</button></div></div>
      ${bar((F.total ? F.finished / F.total : 0) * 100)}
      <div style="margin-top:1rem">${body}</div>${actions}
      <p class="tiny muted center" style="margin-top:.8rem">快速鍵：空白鍵／Enter 顯示答案，1–4 評分，P 朗讀，F 收藏。評分標準：完全想不起來＝重來；想很久或有錯＝困難；順利想起＝良好；一看就會＝簡單。</p>`;
    const needSpeak = App.tmp.flashAuto && (isIntro || dir === 'listen' || F.shown) ;
    if (needSpeak && !F.spoken) { F.spoken = true; speakCur(); }
  }
  function speakCur() {
    const it = F && F.queue[0]; if (!it) return;
    const v = I().byId.get(it.id); const s = Store.get().settings;
    Audio.speak(v.kana.replace(/^〜/, ''), { rate: s.rate });
  }
  function nextCard() { F.shown = false; F.spoken = false; drawSession(); }

  function finish() {
    F.done = true;
    if (F.mode === 'review') Progress.markTask('review');
    Progress.touch();
    drawSummary();
  }
  function drawSummary() {
    const el = App.$('#fs');
    const secs = Math.round((Date.now() - F.t0) / 1000);
    const miss = [...new Set(F.missed)].map(id => I().byId.get(id)).filter(Boolean);
    const cnt = Progress.counts();
    el.innerHTML = `<div class="card center"><h2>本次完成 🎉</h2><p>${esc(F.title)}：共 ${F.total} 個單字，用時 ${Math.floor(secs / 60)} 分 ${secs % 60} 秒。</p>
      <div class="grid g3 keep2"><div class="stat"><div class="n">${F.ok}</div><div class="l">想起來（良好以上）</div></div><div class="stat"><div class="n">${F.again}</div><div class="l">需要重來／不熟</div></div><div class="stat"><div class="n">${cnt.due}</div><div class="l">目前待複習</div></div></div>
      ${miss.length ? `<div style="text-align:left;margin-top:1rem"><b>這次沒記住的：</b><div class="row" style="margin-top:.4rem">${miss.map(v => `<a class="chip bad jp" href="#/word/${encodeURIComponent(v.id)}">${esc(v.word)}（${esc(zhMain(v))}）</a>`).join('')}</div><p class="small muted">這些字已安排很快再出現。</p></div>` : ''}
      <div class="row" style="justify-content:center;margin-top:1rem"><a class="btn primary" href="#/vocab/review">再複習</a><a class="btn" href="#/vocab/new">學新單字</a><a class="btn" href="#/today">回今日任務</a></div></div>`;
  }

  function sessionView(mode, arg) {
    const S = buildSession(mode, arg);
    if (!S) return App.views.notfound();
    App.pageTitle = S.title;
    if (!S.total) {
      let msg;
      if (S.empty === 'due') {
        const nextDue = Object.entries(Store.get().cards).filter(([id]) => I().byId.has(id)).map(([, c]) => c.due).sort((a, b) => a - b)[0];
        msg = nextDue ? `目前沒有到期的單字。下一個預計在 ${App.fmtDate(nextDue, true)} 到期。` : '你還沒學過任何單字，先去學新單字吧。';
      } else if (S.empty === 'quota') {
        msg = `今天的新單字額度（${Store.get().settings.newPerDay} 個）已經用完了。不要一次塞太多——複習比新學更重要。想多學可以再加 5 個，或到「設定」調整每日新字數。`;
      } else msg = S.empty;
      App.render(`<p class="small"><a href="#/vocab">← 單字</a></p><div class="card center"><h2>${esc(S.title)}</h2><p>${esc(msg)}</p>
        <div class="row" style="justify-content:center">${S.empty === 'quota' ? '<a class="btn primary" href="#/vocab/new/extra">再多學 5 個</a>' : ''}${mode === 'review' ? '<a class="btn primary" href="#/vocab/new">學新單字</a>' : ''}<a class="btn" href="#/vocab/random">隨機練習</a><a class="btn" href="#/vocab">回單字頁</a></div></div>`);
      return;
    }
    App.render(`<p class="small"><a href="#/vocab">← 結束並回到單字頁</a></p>${App.voiceNotice()}<div class="flash" id="fs"></div>`);
    drawSession();
    App.setKeys(e => {
      if (!F || F.done) return;
      const it = F.queue[0]; if (!it) return;
      if (e.key === 'p' || e.key === 'P') { speakCur(); return; }
      if (e.key === 'f' || e.key === 'F') { const b = App.$('#fs [data-act="favToggle"]'); if (b) b.click(); return; }
      if (it.phase === 'intro') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.acts.fIntro({ dataset: { k: 'remember' } }); } return; }
      if (!F.shown) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); App.acts.fShow(); } return; }
      const n = parseInt(e.key, 10);
      if (F.free) { if (n === 1 || n === 2) App.acts.fGrade({ dataset: { g: n === 1 ? 0 : 2 } }); return; }
      if (n >= 1 && n <= 4) App.acts.fGrade({ dataset: { g: n - 1 } });
    });
    return () => { F = null; };
  }

  App.acts.fShow = () => { F.shown = true; drawSession(); if (App.tmp.flashAuto && F.dir !== 'listen') { F.spoken = true; speakCur(); } };
  App.acts.fPlay = () => speakCur();
  App.ons.fDir = el => { F.dir = el.value; App.tmp.flashDir = el.value; F.shown = false; F.spoken = false; drawSession(); };
  App.ons.fAuto = el => { App.tmp.flashAuto = el.checked; };
  App.acts.fIntro = el => {
    const it = F.queue.shift();
    if (el.dataset.k === 'known') { Progress.grade(it.id, 3); F.finished++; F.ok++; }
    else { Progress.introduce(it.id); F.chunkTest.push(it.id); }
    F.seen.add(it.id);
    afterAdvance();
  };
  function afterAdvance() {
    if (!F.queue.length) {
      if (F.chunkTest.length) { F.queue = JP.shuffle(F.chunkTest).map(id => ({ id, phase: 'test' })); F.chunkTest = []; }
      else if (F.pending.length) loadChunk();
    }
    if (!F.queue.length) return finish();
    nextCard();
  }
  App.acts.fGrade = el => {
    const g = +el.dataset.g, it = F.queue.shift();
    F.seen.add(it.id);
    if (it.phase === 'free') {
      if (g === 0) { if (Progress.card(it.id)) Progress.grade(it.id, 0, { count: false }); else Progress.grade(it.id, 0, { count: false }); F.again++; F.missed.push(it.id); } else F.ok++;
      F.finished++;
    } else {
      const c = Progress.grade(it.id, g);
      if (g === 0) { F.again++; F.missed.push(it.id); } else F.ok++;
      if (c.due - Date.now() <= 2 * 60000) F.queue.push({ id: it.id, phase: 'test' }); else F.finished++;
    }
    afterAdvance();
  };

  App.views.vocab = function (parts) {
    if (!parts[0]) return vocabHome();
    return sessionView(parts[0], parts[1]);
  };
})(window);
