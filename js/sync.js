/* sync.js — 用你自己的 GitHub「私人」repo 在手機與電腦之間自動同步學習紀錄
 *
 * 運作方式（純前端，不經過任何第三方伺服器）：
 *   瀏覽器 ──HTTPS──> api.github.com ──> 你的私人 repo 裡的 progress.json
 * - 設定（帳號、repo、token）存在這台裝置的 localStorage（key: jpstudy.sync），
 *   不會被「匯出備份」帶出去，也不會上傳到 GitHub。
 * - 同步 = 下載雲端資料 → 與本機資料合併（Store.merge）→ 有差異才上傳。
 *   上傳時帶 sha，如果另一台剛好也在上傳（409/422），就重新下載再合併一次。
 * - 離線時照常使用，資料先存在本機；恢復連線、回到頁面或下次開啟時自動補同步。
 * - 「設定」（語音、字體大小等）每台裝置各自保留，不同步。
 */
(function (root) {
  'use strict';
  const CFG_KEY = 'jpstudy.sync';
  const API = 'https://api.github.com';
  const AUTO_DELAY = 15000;       // 存檔後 15 秒自動上傳（合併連續的操作）
  const PERIODIC = 5 * 60 * 1000; // 頁面開著時每 5 分鐘檢查一次
  let cfg = null;
  let running = null, again = false, timer = null, applying = false;
  const listeners = [];
  let status = { state: 'off', msg: '' }; // off | idle | syncing | ok | offline | error

  /* ---------- 設定 ---------- */
  function loadCfg() {
    if (cfg) return cfg;
    try { cfg = JSON.parse(root.localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { cfg = null; }
    cfg = Object.assign({ enabled: false, owner: '', repo: 'jp-study-data', path: 'progress.json', token: '', device: guessDevice(), lastSync: 0, lastError: '', pending: false }, cfg || {});
    return cfg;
  }
  function saveCfg() { try { root.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
  function guessDevice() {
    const ua = (root.navigator && root.navigator.userAgent) || '';
    return /iPhone|Android.+Mobile|Mobile Safari/i.test(ua) ? '手機' : /iPad|Android/i.test(ua) ? '平板' : '電腦';
  }
  function getConfig() { const c = loadCfg(); return { enabled: c.enabled, owner: c.owner, repo: c.repo, path: c.path, device: c.device, hasToken: !!c.token, lastSync: c.lastSync, lastError: c.lastError, pending: c.pending }; }

  function setStatus(state, msg) { status = { state, msg: msg || '' }; listeners.forEach(f => { try { f(status); } catch (e) { /* ignore */ } }); }
  function getStatus() { return status; }
  function onStatus(f) { listeners.push(f); }

  /* ---------- 編碼（GitHub API 用 base64，內容是 UTF-8） ---------- */
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- GitHub API ---------- */
  class SyncError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

  async function gh(method, url, body, c) {
    c = c || loadCfg();
    let res;
    try {
      res = await fetch(API + url, {
        method, cache: 'no-store',
        headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new SyncError(root.navigator && root.navigator.onLine === false ? '目前離線' : '連不到 GitHub（網路中斷，或這個網址不允許連線；請改用 GitHub Pages 網址開啟）', 'network');
    }
    if (res.status === 401) throw new SyncError('Token 無效或已過期，請重新產生並貼上', 'auth');
    if (res.status === 403) {
      const left = res.headers.get('x-ratelimit-remaining');
      throw new SyncError(left === '0' ? 'GitHub 暫時限制請求次數，稍後會自動重試' : 'Token 沒有這個 repo 的「Contents：讀取與寫入」權限', left === '0' ? 'rate' : 'auth');
    }
    return res;
  }
  function filePath(c) { return '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + '/contents/' + c.path.split('/').map(encodeURIComponent).join('/'); }

  async function pull(c) {
    const res = await gh('GET', filePath(c), null, c);
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw new SyncError('下載失敗（HTTP ' + res.status + '）', 'http');
    const j = await res.json();
    let text;
    if (j.content && j.encoding === 'base64') text = b64decode(j.content);
    else { // 超過 1MB 的檔案改用 blob API 讀取
      const r2 = await gh('GET', '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + '/git/blobs/' + j.sha, null, c);
      if (!r2.ok) throw new SyncError('下載失敗（HTTP ' + r2.status + '）', 'http');
      text = b64decode((await r2.json()).content);
    }
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new SyncError('雲端的 ' + c.path + ' 不是有效的 JSON，為了安全已停止同步', 'data'); }
    const bad = root.Store.validate(obj);
    if (bad) throw new SyncError('雲端資料有問題：' + bad, 'data');
    return { data: obj.app === 'jp-study-app' ? obj.data : obj, sha: j.sha };
  }

  // 上傳／比較用的內容：去掉每台裝置各自的設定與時間戳
  function payload(s) {
    const d = Object.assign({}, s);
    delete d.settings; delete d.lastSaved; delete d.lastExport;
    return d;
  }
  function canon(s) { return s ? JSON.stringify(payload(root.Store.normalize(s))) : ''; }

  async function push(c, data, sha) {
    const text = JSON.stringify({ app: 'jp-study-app', syncedAt: new Date().toISOString(), device: c.device, data: payload(data) });
    const body = { message: '同步學習紀錄（' + (c.device || '裝置') + '）', content: b64encode(text) };
    if (sha) body.sha = sha;
    const res = await gh('PUT', filePath(c), body, c);
    if (res.status === 409 || res.status === 422) return { conflict: true };
    if (res.status === 404) throw new SyncError('找不到 repo「' + c.owner + '/' + c.repo + '」，或 token 沒有權限存取它', 'auth');
    if (!res.ok) throw new SyncError('上傳失敗（HTTP ' + res.status + '）', 'http');
    return { conflict: false };
  }

  async function doSync(reason) {
    const c = loadCfg();
    if (!c.enabled || !c.token) { setStatus('off'); return { ok: false, reason: 'off' }; }
    if (root.navigator && root.navigator.onLine === false) { c.pending = true; saveCfg(); setStatus('offline', '離線中，恢復連線後會自動同步'); return { ok: false, reason: 'offline' }; }
    setStatus('syncing', '同步中…');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await pull(c);
        const local = root.Store.get();
        const merged = remote.data ? root.Store.merge(local, remote.data) : root.Store.normalize(JSON.parse(JSON.stringify(local)));
        const changedLocal = canon(merged) !== canon(local);
        if (changedLocal) { applying = true; try { root.Store.replaceState(merged); } finally { applying = false; } }
        let uploaded = false;
        if (!remote.data || canon(merged) !== canon(remote.data)) {
          const r = await push(c, merged, remote.sha);
          if (r.conflict) continue; // 另一台剛好也上傳了：重新下載、再合併一次
          uploaded = true;
        }
        c.lastSync = Date.now(); c.lastError = ''; c.pending = false; saveCfg();
        setStatus('ok', '已同步');
        if (changedLocal && typeof root.App !== 'undefined' && root.App.onSynced) root.App.onSynced();
        return { ok: true, changedLocal, uploaded, reason };
      }
      throw new SyncError('同時有其他裝置在上傳，稍後會再試', 'conflict');
    } catch (e) {
      c.lastError = e.message || String(e); c.pending = true; saveCfg();
      setStatus(e.code === 'network' && root.navigator && root.navigator.onLine === false ? 'offline' : 'error', c.lastError);
      return { ok: false, reason: e.code || 'error', error: c.lastError };
    }
  }

  // 同一時間只跑一個同步；跑的時候又被要求，就在結束後再跑一次
  function syncNow(reason) {
    clearTimeout(timer); timer = null;
    if (running) { again = true; return running; }
    running = doSync(reason).finally(() => {
      running = null;
      if (again) { again = false; syncNow('again'); }
    });
    return running;
  }
  function schedule(ms) {
    const c = loadCfg();
    if (!c.enabled) return;
    c.pending = true; saveCfg();
    clearTimeout(timer);
    timer = setTimeout(() => syncNow('auto'), ms == null ? AUTO_DELAY : ms);
  }

  /* ---------- 啟用／停用 ---------- */
  async function enable(opts) {
    const c = loadCfg();
    const next = Object.assign({}, c, {
      owner: String(opts.owner || '').trim().replace(/^@/, ''),
      repo: String(opts.repo || '').trim(),
      token: String(opts.token || '').trim() || c.token,
      device: String(opts.device || '').trim() || c.device || guessDevice()
    });
    if (!next.owner || !next.repo) return { ok: false, error: '請填寫 GitHub 帳號與 repo 名稱' };
    if (!next.token) return { ok: false, error: '請貼上 token' };
    if (/^gh[ps]_/.test(next.token) && !/^github_pat_/.test(next.token)) {
      // 傳統 token 可存取帳號下所有 repo，風險較高；仍可使用，但提醒
      next.classicToken = true;
    }
    // 檢查 repo 存在、是私人的、而且 token 可以寫入
    let res;
    try { res = await gh('GET', '/repos/' + encodeURIComponent(next.owner) + '/' + encodeURIComponent(next.repo), null, next); }
    catch (e) { return { ok: false, error: e.message }; }
    if (res.status === 404) return { ok: false, error: '找不到「' + next.owner + '/' + next.repo + '」。請確認帳號、repo 名稱，以及 token 的 Repository access 有選到這個 repo' };
    if (!res.ok) return { ok: false, error: '無法讀取 repo（HTTP ' + res.status + '）' };
    const info = await res.json();
    if (!info.private) return { ok: false, error: '這個 repo 是「公開」的，任何人都能看到你的學習紀錄。請改用私人（Private）repo' };
    if (info.permissions && info.permissions.push === false) return { ok: false, error: 'Token 只有讀取權限，請把 Contents 設成「Read and write」' };
    cfg = Object.assign(next, { enabled: true, lastError: '' });
    saveCfg();
    const r = await syncNow('enable');
    return r.ok ? { ok: true, result: r, classic: !!next.classicToken } : { ok: false, error: r.error || '同步失敗' };
  }
  function disable(forget) {
    const c = loadCfg();
    c.enabled = false; c.pending = false;
    if (forget) c.token = '';
    saveCfg(); clearTimeout(timer); setStatus('off');
  }

  /* ---------- 自動觸發 ---------- */
  let started = false;
  function start() {
    if (started) return; started = true;
    const c = loadCfg();
    setStatus(c.enabled ? 'idle' : 'off', c.lastError);
    root.Store.onEvent(ev => { if (ev.type !== 'saved' || applying) return; if (running) again = true; else schedule(); });
    root.addEventListener('online', () => { if (loadCfg().enabled) syncNow('online'); });
    root.addEventListener('offline', () => { if (loadCfg().enabled) setStatus('offline', '離線中，恢復連線後會自動同步'); });
    root.document.addEventListener('visibilitychange', () => {
      const c2 = loadCfg(); if (!c2.enabled) return;
      if (root.document.visibilityState === 'hidden') { if (c2.pending) syncNow('hidden'); }
      else if (Date.now() - (c2.lastSync || 0) > 60000 || c2.pending) syncNow('visible');
    });
    root.addEventListener('pagehide', () => { if (loadCfg().pending) syncNow('pagehide'); });
    setInterval(() => { const c2 = loadCfg(); if (c2.enabled && root.document.visibilityState === 'visible') syncNow('periodic'); }, PERIODIC);
    if (c.enabled) syncNow('start');
  }

  const Sync = { start, enable, disable, syncNow, schedule, getConfig, getStatus, onStatus, CFG_KEY, _b64encode: b64encode, _b64decode: b64decode };
  root.Sync = Sync;
})(window);
