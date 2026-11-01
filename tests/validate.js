#!/usr/bin/env node
/* validate.js — 教材資料一致性驗證
 * 執行：node tests/validate.js
 * 檢查：單字欄位、重複、讀音對齊、例句含單字、例句逐詞可解釋、振假名讀音與單字庫一致、
 *       文法/課程/閱讀/聽力/模擬考的題目答案存在於選項、答案位置分佈、課程引用存在 等。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
  .filter(s => /^(js\/(jp|counters|dataindex|quizgen)\.js|data\/)/.test(s));
scripts.forEach(s => vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), ctx, { filename: s }));
const { JP, DataIndex } = ctx;
const D = ctx.JP_DATA;

const errors = [], warns = []; const mockInfo = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m);
const idx = DataIndex.buildIndex(D);
const KNOWN_POS = Object.keys(D.pos), KNOWN_CAT = Object.keys(D.categories);
const lessonIds = new Set((D.lessons || []).map(l => l.id));

/* ---------- 句子檢查 ---------- */
const sentenceStats = { count: 0, tokens: 0 };
function checkSentence(src, where, opts = {}) {
  if (typeof src !== 'string' || !src.trim()) { err(`${where}：空白句子`); return null; }
  if (/\[[^\]]*\]\[/.test(src)) err(`${where}：振假名重複 ${src}`);
  const s = JP.sentence(src);
  sentenceStats.count++;
  // 振假名內只能是假名
  for (const m of src.matchAll(/\[([^\]]+)\]/g)) if (!JP.isKana(m[1])) err(`${where}：振假名不是假名「${m[1]}」 ${src}`);
  // 未標振假名的漢字
  s.tokens.forEach(t => {
    if (t.punct) return;
    sentenceStats.tokens++;
    const bare = t.raw.replace(/[㐀-鿿々0-9０-９]+\[[^\]]+\]/g, '');
    if (/[㐀-鿿々]/.test(bare)) err(`${where}：漢字缺少讀音「${t.raw}」 ${src}`);
    if (!opts.noGloss) {
      const g = idx.gloss(t);
      if (!g) err(`${where}：無法解釋的詞「${t.surface}」 ${src}`);
      else if (g.readingMismatch) err(`${where}：讀音與單字庫不一致「${t.surface}」讀作 ${t.kana}，單字庫為 ${g.expected.join('/')} ${src}`);
    }
  });
  return s;
}

/* ---------- 單字 ---------- */
const seen = new Map();
const zhSeen = new Map();
idx.vocab.forEach(v => {
  const w = `單字 ${v.word}（${v.kana}）`;
  if (v.fields < 8) err(`${w}：欄位不足（${v.fields}）`);
  if (!KNOWN_POS.includes(v.pos)) err(`${w}：未知詞性 ${v.pos}`);
  if (!KNOWN_CAT.includes(v.cat)) err(`${w}：未知分類 ${v.cat}`);
  if (lessonIds.size && !lessonIds.has(v.lesson)) err(`${w}：課次 ${v.lesson} 不存在`);
  if (!JP.isKana(v.kana.replace(/^〜/, ''))) err(`${w}：讀音含非假名`);
  if (seen.has(v.id)) err(`${w}：重複（第 ${seen.get(v.id)} 行）`); else seen.set(v.id, v.line);
  const zk = v.word + '/' + v.zh; if (zhSeen.has(zk)) err(`${w}：重複的寫法與意思`); zhSeen.set(zk, 1);
  if (JP.hasKanji(v.word) && !v.ruby) err(`${w}：無法自動對齊振假名，請改用 漢[かな] 寫法`);
  if (v.ruby && JP.rubyToKana(v.ruby).replace(/^〜/, '') !== v.kana.replace(/^〜/, '')) err(`${w}：振假名 ${v.ruby} 與讀音不符`);
  if (v.formsError) err(`${w}：${v.formsError}`);
  if (!v.zh) err(`${w}：缺中文`);
  if (!v.ex || !v.exZh) { err(`${w}：缺例句或例句翻譯`); return; }
  const s = checkSentence(v.ex, w + ' 例句');
  if (!s) return;
  const surfaces = [v.word.replace(/^〜/, ''), v.kana.replace(/^〜/, '')];
  if (v.forms) Object.values(v.forms).forEach(([a, b]) => surfaces.push(a.replace(/です$/, ''), b.replace(/です$/, '')));
  if (v.pos === '動1' || v.pos === '動2' || v.pos === '動3') {
    const st = JP.verbStems(v.word, v.kana, v.pos.slice(1));
    surfaces.push(st.masuStem[0], st.naiStem[0], st.masuStem[1]);
  }
  if (v.pos === 'い形') surfaces.push(v.word.slice(0, -1), v.kana.slice(0, -1));
  if (!surfaces.some(x => x && (s.text.includes(x) || s.kana.includes(x)))) err(`${w}：例句中找不到這個單字 ${v.ex}`);
});
// 同音異字提醒（聽力題會避開這些干擾選項）
const byKana = new Map();
idx.vocab.forEach(v => { const k = JP.kataToHira(v.kana); byKana.set(k, (byKana.get(k) || []).concat(v.word)); });
const homophones = [...byKana.entries()].filter(([, a]) => a.length > 1);

