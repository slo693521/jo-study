/* sync-test.js — 雲端同步的端對端測試（Playwright）。不會連到真正的 GitHub：
 * 用 page.route 攔截 api.github.com，以記憶體模擬一個私人 repo，並開兩個獨立的瀏覽器環境當「手機」和「電腦」。
 * 先啟動 python3 -m http.server 8000，再執行 node tests/sync-test.js */
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:8000/index.html';
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + msg); };

// ---- 假的 GitHub
const remote = { file: null, sha: null, n: 0, puts: 0, private: true, online: true, forceConflictOnce: false };
const TOKEN = 'github_pat_TEST';
async function fakeGitHub(route) {
  const req = route.request(); const u = new globalThis.URL(req.url());
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,PUT,OPTIONS', 'access-control-expose-headers': '*' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (!remote.online) return route.abort('internetdisconnected');
  const json = (status, body) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(body) });
  if (req.headers()['authorization'] !== 'Bearer ' + TOKEN) return json(401, { message: 'Bad credentials' });
  if (u.pathname === '/repos/kao/jp-study-data') return json(200, { private: remote.private, permissions: { push: true } });
  if (u.pathname === '/repos/kao/jp-study-data/contents/progress.json') {
    if (req.method() === 'GET') return remote.file ? json(200, { sha: remote.sha, encoding: 'base64', content: remote.file }) : json(404, { message: 'Not Found' });
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData());
      if (remote.forceConflictOnce) { remote.forceConflictOnce = false; remote.sha = 'other' + (++remote.n); return json(409, { message: 'conflict' }); }
      if ((body.sha || null) !== remote.sha) return json(409, { message: 'sha mismatch' });
      remote.file = body.content; remote.sha = 'sha' + (++remote.n); remote.puts++;
      return json(remote.n === 1 ? 201 : 200, { content: { sha: remote.sha } });
    }
  }
  return json(404, { message: 'Not Found' });
}
const remoteData = () => JSON.parse(Buffer.from(remote.file, 'base64').toString('utf8'));

