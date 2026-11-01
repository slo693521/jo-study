/* progress.js — 學習進度、間隔重複（SRS）、課程完成判定、每日任務、錯誤分析
 *
 * 間隔重複設計（類 Anki／SM-2，加上學習階段）：
 *   新字 → 學習中（1 分鐘 → 10 分鐘 兩個短間隔）→ 畢業成為「複習卡」（間隔 1 天起）
 *   複習卡依自評 / 答題結果調整：重來(0) 困難(1) 良好(2) 簡單(3)
 *     重來：lapses+1，ease-0.2，進入重學階段（10 分鐘），畢業後間隔縮短為原本的 30%
 *     困難：間隔×1.2，ease-0.15；良好：間隔×ease；簡單：間隔×ease×1.3，ease+0.15
 *   狀態：尚未學習（無紀錄）／學習中／待複習（已到期）／已熟悉（間隔≥21 天且最近沒有答錯）
 */
(function (root) {
  'use strict';
  const DAY = 86400000, MIN = 60000;
  const LEARN_STEPS = [1 * MIN, 10 * MIN];
  const RELEARN_STEPS = [10 * MIN];
  const FAMILIAR_IVL = 21;

  let idx = null, D = null;
  const S = () => root.Store.get();

  function init(index, data) { idx = index; D = data; }

  /* ---------- 日紀錄 ---------- */
  function day(d) {
    const key = d || root.Store.today();
    const s = S();
    if (!s.days[key]) s.days[key] = { newWords: 0, reviews: 0, reviewsOk: 0, quizzes: 0, tasks: {}, lessonsDone: [] };
    return s.days[key];
  }
  function touch() { const d = day(); d.active = true; root.Store.save(); return d; }
  function markTask(key) { const d = day(); d.tasks[key] = true; d.active = true; root.Store.save(); }

  /* ---------- 單字卡 ---------- */
  function card(id) { return S().cards[id] || null; }
  function newCard(id, now) {
    const c = { st: 'learning', step: 0, ease: 2.5, ivl: 0, due: (now || Date.now()), reps: 0, lapses: 0, last: 0, first: now || Date.now(), wrong: 0, right: 0 };
    S().cards[id] = c;
    return c;
  }
  function status(id, now) {
    const c = card(id);
    if (!c) return 'new';
    now = now || Date.now();
    if (c.st === 'review') {
      if (c.due <= now) return 'due';
      if (c.ivl >= FAMILIAR_IVL && !(c.lastWrong && now - c.lastWrong < 7 * DAY)) return 'familiar';
      return 'learning';
    }
    if (c.due <= now) return 'due'; // 學習中且到了時間
    return 'learning';
  }
  const STATUS_NAME = { new: '尚未學習', learning: '學習中', due: '待複習', familiar: '已熟悉' };

  // 預覽四個按鈕各自會安排多久之後（顯示在按鈕上）
  function nextIntervals(id) {
    const c = card(id) || { st: 'learning', step: 0, ease: 2.5, ivl: 0 };
    return [0, 1, 2, 3].map(g => fmtDelay(simulate(c, g).delay));
  }
  function simulate(c, g) {
    c = Object.assign({}, c);
    let delay, st = c.st, step = c.step || 0, ivl = c.ivl || 0, ease = c.ease || 2.5, lapses = c.lapses || 0;
    if (st === 'learning' || st === 'relearning') {
      const steps = st === 'learning' ? LEARN_STEPS : RELEARN_STEPS;
      if (g === 0) { step = 0; delay = steps[0]; }
      else if (g === 1) { delay = steps[Math.min(step, steps.length - 1)]; }
      else if (g === 3) { const was = c.st; st = 'review'; ivl = was === 'learning' ? 4 : Math.max(1, c.ivl || 1); delay = ivl * DAY; }
      else {
        step += 1;
        if (step >= steps.length) { st = 'review'; ivl = c.st === 'learning' ? 1 : Math.max(1, c.ivl || 1); delay = ivl * DAY; }
        else delay = steps[step];
      }
    } else { // review
      if (g === 0) { lapses += 1; ease = Math.max(1.3, ease - 0.2); st = 'relearning'; step = 0; ivl = Math.max(1, Math.round(ivl * 0.3)); delay = RELEARN_STEPS[0]; }
      else if (g === 1) { ease = Math.max(1.3, ease - 0.15); ivl = Math.max(ivl + 1, Math.round(ivl * 1.2)); delay = ivl * DAY; }
      else if (g === 2) { ivl = Math.max(ivl + 1, Math.round(ivl * ease)); delay = ivl * DAY; }
      else { ease += 0.15; ivl = Math.max(ivl + 2, Math.round(ivl * ease * 1.3)); delay = ivl * DAY; }
      ivl = Math.min(ivl, 365); if (st === 'review') delay = ivl * DAY;
    }
    return { st, step, ivl, ease, lapses, delay };
  }
  function fmtDelay(ms) {
    if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + ' 分鐘';
    if (ms < DAY) return Math.round(ms / (60 * MIN)) + ' 小時';
    const d = Math.round(ms / DAY);
    if (d < 30) return d + ' 天';
    if (d < 365) return Math.round(d / 30) + ' 個月';
    return '1 年';
  }

  /* 評分：g = 0 重來 1 困難 2 良好 3 簡單。回傳更新後的卡片 */
  function grade(id, g, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const wasNew = !card(id);
    let c = card(id) || newCard(id, now);
    const r = simulate(c, g);
    c.st = r.st; c.step = r.step; c.ivl = r.ivl; c.ease = r.ease; c.lapses = r.lapses;
    c.due = now + r.delay; c.last = now; c.reps = (c.reps || 0) + 1;
    if (g === 0) { c.wrong = (c.wrong || 0) + 1; c.lastWrong = now; } else c.right = (c.right || 0) + 1;
    const d = day();
    d.active = true;
    if (opts.count !== false) { d.reviews = (d.reviews || 0) + 1; if (g > 0) d.reviewsOk = (d.reviewsOk || 0) + 1; }
    if (wasNew) d.newWords = (d.newWords || 0) + 1;
    root.Store.save();
    return c;
  }

  // 初次認識單字（不算答對/答錯，只是建立卡片，10 分鐘後第一次複習）
  function introduce(id, now) {
    if (card(id)) return card(id);
    now = now || Date.now();
    const c = newCard(id, now);
    c.due = now + LEARN_STEPS[0]; c.last = now;
    const d = day(); d.newWords = (d.newWords || 0) + 1; d.active = true;
    root.Store.save();
    return c;
  }

  function allVocab() { return idx.vocab; }
  function dueIds(now, cap) {
    now = now || Date.now();
    const out = [];
    Object.entries(S().cards).forEach(([id, c]) => { if (c.due <= now && idx.byId.has(id)) out.push([id, c.due]); });
    out.sort((a, b) => a[1] - b[1]);
    return (cap ? out.slice(0, cap) : out).map(x => x[0]);
  }
  function unlockedLessonIds() {
    const cur = currentLessonIndex();
    return idx.lessons.slice(0, Math.min(idx.lessons.length, cur + 1)).map(l => l.id);
  }
  function newCandidates(limit) {
    const ok = new Set(unlockedLessonIds());
    const out = [];
    for (const v of idx.vocab) { if (ok.has(v.lesson) && !card(v.id)) out.push(v); }
    out.sort((a, b) => idx.lessonOrder.get(a.lesson) - idx.lessonOrder.get(b.lesson) || a.line - b.line);
    return limit ? out.slice(0, limit) : out;
  }
  function counts() {
    const c = { new: 0, learning: 0, due: 0, familiar: 0 };
    const now = Date.now();
    idx.vocab.forEach(v => { c[status(v.id, now)]++; });
    return c;
  }
  function newToday() { return day().newWords || 0; }
  function newRemainingToday() { return Math.max(0, S().settings.newPerDay - newToday()); }

  function toggleFav(id) { const f = S().favs; if (f[id]) { delete f[id]; root.Store.tombstone('fav:' + id); } else f[id] = Date.now(); root.Store.save(); return !!f[id]; }
  function isFav(id) { return !!S().favs[id]; }

  /* ---------- 課程進度 ---------- */
  function lessonRec(id) { const s = S(); if (!s.lessons[id]) s.lessons[id] = {}; return s.lessons[id]; }
  function lessonVocab(id) { return idx.vocabByLesson.get(id) || []; }
  function vocabDone(id) { const vs = lessonVocab(id); return vs.every(v => !!card(v.id)); }
  function passScore(l) { return 80; }

  function customDone(l) { // L50–L54 的特殊完成條件
    const s = S();
    if (l.id === 'L50') { const rs = Object.values(s.readings); const n = rs.length; const avg = n ? rs.reduce((a, r) => a + (r.last || 0), 0) / n : 0; return { ok: n >= 8 && avg >= 70, text: `閱讀完成 ${n}/8 篇，平均 ${Math.round(avg)}%（需 70%）` }; }
    if (l.id === 'L51') { const n = Object.keys(s.notes.followDone || {}).length; return { ok: n >= 3, text: `有聲書跟讀完成 ${n}/3 課` }; }
    if (l.id === 'L52') { const ls = Object.values(s.listening); const n = ls.length; const acc = n ? ls.filter(x => x.ok).length / n * 100 : 0; return { ok: n >= 15 && acc >= 70, text: `聽力完成 ${n}/15 題，正確率 ${Math.round(acc)}%（需 70%）` }; }
    if (l.id === 'L53') { const m = s.quizzes.filter(q => q.mode === 'mock' && q.mockId === 'M1').length; return { ok: m >= 1, text: m ? '已完成模擬考（1）' : '尚未完成模擬考（1）' }; }
    if (l.id === 'L54') { const m = s.quizzes.filter(q => q.mode === 'mock' && q.mockId === 'M2').length; return { ok: m >= 1, text: m ? '已完成模擬考（2）' : '尚未完成模擬考（2）' }; }
    return null;
  }
  function lessonStatus(id) {
    const l = idx.lById.get(id), r = S().lessons[id] || {};
    const custom = customDone(l);
    const steps = custom
      ? [{ k: 'custom', ok: custom.ok, text: custom.text }]
      : [
        { k: 'read', ok: !!r.read, text: '閱讀本課教材並按「我讀完了」' },
        { k: 'vocab', ok: vocabDone(id), text: `學習本課單字（${lessonVocab(id).filter(v => card(v.id)).length}/${lessonVocab(id).length}）` },
        { k: 'quiz', ok: (r.quizBest || 0) >= passScore(l), text: `本課測驗達 ${passScore(l)}%（目前最佳 ${r.quizBest != null ? r.quizBest + '%' : '尚未作答'}）` }
      ];
    const done = steps.every(s => s.ok);
    if (done && !r.completedAt) { r.completedAt = Date.now(); const d = day(); if (!d.lessonsDone.includes(id)) d.lessonsDone.push(id); root.Store.save(); }
    const started = steps.some(s => s.ok) || !!r.attempts;
    return { id, steps, done: done || !!r.completedAt, started, rec: r };
  }
  function isLessonDone(id) { return lessonStatus(id).done; }
  function currentLessonIndex() {
    for (let i = 0; i < idx.lessons.length; i++) if (!isLessonDone(idx.lessons[i].id)) return i;
    return idx.lessons.length - 1;
  }
  function currentLesson() { return idx.lessons[currentLessonIndex()]; }
  function lessonsDoneCount() { return idx.lessons.filter(l => isLessonDone(l.id)).length; }
  function markRead(id) { const r = lessonRec(id); r.read = true; r.readAt = Date.now(); touch(); root.Store.save(); }
  function recordLessonQuiz(id, pct) {
    const r = lessonRec(id);
    r.attempts = (r.attempts || 0) + 1; r.quizLast = pct; r.quizBest = Math.max(r.quizBest || 0, pct); r.lastQuizAt = Date.now();
    root.Store.save(); return lessonStatus(id);
  }
  function stageOf(lesson) { return D.stages.find(s => s.id === lesson.stage); }

  /* ---------- 連續天數、統計 ---------- */
  function streak() {
    const s = S(); let n = 0; const d = new Date();
    let key = root.Store.today(d);
    if (!(s.days[key] && s.days[key].active)) { d.setDate(d.getDate() - 1); key = root.Store.today(d); if (!(s.days[key] && s.days[key].active)) return 0; }
    while (s.days[key] && s.days[key].active) { n++; d.setDate(d.getDate() - 1); key = root.Store.today(d); }
    return n;
  }
  function retention(days) {
    days = days || 30; const s = S(); let tot = 0, ok = 0; const d = new Date();
    for (let i = 0; i < days; i++) { const r = s.days[root.Store.today(d)]; if (r) { tot += r.reviews || 0; ok += r.reviewsOk || 0; } d.setDate(d.getDate() - 1); }
    return tot ? Math.round(ok / tot * 100) : null;
  }
  function quizAccuracy(n) {
    const qs = S().quizzes.slice(n ? -n : 0); let t = 0, c = 0;
    qs.forEach(q => { t += q.total; c += q.correct; });
    return t ? Math.round(c / t * 100) : null;
  }
  function daysSinceStart() { const a = new Date(S().startDate + 'T00:00:00'); return Math.max(0, Math.floor((Date.now() - a.getTime()) / DAY)); }
  function goalProgress() { // 距離 6 個月（約 182 天）目標
    const elapsed = Math.min(1, daysSinceStart() / 182);
    const done = lessonsDoneCount() / idx.lessons.length;
    return { elapsedPct: Math.round(elapsed * 100), donePct: Math.round(done * 100), daysLeft: Math.max(0, 182 - daysSinceStart()), ahead: Math.round((done - elapsed) * 100) };
  }

  /* ---------- 錯題與弱點 ---------- */
  function mkKey(q) { return 'q' + root.JP.hashStr((q.cat || '') + '|' + (q.promptKey || q.prompt || '') + '|' + (q.answerKey || '')); }

  function recordAnswer(q, correct) {
    const s = S(); const now = Date.now();
    // 分類統計
    if (q.ref && q.ref.vocab) {
      const id = q.ref.vocab;
      if (idx.byId.has(id)) {
        if (card(id) || !correct) grade(id, correct ? 2 : 0, { count: false }); // 沒學過的字答對不算學會；答錯則加入複習
        const dd = day(); dd.reviews = (dd.reviews || 0) + 1; if (correct) dd.reviewsOk = (dd.reviewsOk || 0) + 1;
      }
    }
    if (q.ref && q.ref.grammar) { const g = s.grammar[q.ref.grammar] || (s.grammar[q.ref.grammar] = { wrong: 0, right: 0, last: 0 }); correct ? g.right++ : g.wrong++; g.last = now; }
    if (q.ref && q.ref.kana) { q.ref.kana.forEach(k => { const g = s.kana[k] || (s.kana[k] = { wrong: 0, right: 0, last: 0 }); correct ? g.right++ : g.wrong++; g.last = now; }); }
    // 錯題本
    const key = mkKey(q);
    let m = s.mistakes.find(x => x.key === key);
    if (!correct) {
      if (!m) { m = { key, cat: q.cat, lesson: q.lesson || null, ref: q.ref || {}, snap: snapshot(q), wrong: 0, first: now, streak: 0 }; s.mistakes.push(m); }
      m.wrong++; m.last = now; m.streak = 0; m.mastered = false;
      if (s.mistakes.length > 400) { s.mistakes.sort((a, b) => (b.last || 0) - (a.last || 0)); s.mistakes.length = 400; }
    } else if (m) { m.streak = (m.streak || 0) + 1; if (m.streak >= 2) m.mastered = true; m.last = now; }
    root.Store.save();
  }
  function snapshot(q) { // 儲存可重做的題目（不含函式）
    return JSON.parse(JSON.stringify({ type: q.type, cat: q.cat, kind: q.kind, prompt: q.prompt, sub: q.sub, speak: q.speak, options: q.options, answer: q.answer, chunks: q.chunks, alts: q.alts, pairs: q.pairs, explain: q.explain, ref: q.ref, lesson: q.lesson, hint: q.hint, passageId: q.passageId, listenId: q.listenId, promptKey: q.promptKey, answerKey: q.answerKey, tail: q.tail, big: q.big, bigOptions: q.bigOptions, blank: q.blank, listen: q.listen, hideSpeakText: q.hideSpeakText, optNotes: q.optNotes }));
  }

  /* 完成一次測驗：answers = [{q, correct}] */
  function recordQuiz(info) {
    const s = S(); const now = Date.now();
    const byCat = {};
    info.answers.forEach(a => {
      const c = a.q.cat || 'other'; byCat[c] = byCat[c] || { t: 0, c: 0 }; byCat[c].t++; if (a.correct) byCat[c].c++;
      recordAnswer(a.q, a.correct);
    });
    const total = info.answers.length, correct = info.answers.filter(a => a.correct).length;
    const rec = { t: now, mode: info.mode, label: info.label, total, correct, pct: total ? Math.round(correct / total * 100) : 0, byCat, lesson: info.lesson || null, mockId: info.mockId || null, sections: info.sections || null, seconds: info.seconds || null };
    s.quizzes.push(rec); if (s.quizzes.length > 500) s.quizzes.shift();
    const d = day(); d.quizzes = (d.quizzes || 0) + 1; d.active = true;
    if (info.mode === 'lesson' && info.lesson) recordLessonQuiz(info.lesson, rec.pct);
    if (info.mode === 'daily') d.tasks.quiz = true;
    if (['lesson', 'practice', 'weekly', 'review'].includes(info.mode)) d.tasks.practice = true;
    root.Store.save();
    return rec;
  }

  const CAT_NAME = { kana: '假名', vocab: '單字', grammar: '文法', listening: '聽力', reading: '閱讀', other: '其他' };

  function errorStats() { // 各類別累計正確率
    const tot = {}; S().quizzes.forEach(q => Object.entries(q.byCat || {}).forEach(([k, v]) => { tot[k] = tot[k] || { t: 0, c: 0 }; tot[k].t += v.t; tot[k].c += v.c; }));
    return tot;
  }
  function weakGrammar(n) {
    return Object.entries(S().grammar).filter(([, g]) => g.wrong > 0)
      .map(([id, g]) => ({ id, wrong: g.wrong, right: g.right, rate: g.wrong / (g.wrong + g.right), g: idx.gById.get(id) }))
      .filter(x => x.g).sort((a, b) => b.rate - a.rate || b.wrong - a.wrong).slice(0, n || 5);
  }
  function weakVocab(n) {
    return Object.entries(S().cards).filter(([id, c]) => (c.wrong || 0) > 0 && idx.byId.has(id))
      .map(([id, c]) => ({ v: idx.byId.get(id), wrong: c.wrong, last: c.lastWrong || 0 })).sort((a, b) => b.wrong - a.wrong || b.last - a.last).slice(0, n || 10);
  }
  function weakKana(n) {
    return Object.entries(S().kana).filter(([, g]) => g.wrong > 0).map(([k, g]) => ({ k, wrong: g.wrong, right: g.right })).sort((a, b) => b.wrong - a.wrong).slice(0, n || 10);
  }
  // 依錯題推薦重新學習的課程
  function recommend(n) {
    const score = {};
    const add = (lid, pts, why) => { if (!lid || !idx.lById.has(lid)) return; score[lid] = score[lid] || { pts: 0, why: new Set() }; score[lid].pts += pts; score[lid].why.add(why); };
    S().mistakes.filter(m => !m.mastered).forEach(m => {
      let lid = m.lesson;
      if (!lid && m.ref && m.ref.vocab && idx.byId.has(m.ref.vocab)) lid = idx.byId.get(m.ref.vocab).lesson;
      if (!lid && m.ref && m.ref.grammar && idx.gById.has(m.ref.grammar)) lid = idx.gById.get(m.ref.grammar).lesson;
      add(lid, m.wrong, CAT_NAME[m.cat] || '其他');
    });
    weakGrammar(10).forEach(w => add(w.g.lesson, w.wrong * 1.5, '文法'));
    weakVocab(20).forEach(w => add(w.v.lesson, w.wrong, '單字'));
    return Object.entries(score).sort((a, b) => b[1].pts - a[1].pts).slice(0, n || 5)
      .map(([lid, o]) => ({ lesson: idx.lById.get(lid), pts: o.pts, why: [...o.why] }));
  }

  /* ---------- 今日任務（依進度調整）---------- */
  function prevLessonWeak() {
    const i = currentLessonIndex(); if (i === 0) return null;
    for (let j = i - 1; j >= Math.max(0, i - 2); j--) { // 看前兩課
      const r = S().lessons[idx.lessons[j].id];
      if (r && r.quizLast != null && r.quizLast < 70) return { lesson: idx.lessons[j], score: r.quizLast };
    }
    return null;
  }
  function nextListening() {
    const done = S().listening; const ok = new Set(unlockedLessonIds());
    const cand = (D.listening || []).filter(t => idx.lessonOrder.get(t.unlock) <= currentLessonIndex());
    const undone = cand.filter(t => !done[t.id]);
    if (undone.length) return { item: undone[0], fresh: true };
    if (cand.length) return { item: cand[root.JP.hashStr(root.Store.today()) % cand.length], fresh: false };
    return null;
  }
  function plan() {
    const s = S(), d = day(), cur = currentLesson(), weak = prevLessonWeak();
    const due = dueIds(Date.now()).length, cap = s.settings.reviewCap;
    const dd = new Date(); const dow = dd.getDay();
    const tasks = [];
    tasks.push({ key: 'review', name: '複習舊單字', min: '5', done: !!d.tasks.review || due === 0, na: due === 0 && !d.tasks.review, href: '#/vocab/review',
      detail: due ? `${Math.min(due, cap)} 個單字待複習${due > cap ? `（共 ${due} 個，今天先複習 ${cap} 個）` : ''}` : '今天沒有到期的單字，這項免做（可到單字頁複習收藏）', count: due });
    if (weak) tasks.push({ key: 'lesson', name: `先複習 ${weak.lesson.id} 重點`, min: '10～15', done: !!d.tasks.lesson, href: '#/lesson/' + weak.lesson.id, warn: true,
      detail: `上一課「${weak.lesson.title}」測驗只有 ${weak.score}%，建議先重讀重點與常見錯誤，再繼續新課`, lesson: weak.lesson });
    else tasks.push({ key: 'lesson', name: `學習新教材：${cur.id} ${cur.title}`, min: '10～15', done: !!d.tasks.lesson || (d.lessonsDone || []).includes(cur.id), href: '#/lesson/' + cur.id, detail: `第 ${cur.week} 週 · ${stageOf(cur).name}`, lesson: cur });
    tasks.push({ key: 'practice', name: weak ? `針對 ${weak.lesson.id} 的練習` : `單字與文法練習：${cur.id}`, min: '5～10', done: !!d.tasks.practice, href: '#/quiz/lesson/' + (weak ? weak.lesson.id : cur.id), detail: '主動回想：做本課測驗，錯題自動進錯題本' });
    const nl = nextListening();
    if (nl) tasks.push({ key: 'listening', name: nl.fresh ? `聽力練習：${nl.item.title}` : `聽力複習：${nl.item.title}`, min: '5～10', done: !!d.tasks.listening, href: '#/listening/' + nl.item.id, detail: '先隱藏文字聽，聽完作答再看答案' });
    else tasks.push({ key: 'listening', name: `朗讀跟讀：${cur.id}`, min: '5～10', done: !!d.tasks.listening, href: '#/audiobook/' + cur.id, detail: '聽一句、念一句（跟讀模式）' });
    tasks.push({ key: 'quiz', name: '每日測驗（10 題）', min: '5', done: !!d.tasks.quiz, href: '#/quiz/daily', detail: '混合新舊內容，同一天內容固定' });
    const extras = [];
    if (dow === 0 || daysSince(s.notes.lastWeekly) >= 7) extras.push({ key: 'weekly', name: '每週複習測驗', done: !!(d.tasks.weekly), href: '#/quiz/weekly', detail: '複習這週學過的內容' });
    if (daysSince(s.notes.lastMonthly) >= 28 && lessonsDoneCount() >= 6) extras.push({ key: 'monthly', name: '每月階段測驗', done: false, href: '#/quiz/monthly', detail: '涵蓋至今學過的內容（30 題）' });
    return { tasks, extras, weak, current: cur, due };
  }
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / DAY) : 999; }

  const Progress = {
    init, day, touch, markTask, card, status, STATUS_NAME, grade, introduce, nextIntervals, fmtDelay, dueIds, newCandidates, counts, newToday, newRemainingToday,
    toggleFav, isFav, lessonStatus, isLessonDone, currentLesson, currentLessonIndex, lessonsDoneCount, markRead, recordLessonQuiz, stageOf, unlockedLessonIds, vocabDone, lessonVocab, customDone,
    streak, retention, quizAccuracy, daysSinceStart, goalProgress, recordQuiz, recordAnswer, errorStats, weakGrammar, weakVocab, weakKana, recommend, plan, prevLessonWeak, nextListening, CAT_NAME, simulate, FAMILIAR_IVL, daysSince, mkKey
  };
  root.Progress = Progress;
  if (typeof module !== 'undefined') module.exports = Progress;
})(typeof window !== 'undefined' ? window : globalThis);