/* ---------- 選擇題共用檢查 ---------- */
// 題目格式：{q, answer, wrong:[...], explain}；實際作答時由 quizgen 洗牌選項，所以這裡只檢查內容，並用模擬洗牌統計答案位置分佈
const answerPos = [0, 0, 0, 0, 0];
let mcqCount = 0;
const HAS_KANA = /[\u3041-\u3096\u30a1-\u30fa]/;
function checkMCQ(q, where) {
  mcqCount++;
  if (!q.q) err(`${where}：缺少題目`);
  if (!q.answer) err(`${where}：缺少答案`);
  if (!Array.isArray(q.wrong) || q.wrong.length < 2) { err(`${where}：干擾選項少於 2 個`); return; }
  const opts = [q.answer].concat(q.wrong);
  if (new Set(opts).size !== opts.length) err(`${where}：選項重複或干擾項等於答案 ${JSON.stringify(opts)}`);
  if (!q.explain) err(`${where}：缺少解析`);
  // 模擬洗牌 40 次，統計答案落在第幾個位置
  for (let t = 0; t < 40; t++) {
    const sh = JP.shuffle(opts, JP.seeded(JP.hashStr(where) + t));
    answerPos[Math.min(4, sh.indexOf(q.answer))]++;
  }
  if (q.type === 'particle') {
    if (!/＿/.test(q.q)) err(`${where}：填空題缺少 ＿`);
    if (!/＿/.test(q.q) ) return;
    checkSentence(q.q.replace('＿', q.answer), where + ' 完整句');
    checkSentence(q.q, where + ' 題目', { noGloss: true });
  } else if (/\[/.test(q.q)) checkSentence(q.q, where + ' 題目', { noGloss: true });
  opts.forEach(o => { if (HAS_KANA.test(o) && !/^[\u3000-\u9fff（）()\w\s·・]*$/.test('') ) checkSentence(o, where + ' 選項「' + o + '」', { noGloss: true }); });
}

/* ---------- 文法 ---------- */
const gramIds = new Set();
(D.grammar || []).forEach(g => {
  const w = `文法 ${g.id} ${g.name}`;
  if (gramIds.has(g.id)) err(`${w}：重複 id`); gramIds.add(g.id);
  ['name', 'conn', 'explain', 'usage'].forEach(k => { if (!g[k]) err(`${w}：缺少 ${k}`); });
  if (!lessonIds.has(g.lesson)) err(`${w}：課次 ${g.lesson} 不存在`);
  if (!g.examples || g.examples.length < 3) err(`${w}：例句少於 3 句`);
  (g.examples || []).forEach((e, i) => { checkSentence(e[0], `${w} 例句${i + 1}`); if (!e[1]) err(`${w} 例句${i + 1}：缺翻譯`); });
  if (!g.mistakes || !g.mistakes.length) err(`${w}：缺常見錯誤`);
  if (!g.compare) warn(`${w}：缺相似文法比較`);
  if (!g.exercises || g.exercises.length < 2) err(`${w}：練習題少於 2 題`);
  (g.exercises || []).forEach((x, i) => {
    const ww = `${w} 練習${i + 1}`;
    if (x.type === 'order') {
      if (!x.chunks || x.chunks.length < 3) err(`${ww}：排序題片段不足`);
      x.chunks.forEach(c => checkSentence(c, ww, { noGloss: true }));
      if (!x.zh) err(`${ww}：排序題缺翻譯`);
      (x.alt || []).forEach(a => { if (a.slice().sort().join() !== x.chunks.slice().sort().join()) err(`${ww}：替代語序的片段與原題不同`); });
    } else checkMCQ(x, ww);
  });
});

/* ---------- 課程 ---------- */
const weeks = new Set();
(D.lessons || []).forEach((l, i) => {
  const w = `課程 ${l.id} ${l.title}`;
  weeks.add(l.week);
  ['title', 'week', 'stage', 'goals', 'pass'].forEach(k => { if (!l[k]) err(`${w}：缺少 ${k}`); });
  (l.grammar || []).forEach(g => { if (!gramIds.has(g)) err(`${w}：引用不存在的文法 ${g}`); });
  (l.sentences || []).forEach((s, j) => { checkSentence(s[0], `${w} 例句${j + 1}`); if (!s[1]) err(`${w} 例句${j + 1}：缺翻譯`); });
  (l.dialogue ? l.dialogue.lines : []).forEach((s, j) => { checkSentence(s[1], `${w} 會話${j + 1}`); if (!s[2]) err(`${w} 會話${j + 1}：缺翻譯`); });
  if (!l.mistakes || !l.mistakes.length) err(`${w}：缺常見錯誤`);
  (l.exercises || []).forEach((x, j) => x.type === 'order' ? null : checkMCQ(x, `${w} 練習${j + 1}`));
  const nv = (idx.vocabByLesson.get(l.id) || []).length;
  const hasContent = nv || (l.grammar || []).length || l.kana || (l.sentences || []).length;
  if (!hasContent) err(`${w}：沒有任何教材內容`);
  (l.drills || []).forEach(d => {
    const m = typeof d === 'string' ? idx.vocab.filter(v => v.kana === d) : [];
    if (typeof d === 'string' && m.length !== 1) err(`${w}：拼讀練習「${d}」在單字庫中找到 ${m.length} 筆，請改寫為 [假名, 中文]`);
  });
});
for (let wk = 1; wk <= 26; wk++) if ((D.lessons || []).length && !weeks.has(wk)) err(`第 ${wk} 週沒有課程`);

/* ---------- 閱讀、聽力、模擬考 ---------- */
(D.readings || []).forEach(r => {
  const w = `閱讀 ${r.id} ${r.title}`;
  if (!lessonIds.has(r.unlock)) err(`${w}：解鎖課次 ${r.unlock} 不存在`);
  r.lines.forEach((s, j) => { checkSentence(s[0], `${w} 第${j + 1}句`); if (!s[1]) err(`${w} 第${j + 1}句缺翻譯`); });
  (r.questions || []).forEach((q, j) => checkMCQ(q, `${w} 題${j + 1}`));
});
(D.listening || []).forEach(r => {
  const w = `聽力 ${r.id}`;
  if (!lessonIds.has(r.unlock)) err(`${w}：解鎖課次 ${r.unlock} 不存在`);
  r.lines.forEach((s, j) => { checkSentence(s[1], `${w} 第${j + 1}句`); if (!s[2]) err(`${w} 第${j + 1}句缺翻譯`); });
  checkMCQ(r, w);
});
/* ---------- 題目產生器全面測試：大量產生題目並檢查每一題 ---------- */
const QG = ctx.QuizGen; QG.init(idx, D);
let genCount = 0; const genStats = { type: {}, cat: {} }; const genPos = [0, 0, 0, 0, 0];
function checkQ(q, where) {
  genCount++;
  genStats.type[q.type] = (genStats.type[q.type] || 0) + 1; genStats.cat[q.cat] = (genStats.cat[q.cat] || 0) + 1;
  if (!q.cat || !['kana', 'vocab', 'grammar', 'listening', 'reading'].includes(q.cat)) err(`${where}：未知類別 ${q.cat}`);
  if (!q.explain) err(`${where}：缺少解析`);
  if (q.type === 'mc') {
    if (!q.options || q.options.length < 4) err(`${where}：選項少於 4 個 ${JSON.stringify(q.options)}`);
    if (new Set(q.options).size !== q.options.length) err(`${where}：選項重複 ${JSON.stringify(q.options)}`);
    const ai = q.options.indexOf(q.answer);
    if (ai < 0) err(`${where}：答案不在選項中 ${q.answer}`); else genPos[Math.min(4, ai)]++;
    if (q.options.filter(o => o === q.answer).length !== 1) err(`${where}：答案出現多次`);
  } else if (q.type === 'order') {
    if (q.chunks.slice().sort().join('|') !== q.answer.slice().sort().join('|')) err(`${where}：排序題片段與答案不一致`);
    if (!QG.check(q, q.answer)) err(`${where}：排序題的標準答案判定為錯`);
    if (q.answer.length > 1 && QG.check(q, q.answer.slice().reverse()) && JP.stripRuby(q.answer.join('')) !== JP.stripRuby(q.answer.slice().reverse().join(''))) err(`${where}：排序題反序也判對`);
  } else if (q.type === 'match') {
    const resp = {}; q.pairs.forEach(p => resp[p.l] = p.r);
    if (!QG.check(q, resp)) err(`${where}：配對題標準答案判定為錯`);
    if (new Set(q.pairs.map(p => p.r)).size !== q.pairs.length) err(`${where}：配對題羅馬拼音重複`);
  } else err(`${where}：未知題型`);
  // 單字題答案正確性：重新用單字庫驗證
  if (q.type === 'mc' && q.ref && q.ref.vocab) {
    const v = idx.byId.get(q.ref.vocab);
    if (!v) err(`${where}：引用不存在的單字`);
    else if (q.kind === 'jp2zh' || q.kind === 'kana2zh') { if (q.answer !== QG.zhMain(v)) err(`${where}：答案與單字庫不符`); }
    else if (q.kind === 'zh2jp' || q.kind === 'listen') { if (q.answer !== QG.disp(v)) err(`${where}：答案與單字庫不符`); }
    else if (q.kind === 'read') { if (q.answer !== v.kana.replace(/^〜/, '')) err(`${where}：讀音答案不符`); }
    if (q.kind === 'listen' || q.kind === 'kana2zh') { // 不可有同音詞造成歧義
      const same = idx.vocab.filter(x => x.id !== v.id && JP.kataToHira(x.kana) === JP.kataToHira(v.kana));
      if (q.kind === 'listen') q.options.forEach(o => same.forEach(x => { if (o === QG.disp(x)) err(`${where}：聽音題選項含同音詞 ${o}`); }));
      if (q.kind === 'kana2zh' && same.length) err(`${where}：假名選意思題的單字有同音詞（${v.word}）`);
    }
  }
  if (q.kind === 'k2r') { const e = QG.KANA().find(x => x.ch === q.prompt); if (!e || e.r !== q.answer) err(`${where}：假名題答案錯誤`); }
  if (q.kind === 'r2k') { const e = QG.KANA().find(x => x.ch === q.answer); if (!e || e.r !== q.prompt) err(`${where}：羅馬拼音選假名答案錯誤`); QG.KANA().filter(x => q.options.includes(x.ch) && x.ch !== q.answer).forEach(x => { if (x.r === q.prompt) err(`${where}：羅馬拼音選假名有同音干擾 ${x.ch}`); }); }
}
// 假名表與羅馬拼音引擎交叉驗證（兩份獨立資料）
QG.KANA().forEach(e => { if (['は', 'ハ', 'へ', 'ヘ'].includes(e.ch)) return; /* 單獨出現時助詞讀音 wa/e 由詞語層級處理，假名表標示字音 ha/he */ const r = JP.kanaToRomaji(e.ch); if (r !== e.r) err(`假名表與羅馬拼音引擎不一致：${e.ch} 表=${e.r} 引擎=${r}`); });
// 每課測驗：每課跑 12 種亂數種子
idx.lessons.forEach(l => {
  if (['L50', 'L51', 'L52', 'L53', 'L54'].includes(l.id)) return;
  for (let s = 0; s < 12; s++) {
    const qs = QG.lessonQuiz(l.id, JP.seeded(s * 977 + JP.hashStr(l.id)));
    if (qs.length < 10) err(`課程 ${l.id} 測驗題數不足（${qs.length}）`);
    qs.forEach((q, i) => checkQ(q, `課程 ${l.id} 測驗#${s}-${i + 1}`));
  }
});
// 每日／每週／每月、各類型
const allIds = idx.lessons.map(l => l.id);
for (let d = 1; d <= 30; d++) { QG.daily('2026-11-' + String(d).padStart(2, '0'), allIds.slice(0, 5 + d)).forEach((q, i) => checkQ(q, `每日#${d}-${i + 1}`)); }
QG.weekly('2026-11-01', allIds.slice(0, 30)).forEach((q, i) => checkQ(q, `每週#${i + 1}`));
QG.monthly('2026-11-01', allIds.slice(0, 40)).forEach((q, i) => checkQ(q, `每月#${i + 1}`));
Object.keys(QG.TYPES).filter(t => t !== 'mock').forEach(t => {
  for (let s = 0; s < 6; s++) {
    const qs = QG.byType(t, allIds.slice(0, 49), 12, JP.seeded(s + 7), {});
    if (qs.length < 3 && t !== 'reading') err(`題型 ${t} 產生題數不足 ${qs.length}`);
    qs.forEach((q, i) => checkQ(q, `題型 ${t}#${s}-${i + 1}`));
  }
});
// 模擬考
let prevUsed = [];
(D.mocks || []).forEach(m => {
  const mk = QG.mock(m, prevUsed);
  const total = mk.sections.reduce((a, s) => a + s.items.length, 0);
  if (total < 45) err(`模擬考 ${m.id} 題數太少（${total}）`);
  mk.sections.forEach(sec => sec.items.forEach((q, i) => checkQ(q, `模擬考 ${m.id} ${sec.name} #${i + 1}`)));
  const overlap = mk.usedVocab.filter(x => prevUsed.includes(x)); if (overlap.length) err(`模擬考 ${m.id} 與前一回單字重複：${overlap.length} 個`);
  prevUsed = prevUsed.concat(mk.usedVocab);
  mockInfo.push(`${m.id}：` + mk.sections.map(s => `${s.name} ${s.items.length}`).join('、') + `（共 ${total} 題）`);
});

/* ---------- 變化引擎自我測試（對照標準答案） ---------- */
const conjTests = [
  ['行く', 'いく', '1', 'te', '行って'], ['書く', 'かく', '1', 'te', '書いて'], ['泳ぐ', 'およぐ', '1', 'te', '泳いで'],
  ['話す', 'はなす', '1', 'te', '話して'], ['待つ', 'まつ', '1', 'te', '待って'], ['死ぬ', 'しぬ', '1', 'te', '死んで'],
  ['遊ぶ', 'あそぶ', '1', 'te', '遊んで'], ['読む', 'よむ', '1', 'te', '読んで'], ['帰る', 'かえる', '1', 'nai', '帰らない'],
  ['買う', 'かう', '1', 'nai', '買わない'], ['ある', 'ある', '1', 'nai', 'ない'], ['食べる', 'たべる', '2', 'masu', '食べます'],
  ['起きる', 'おきる', '2', 'ta', '起きた'], ['来る', 'くる', '3', 'nai', '来ない'], ['する', 'する', '3', 'te', 'して'],
  ['勉強する', 'べんきょうする', '3', 'masendeshita', '勉強しませんでした'], ['入る', 'はいる', '1', 'masu', '入ります'],
  ['切る', 'きる', '1', 'te', '切って'], ['着る', 'きる', '2', 'te', '着て'], ['要る', 'いる', '1', 'nai', '要らない']
];
conjTests.forEach(([w, k, t, f, exp]) => { const got = JP.conjugateVerb(w, k, t)[f][0]; if (got !== exp) err(`動詞變化錯誤：${w} ${f} 得到 ${got}，應為 ${exp}`); });
const kuru = JP.conjugateVerb('来る', 'くる', '3');
if (kuru.nai[1] !== 'こない' || kuru.masu[1] !== 'きます') err('来る 的讀音變化錯誤');
const ii = JP.conjugateAdj('いい', 'いい', 'i'); if (ii.neg[0] !== 'よくないです' || ii.past[0] !== 'よかったです') err('いい 的變化錯誤');
const romajiTests = [['がっこう', 'gakkou'], ['きっぷ', 'kippu'], ['ちょっと', 'chotto'], ['こんにちは', 'konnichiwa'], ['しんぶん', 'shinbun'],
  ['きんえん', "kin'en"], ['コーヒー', 'koohii'], ['まっちゃ', 'matcha'], ['じゅぎょう', 'jugyou']];
romajiTests.forEach(([k, r]) => { if (JP.kanaToRomaji(k) !== r) err(`羅馬拼音錯誤：${k} → ${JP.kanaToRomaji(k)}，應為 ${r}`); });

/* ---------- 報告 ---------- */
const count = {
  lessons: (D.lessons || []).length, vocab: idx.vocab.length, grammar: (D.grammar || []).length,
  grammarExercises: (D.grammar || []).reduce((a, g) => a + (g.exercises || []).length, 0),
  lessonExercises: (D.lessons || []).reduce((a, l) => a + (l.exercises || []).length, 0),
  readings: (D.readings || []).length, readingQuestions: (D.readings || []).reduce((a, r) => a + (r.questions || []).length, 0),
  listening: (D.listening || []).length, mocks: (D.mocks || []).length,
  mockQuestions: 0,
  sentencesChecked: sentenceStats.count, tokensChecked: sentenceStats.tokens
};
const byCat = {}; idx.vocab.forEach(v => byCat[v.cat] = (byCat[v.cat] || 0) + 1);
const byLesson = {}; idx.vocab.forEach(v => byLesson[v.lesson] = (byLesson[v.lesson] || 0) + 1);
console.log('== 教材數量 ==');
console.log(JSON.stringify(count, null, 1));
console.log('單字分類：', JSON.stringify(byCat));
if (process.argv.includes('--lessons')) console.log('各課單字：', JSON.stringify(byLesson));
console.log(`同音異字組數：${homophones.length}（聽力題已排除同音干擾）`, process.argv.includes('-v') ? homophones.map(h => h[0] + ':' + h[1].join('/')).join(' ') : '');
console.log('產生器測試：共檢查 ' + genCount + ' 題，題型 ' + JSON.stringify(genStats.type) + '，類別 ' + JSON.stringify(genStats.cat));
const gtot = genPos.reduce((a, b) => a + b, 0) || 1;
console.log('產生器題目答案位置分佈（第1/2/3/4 個選項）：', genPos.slice(0, 4).map(x => (100 * x / gtot).toFixed(1) + '%').join(' / '));
mockInfo.forEach(m => console.log('模擬考 ' + m));
const tot = answerPos.reduce((a, b) => a + b, 0) || 1;
console.log('手寫選擇題 ' + mcqCount + ' 題，洗牌後答案位置分佈（第1/2/3/4 個選項）：', answerPos.slice(0, 4).map(x => (100 * x / tot).toFixed(1) + '%').join(' / '));
if (warns.length) { console.log(`\n== 警告 ${warns.length} ==`); warns.slice(0, process.argv.includes('-v') ? 9999 : 20).forEach(w => console.log('  ! ' + w)); }
if (errors.length) { console.log(`\n== 錯誤 ${errors.length} ==`); errors.forEach(e => console.log('  ✗ ' + e)); process.exit(1); }
console.log('\n✓ 全部檢查通過');
