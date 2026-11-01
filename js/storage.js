/* storage.js — 學習紀錄的保存、載入、匯出、匯入
 * - 使用 localStorage（key: jpstudy.v1）。若瀏覽器封鎖 localStorage（例如私密模式），退回記憶體模式並提示。
 * - 匯入時會驗證結構，可選擇「合併」或「取代」。
 * 注意：localStorage 只存在這個瀏覽器；可在「設定與備份」開啟 GitHub 雲端同步（js/sync.js），或定期匯出。
 */
(function (root) {
  'use strict';
  const KEY = 'jpstudy.v1';
  const VERSION = 1;
  let mem = null;          // 記憶體備援
  let persistent = true;   // localStorage 是否可用
  let state = null;
  let saveTimer = null;
  const listeners = [];

  function today(d) {
    const x = d ? new Date(d) : new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  function defaults() {
    return {
      v: VERSION, createdAt: Date.now(), startDate: today(), lastExport: null, lastSaved: null,
      settings: {
        rate: 1, slowRate: 0.65, voiceURI: '', romaji: 'auto', furigana: true, zh: true, ttsSource: 'text',
        newPerDay: 10, reviewCap: 40, theme: 'auto', fontScale: 1, followGap: 1.4
      },
      lessons: {}, cards: {}, favs: {}, grammar: {}, kana: {}, mistakes: [], quizzes: [], days: {},
      listening: {}, readings: {}, notes: {}, tomb: {}
    };
  }

  function probe() {
    try {
      const k = '__jpstudy_probe__';
      root.localStorage.setItem(k, '1'); root.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  // 補齊缺少的欄位（舊版資料升級）
  function normalize(s) {
    const d = defaults();
    const out = Object.assign({}, d, s);
    out.settings = Object.assign({}, d.settings, s.settings || {});
    ['lessons', 'cards', 'favs', 'grammar', 'kana', 'days', 'listening', 'readings', 'notes', 'tomb'].forEach(k => { if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {}; });
    ['mistakes', 'quizzes'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    out.v = VERSION;
    return out;
  }

  function load() {
    persistent = probe();
    let raw = null;
    if (persistent) { try { raw = root.localStorage.getItem(KEY); } catch (e) { persistent = false; } }
    if (raw) {
      try { state = normalize(JSON.parse(raw)); }
      catch (e) {
        // 資料損毀：先備份壞資料再重新開始
        try { root.localStorage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch (_) { /* ignore */ }
        state = defaults();
      }
    } else if (mem) state = mem; else state = defaults();
    return state;
  }

  function flush() {
    if (!state) return false;
    state.lastSaved = Date.now();
    mem = state;
    if (!persistent) return false;
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { persistent = false; emit({ type: 'error', error: e }); return false; }
    emit({ type: 'saved' });
    return true;
  }
  function save() { // 合併短時間內多次存檔
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 120);
  }
  function saveNow() { clearTimeout(saveTimer); return flush(); }

  function get() { return state || load(); }

  /* ---------- 匯出 / 匯入 ---------- */
  function exportData() {
    const s = get();
    s.lastExport = Date.now();
    saveNow();
    return JSON.stringify({ app: 'jp-study-app', exportedAt: new Date().toISOString(), data: s }, null, 1);
  }

  function validate(obj) {
    if (!obj || typeof obj !== 'object') return '檔案不是有效的 JSON 物件';
    const d = obj.app === 'jp-study-app' ? obj.data : obj;
    if (!d || typeof d !== 'object') return '找不到學習資料（data）';
    if (typeof d.v !== 'number') return '缺少版本欄位（v），這可能不是本系統匯出的備份';
    if (d.v > VERSION) return '備份檔來自較新版本（v' + d.v + '），請更新系統後再匯入';
    if (d.cards && typeof d.cards !== 'object') return '單字進度格式錯誤';
    if (d.lessons && typeof d.lessons !== 'object') return '課程進度格式錯誤';
    return null;
  }

  // 合併（匯入與雲端同步共用）：
  // - 單字卡：以較新的複習時間（last）為準
  // - 課程：完成狀態取聯集、成績取最高
  // - 收藏、錯題：依時間戳記比較，配合「刪除紀錄」(tomb) 讓取消收藏／移除錯題也能同步
  // - 每日紀錄：各欄位取最大值；測驗紀錄取聯集
  // - 設定（語音、字體大小等）保留 a（本機）的值
  function ts(v) { return typeof v === 'number' ? v : (v ? 1 : 0); }
  function merge(a, b) {
    b = normalize(JSON.parse(JSON.stringify(b)));
    const out = normalize(JSON.parse(JSON.stringify(a)));
    // 刪除紀錄：取較新的時間
    out.tomb = Object.assign({}, out.tomb);
    Object.entries(b.tomb || {}).forEach(([k, t]) => { if (!(out.tomb[k] >= t)) out.tomb[k] = t; });
    Object.entries(b.cards || {}).forEach(([k, c]) => {
      const o = out.cards[k];
      if (!o || (c.last || 0) > (o.last || 0)) out.cards[k] = c;
    });
    Object.entries(b.favs || {}).forEach(([k, v]) => { if (ts(v) > ts(out.favs[k])) out.favs[k] = v; });
    Object.keys(out.favs).forEach(k => { const t = out.tomb['fav:' + k]; if (t && t >= ts(out.favs[k])) delete out.favs[k]; });
    Object.entries(b.lessons || {}).forEach(([k, l]) => {
      const o = out.lessons[k];
      if (!o) { out.lessons[k] = l; return; }
      out.lessons[k] = Object.assign({}, o, l, {
        read: o.read || l.read, vocabDone: o.vocabDone || l.vocabDone,
        quizBest: Math.max(o.quizBest || 0, l.quizBest || 0), attempts: Math.max(o.attempts || 0, l.attempts || 0),
        completedAt: o.completedAt && l.completedAt ? Math.min(o.completedAt, l.completedAt) : (o.completedAt || l.completedAt)
      });
      Object.keys(out.lessons[k]).forEach(f => { if (out.lessons[k][f] === undefined) delete out.lessons[k][f]; });
    });
    ['grammar', 'kana'].forEach(t => Object.entries(b[t] || {}).forEach(([k, v]) => {
      const o = out[t][k];
      out[t][k] = o ? { wrong: Math.max(o.wrong || 0, v.wrong || 0), right: Math.max(o.right || 0, v.right || 0), last: Math.max(o.last || 0, v.last || 0) } : v;
    }));
    Object.entries(b.days || {}).forEach(([k, v]) => {
      const o = out.days[k];
      if (!o) { out.days[k] = v; return; }
      ['newWords', 'reviews', 'reviewsOk', 'quizzes', 'minutes'].forEach(f => { if (o[f] !== undefined || v[f] !== undefined) o[f] = Math.max(o[f] || 0, v[f] || 0); });
      if (v.active) o.active = true;
      o.tasks = Object.assign({}, v.tasks || {}, o.tasks || {});
    });
    const seen = new Set(out.quizzes.map(q => q.t));
    (b.quizzes || []).forEach(q => { if (!seen.has(q.t)) out.quizzes.push(q); });
    out.quizzes.sort((x, y) => x.t - y.t);
    // 錯題：同一題取較新的那份；被移除的題目不會再出現（除非之後又答錯）
    const mt = m => Math.max(m.last || 0, m.first || 0);
    const mm = new Map(out.mistakes.map(m => [m.key, m]));
    (b.mistakes || []).forEach(m => { const o = mm.get(m.key); if (!o || mt(m) > mt(o)) mm.set(m.key, m); });
    out.mistakes = [...mm.values()].filter(m => { const t = out.tomb['mis:' + m.key]; return !(t && t >= mt(m)); });
    if (out.mistakes.length > 400) { out.mistakes.sort((x, y) => mt(y) - mt(x)); out.mistakes.length = 400; }
    out.mistakes.sort((x, y) => (x.first || 0) - (y.first || 0));
    ['listening', 'readings'].forEach(t => Object.entries(b[t] || {}).forEach(([k, v]) => {
      const o = out[t][k];
      if (!o) { out[t][k] = v; return; }
      const newer = (v.t || 0) > (o.t || 0) ? v : o;
      out[t][k] = Object.assign({}, newer, { tries: Math.max(o.tries || 0, v.tries || 0) });
      if ('best' in o || 'best' in v) out[t][k].best = typeof o.best === 'boolean' || typeof v.best === 'boolean' ? !!(o.best || v.best) : Math.max(o.best || 0, v.best || 0);
    }));
    // 雜項紀錄：時間取較新、跟讀紀錄取聯集
    const bn = b.notes || {};
    Object.entries(bn).forEach(([k, v]) => {
      const o = out.notes[k];
      if (o === undefined) out.notes[k] = v;
      else if (typeof v === 'number' && typeof o === 'number') out.notes[k] = Math.max(o, v);
      else if (v && typeof v === 'object' && o && typeof o === 'object' && !Array.isArray(v)) {
        const m = Object.assign({}, o);
        Object.entries(v).forEach(([kk, vv]) => { if (!(kk in m) || (typeof vv === 'number' && vv > m[kk])) m[kk] = vv; });
        out.notes[k] = m;
      }
    });
    if (b.startDate && b.startDate < out.startDate) out.startDate = b.startDate;
    if (b.createdAt && b.createdAt < out.createdAt) out.createdAt = b.createdAt;
    out.settings = Object.assign({}, out.settings, a.settings);
    return out;
  }

  // 記錄刪除（讓「取消收藏」「移除錯題」能同步到其他裝置）
  function tombstone(key) { const s = get(); s.tomb = s.tomb || {}; s.tomb[key] = Date.now(); }

  // 用合併後的資料更新目前狀態（就地更新，避免其他程式拿著舊物件）
  function replaceState(next) {
    const s = get();
    Object.keys(s).forEach(k => { if (!(k in next)) delete s[k]; });
    Object.assign(s, next);
    saveNow();
    return s;
  }

  function importData(text, mode) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: '無法解析 JSON：' + e.message }; }
    const bad = validate(obj);
    if (bad) return { ok: false, error: bad };
    const incoming = normalize(obj.app === 'jp-study-app' ? obj.data : obj);
    state = mode === 'merge' ? merge(get(), incoming) : incoming;
    saveNow();
    return { ok: true, cards: Object.keys(state.cards).length, lessons: Object.keys(state.lessons).length, quizzes: state.quizzes.length };
  }

  function reset() { state = defaults(); mem = null; saveNow(); return state; }
  function usage() {
    try { return new Blob([JSON.stringify(get())]).size; } catch (e) { return 0; }
  }
  function onEvent(f) { listeners.push(f); }
  function emit(ev) { listeners.forEach(f => { try { f(ev); } catch (e) { /* ignore */ } }); }
  function isPersistent() { return persistent; }

  const Store = { load, get, save, saveNow, exportData, importData, validate, reset, usage, today, onEvent, isPersistent, defaults, normalize, merge, tombstone, replaceState, KEY };
  root.Store = Store;
  if (typeof module !== 'undefined') module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