(async () => {
  const b = await chromium.launch();
  const mk = async (name, ua) => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, userAgent: ua });
    await ctx.route('https://api.github.com/**', fakeGitHub);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.goto(URL + '#/home'); await p.waitForTimeout(200);
    p.dev = name; return p;
  };
  const pc = await mk('電腦', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120');
  const ph = await mk('手機', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari');
  const S = (p, f, a) => p.evaluate(f, a);
  const enable = async (p, token = TOKEN) => {
    await p.goto(URL + '#/settings'); await p.waitForTimeout(150);
    await p.fill('#syOwner', 'kao'); await p.fill('#syRepo', 'jp-study-data'); await p.fill('#syToken', token);
    await p.click('[data-act=syncOn]'); await p.waitForTimeout(500);
  };

  // 1) 拒絕公開 repo、錯誤 token
  remote.private = false; await enable(pc);
  ok((await p_text(pc, '#syncOut')).includes('公開'), 'refuses a public repo');
  remote.private = true; await enable(pc, 'github_pat_WRONG');
  ok((await p_text(pc, '#syncOut')).includes('Token'), 'reports invalid token');

  // 2) 電腦：學一些單字、完成 L01 部分進度，再開同步 → 上傳
  await S(pc, () => { const s = Store.get(); s.cards['w1'] = { last: 1000, due: 5000, ivl: 1 }; s.cards['w2'] = { last: 2000, due: 6000, ivl: 1 }; s.lessons.L01 = { read: true, quizBest: 70 }; s.favs.w1 = 100; s.days['2026-11-01'] = { reviews: 5, active: true }; Store.saveNow(); });
  await enable(pc);
  ok(remote.file && remoteData().data.cards.w1, 'PC uploads progress on enable');
  ok(!('settings' in remoteData().data), 'device settings are not uploaded');
  ok(!JSON.stringify(remoteData()).includes(TOKEN), 'token is never uploaded');
  ok(!(await S(pc, () => Store.exportData())).includes(TOKEN), 'token is not in exported backup');
  ok(await S(pc, () => !document.getElementById('syncChip').hidden), 'sync chip is visible');

  // 3) 手機：已經有自己的進度，開同步 → 合併
  await S(ph, () => { const s = Store.get(); s.cards['w2'] = { last: 3000, due: 9000, ivl: 3 }; s.cards['w3'] = { last: 500, due: 700, ivl: 1 }; s.lessons.L01 = { read: true, vocabDone: true, quizBest: 90, completedAt: 3000 }; s.days['2026-11-01'] = { reviews: 8, active: true }; s.settings.fontScale = 1.3; Store.saveNow(); });
  await enable(ph);
  let st = await S(ph, () => Store.get());
  ok(st.cards.w1 && st.cards.w3 && st.cards.w2.last === 3000, 'phone gets union of cards, newer review wins');
  ok(st.lessons.L01.quizBest === 90 && st.lessons.L01.vocabDone && st.lessons.L01.completedAt === 3000, 'lesson progress merged (best score, completed kept)');
  ok(st.favs.w1, 'favourite synced');
  ok(st.settings.fontScale === 1.3, 'phone keeps its own settings');
  ok(remoteData().data.cards.w3, 'phone uploaded merged result');

  // 4) 電腦拉回手機的進度（回到前景時）
  await S(pc, () => Sync.syncNow('test')); st = await S(pc, () => Store.get());
  ok(st.cards.w3 && st.cards.w2.last === 3000 && st.lessons.L01.quizBest === 90, 'PC pulls phone progress');
  ok(st.settings.fontScale === 1, 'PC settings unaffected');

  // 5) 自動同步：存檔後排程（測試時直接呼叫 schedule(0)）
  await S(ph, () => { Store.get().cards['w4'] = { last: 4000, due: 9999, ivl: 1 }; Store.save(); });
  await ph.waitForTimeout(300);
  ok(await S(ph, () => Sync.getConfig().pending), 'save marks sync pending');
  await S(ph, () => Sync.schedule(0)); await ph.waitForTimeout(500);
  ok(remoteData().data.cards.w4 && !(await S(ph, () => Sync.getConfig().pending)), 'auto sync uploads after a save');

  // 6) 取消收藏、移除錯題可以同步（不會被另一台加回來）
  await S(pc, () => Sync.syncNow('t'));
  await S(pc, () => { Progress.toggleFav('w1'); const s = Store.get(); s.mistakes.push({ key: 'm1', first: 10, last: 10, cat: 'vocab', snap: {} }); Store.saveNow(); return Sync.syncNow('t'); });
  await S(ph, () => Sync.syncNow('t'));
  ok(!(await S(ph, () => Store.get().favs.w1)), 'unfavourite propagates to the other device');
  ok(await S(ph, () => Store.get().mistakes.some(m => m.key === 'm1')), 'mistake propagates');
  await S(ph, () => { const s = Store.get(); s.mistakes = s.mistakes.filter(m => m.key !== 'm1'); Store.tombstone('mis:m1'); Store.saveNow(); return Sync.syncNow('t'); });
  await S(pc, () => Sync.syncNow('t'));
  ok(!(await S(pc, () => Store.get().mistakes.some(m => m.key === 'm1'))), 'removed mistake stays removed on the other device');

  // 7) 離線：照常記錄，恢復連線後補上傳
  remote.online = false;
  await ph.context().setOffline(true);
  await S(ph, () => { Store.get().cards['w5'] = { last: 5000, due: 1, ivl: 1 }; Store.saveNow(); });
  let r = await S(ph, () => Sync.syncNow('t'));
  ok(!r.ok && r.reason === 'offline', 'offline sync is deferred, not an error');
  ok(await S(ph, () => !!Store.get().cards.w5), 'offline progress kept locally');
  remote.online = true; await ph.context().setOffline(false); await ph.waitForTimeout(800);
  ok(remoteData().data.cards.w5, 'uploads automatically when back online');

  // 8) 衝突：上傳時 sha 不符 → 重新下載合併後再上傳，雙方資料都保留
  await S(pc, () => { Store.get().cards['w6'] = { last: 6000, due: 1, ivl: 1 }; Store.saveNow(); });
  await S(ph, () => { Store.get().cards['w7'] = { last: 7000, due: 1, ivl: 1 }; Store.saveNow(); });
  await Promise.all([S(pc, () => Sync.syncNow('t')), S(ph, () => Sync.syncNow('t'))]);
  await S(pc, () => Sync.syncNow('t')); await S(ph, () => Sync.syncNow('t'));
  const d = remoteData().data;
  ok(d.cards.w6 && d.cards.w7, 'concurrent uploads from both devices are both kept');
  ok(await S(pc, () => !!Store.get().cards.w7) && await S(ph, () => !!Store.get().cards.w6), 'both devices converge');
  remote.forceConflictOnce = true;
  await S(pc, () => { Store.get().cards['w8'] = { last: 8000, due: 1, ivl: 1 }; Store.saveNow(); });
  remote.sha = remote.sha; r = await S(pc, () => Sync.syncNow('t'));
  ok(r.ok && remoteData().data.cards.w8, 'retries after a 409 conflict');

  // 9) 匯出 / 匯入仍可用
  const exp = await S(pc, () => Store.exportData());
  const imp = await S(ph, t => Store.importData(t, 'merge'), exp);
  ok(imp.ok, 'export/import still works');

  // 10) 關閉並刪除 token
  await pc.goto(URL + '#/settings'); await pc.waitForTimeout(150);
  await S(pc, () => Sync.disable(true));
  ok(await S(pc, () => !JSON.parse(localStorage.getItem('jpstudy.sync')).token && !Sync.getConfig().enabled), 'forget removes token');
  ok(!pc.errs.length && !ph.errs.length, 'no page errors ' + JSON.stringify(pc.errs.concat(ph.errs)));
  await b.close();
  console.log(fails ? `\n✘ ${fails} 項失敗` : '\n✓ 同步測試全部通過');
  process.exit(fails ? 1 : 0);
})();
async function p_text(p, sel) { return (await p.textContent(sel)) || ''; }
