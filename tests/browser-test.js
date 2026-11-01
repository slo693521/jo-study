/* browser-test.js — 端對端瀏覽器測試（Playwright）。先啟動 python3 -m http.server 8000，再執行 node tests/browser-test.js
 * 會注入假的日文語音引擎以測試有聲書流程；會清除該網址的 localStorage，請勿在正式使用的網址上執行。 */
const { chromium } = require('playwright');
const SH = require('path').join(__dirname, 'screenshots') + '/'; require('fs').mkdirSync(SH, { recursive: true });
const URL = process.env.APP_URL || 'http://localhost:8000/index.html';
const FAKE_TTS = `
(() => {
  const voices = [{ name: 'Fake Kyoko', lang: 'ja-JP', voiceURI: 'fake-ja', localService: true, default: true }];
  window.__spoken = [];
  class U { constructor(t){ this.text=t; } }
  window.SpeechSynthesisUtterance = U;
  let cur = null;
  const synth = { getVoices: () => voices, speaking:false, addEventListener(){}, cancel(){ if (cur) { const u = cur; cur = null; clearTimeout(u.__t); if (u.onerror) u.onerror({ error: 'canceled' }); } },
    speak(u){ window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice && u.voice.name }); cur = u; setTimeout(() => u.onstart && u.onstart(), 5); u.__t = setTimeout(() => { if (cur === u) { cur = null; u.onend && u.onend(); } }, 60); } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
})();`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(FAKE_TTS);
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg);
  const go = async h => { await p.goto(URL + '#/' + h); await p.waitForTimeout(200); };
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await go('home');
  ok(await p.evaluate(() => document.getElementById('voiceChip').textContent.includes('日文語音')), 'voice chip shows ready with fake ja voice');

  // ---- 課程 L01：讀完、學單字、測驗
  await go('lesson/L01');
  await p.click('[data-act=lessonRead]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => Progress.lessonStatus('L01').rec.read === true), 'L01 marked read');
  await go('vocab/learn/L01');
  let guard = 0;
  while (guard++ < 80) {
    const intro = await p.$('[data-act=fIntro][data-k=remember]');
    if (intro) { await p.keyboard.press('Enter'); await p.waitForTimeout(30); continue; }
    const show = await p.$('[data-act=fShow]');
    if (show) { await p.keyboard.press('Space'); await p.waitForTimeout(30); await p.keyboard.press('3'); await p.waitForTimeout(30); continue; }
    break;
  }
  const st1 = await p.evaluate(() => ({ vocab: Progress.vocabDone('L01'), counts: Progress.counts(), n: Object.keys(Store.get().cards).length }));
  console.log('after learn', JSON.stringify(st1)); ok(st1.vocab, 'all L01 vocab introduced');
  ok(await p.evaluate(() => document.querySelector('#fs').innerText.includes('本次完成')), 'session summary shown');

  // ---- 測驗：全部答對
  async function answerAll(correct = true, limit = 200) {
    for (let k = 0; k < limit; k++) {
      const done = await p.evaluate(() => { const Q = App.debugQuiz(); return !Q || Q.done; });
      if (done) return;
      const act = await p.evaluate(({ correct }) => {
        const Q = App.debugQuiz(); const q = Q.qs[Q.i]; const st = Q.st[Q.i];
        if (st.done && !Q.exam) return 'next';
        return q.type;
      }, { correct });
      if (act === 'next') { await p.click('[data-act=qNext]'); continue; }
      if (act === 'mc') {
        const n = await p.evaluate(({ correct }) => { const Q = App.debugQuiz(); const q = Q.qs[Q.i]; const ai = q.options.indexOf(q.answer); return correct ? ai : (ai + 1) % q.options.length; }, { correct });
        await p.click(`[data-act=qPick][data-n="${n}"]`);
      } else if (act === 'order') {
        const seq = await p.evaluate(({ correct }) => { const Q = App.debugQuiz(); const q = Q.qs[Q.i]; const used = new Set(); const seq = []; (correct ? q.answer : q.answer.slice().reverse()).forEach(a => { const ci = q.chunks.findIndex((c, i) => c === a && !used.has(i)); used.add(ci); seq.push(ci); }); return seq; }, { correct });
        for (const ci of seq) await p.click(`[data-act=qOrder][data-ci="${ci}"]`);
        await p.click('[data-act=qOrderCheck]');
      } else if (act === 'match') {
        const pairs = await p.evaluate(() => { const Q = App.debugQuiz(); return Q.qs[Q.i].pairs; });
        for (const pr of pairs) await p.selectOption(`select[data-l="${pr.l}"]`, correct ? pr.r : pairs.find(x => x.r !== pr.r).r);
        await p.click('[data-act=qMatchCheck]');
      }
    }
  }
  await go('quiz/lesson/L01'); 
  const nq = await p.evaluate(() => App.debugQuiz().qs.length); console.log('L01 quiz questions', nq);
  await answerAll(true);
  ok(await p.evaluate(() => document.querySelector('#qa').innerText.includes('100%')), 'L01 quiz 100% result');
  ok(await p.evaluate(() => Progress.isLessonDone('L01')), 'L01 lesson complete after read+vocab+quiz');
  await p.screenshot({ path: SH + 'result.png', fullPage: false });

  // 重新載入後仍保存
  await p.reload(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => Progress.isLessonDone('L01') && Object.keys(Store.get().cards).length > 5), 'persisted after reload');

  // ---- 答錯 → 錯題本
  await go('quiz/lesson/L02'); await answerAll(false);
  const mis = await p.evaluate(() => Store.get().mistakes.length); console.log('mistakes', mis); ok(mis > 5, 'wrong answers recorded in mistakes');
  await go('mistakes'); ok(await p.evaluate(() => document.getElementById('main').innerText.includes('正確答案')), 'mistakes page lists items');
  await go('quiz/redo/all'); const rq = await p.evaluate(() => App.debugQuiz().qs.length); ok(rq > 0, 'redo quiz built: ' + rq);
  await answerAll(true);
  console.log('mastered after 1 redo', await p.evaluate(() => Store.get().mistakes.filter(m => m.mastered).length));

  // ---- 各題型
  for (const t of ['kana_recog','kana_match','vocab_mc','jp2zh','zh2jp','grammar','order','particle','listen','comp']) {
    await go(`quiz/type/${t}/10/every`);
    const info = await p.evaluate(() => { const Q = App.debugQuiz(); return Q ? Q.qs.length : -1; });
    if (info > 0) { await answerAll(t.length % 2 === 0); const fin = await p.evaluate(() => document.querySelector('#qa').innerText.includes('各類別正確率')); ok(fin, `type ${t}: ${info} q, result shown`); }
    else ok(false, `type ${t} produced no questions`);
  }
  for (const r of ['daily','weekly','monthly','grammar/G01','grammar/G34']) { await go('quiz/' + r); await answerAll(true); ok(await p.evaluate(() => document.querySelector('#qa').innerText.includes('各類別正確率')), 'quiz ' + r); }
  await go('reading/R01'); await answerAll(true); ok(await p.evaluate(() => Store.get().readings.R01 && Store.get().readings.R01.best === 100), 'reading R01 recorded 100%');

  // ---- 模擬考
  await go('quiz/mock/M1'); await p.click('[data-act=mockGo][data-timed="0"]'); await p.waitForTimeout(100);
  const mq = await p.evaluate(() => App.debugQuiz().qs.length); ok(mq === 54, 'mock M1 has 54 questions: ' + mq);
  await p.click('[data-act=qFinish]'); await p.waitForTimeout(100); await p.click('[data-act=mok]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.querySelector('#qa').innerText.includes('分項成績')), 'mock results with sections');
  await go('quiz/mock/M2'); await p.click('[data-act=mockGo][data-timed="1"]'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => /\d+:\d\d/.test(document.getElementById('timer').textContent)), 'mock timer ticking');
  await p.screenshot({ path: SH + 'mock.png' });

  // ---- 有聲書
  await go('audiobook/L14'); await p.click('#abPlay'); await p.waitForTimeout(400);
  const sp = await p.evaluate(() => window.__spoken.slice()); ok(sp.length >= 1 && sp.every(x => x.lang === 'ja-JP' && x.voice === 'Fake Kyoko'), 'audiobook speaks with ja-JP voice: ' + sp.length);
  ok(await p.evaluate(() => !!document.querySelector('#abList .sentence.current')), 'current sentence highlighted');
  await p.click('#abPlay'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => JPAudio.Player.state === 'paused'), 'paused state');
  await p.screenshot({ path: SH + 'audiobook.png' });
  await p.selectOption('[data-on=abMode]', 'follow'); await p.evaluate(() => JPAudio.Player.stop()); await p.click('#abPlay'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => JPAudio.Player.state === 'gap'), 'follow mode enters gap after sentence');
  await p.click('[data-act=abNext]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => JPAudio.Player.i === 1), 'next sentence jumps');
  await go('home'); ok(await p.evaluate(() => JPAudio.Player.state === 'idle'), 'leaving page stops playback');

  // ---- 聽力
  await go('listening/T01'); await p.click('[data-act=ltPlay]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__spoken.length >= 2), 'listening plays dialog lines');
  ok(await p.evaluate(() => !document.getElementById('main').innerText.includes('房間號碼是幾號')), 'transcript hidden before answering');
  const ans = await p.evaluate(() => { const t = JP_DATA.listening[0]; return t.answer; });
  const idxOpt = await p.evaluate(a => Array.from(document.querySelectorAll('[data-act=ltPick]')).findIndex(e => e.innerText.includes(a)), ans);
  await p.click(`[data-act=ltPick][data-n="${idxOpt}"]`);
  ok(await p.evaluate(() => document.getElementById('main').innerText.includes('房間號碼是幾號')), 'transcript revealed after answering');

  // ---- 設定：匯出／匯入／重設
  await go('settings');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=doExport]')]);
  const path = await dl.path(); const fs = require('fs'); const txt = fs.readFileSync(path, 'utf8'); const j = JSON.parse(txt);
  ok(j.app === 'jp-study-app' && Object.keys(j.data.cards).length > 5, 'export file valid, cards=' + Object.keys(j.data.cards).length);
  const cardsBefore = Object.keys(j.data.cards).length; await p.waitForTimeout(700);
  await p.evaluate(() => { Store.reset(); }); await go('settings');
  await p.setInputFiles('#impFile', path); await p.waitForTimeout(300);
  await p.click('[data-act=impDo][data-m=replace]'); await p.waitForTimeout(300);
  ok(await p.evaluate(n => Object.keys(Store.get().cards).length === n, cardsBefore), 'import restores cards');
  await p.setInputFiles('#impFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('toast').textContent.includes('匯入失敗')), 'bad import rejected with message');
  await p.click('[data-act=doReset]'); await p.fill('#rstIn', '清除'); await p.click('[data-act=rstGo]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => Object.keys(Store.get().cards).length === 0), 'reset clears data');

  // ---- 手機版面：無水平捲動
  await p.setViewportSize({ width: 390, height: 800 });
  const routes = ['home','today','lessons','lesson/L14','kana','kana/youon','vocab','vocab/new','grammar/G33','audiobook/L14','listening','quiz','records','settings','about','mistakes','reading'];
  for (const r of routes) { await go(r); const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); if (w[0] > w[1] + 1) console.log('OVERFLOW', r, w); }
  await go('home'); await p.screenshot({ path: SH + 'm_home.png' });
  await go('quiz/lesson/L01'); await p.screenshot({ path: SH + 'm_quiz.png' });
  await go('lesson/L14'); await p.screenshot({ path: SH + 'm_lesson.png', fullPage: false });
  console.log(errs.join('\n') || 'no console/page errors');
  await b.close();
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
