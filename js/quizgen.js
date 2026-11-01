/* quizgen.js — 題目產生器與答案判定（瀏覽器與 Node 驗證腳本共用）
 * 題目物件：{type:'mc'|'order'|'match', cat, kind, prompt, sub, speak, options, answer, explain, optNotes, ref, lesson}
 *   cat：錯誤分析類別 kana / vocab / grammar / listening / reading
 *   mc 的 options 一律在產生時洗牌，因此正確答案位置是隨機的（驗證腳本會統計分佈）
 */
(function (root) {
  'use strict';
  const JP = root.JP || (typeof require !== 'undefined' ? require('./jp.js') : null);
  let idx = null, D = null, KANA = [], KANA_BY = new Map(), HOMO = new Map();

  const zhMain = v => v.zh.split('；')[0];
  const isVerb = v => /^動/.test(v.pos);

  function init(index, data) {
    idx = index; D = data;
    KANA = []; KANA_BY = new Map();
    const K = D.kana, toK = JP.hiraToKata;
    const push = (ch, r, type, group) => { const e = { ch, r, type, group }; KANA.push(e); KANA_BY.set(ch, e); };
    K.seion.forEach((s, i) => { if (!s) return; const row = Math.floor(i / 5); push(s.h, s.r, 'hira', 'seion' + row); push(s.k, s.r, 'kata', 'seion' + row); });
    K.dakuon.forEach(s => { push(s.h, s.r, 'hira', 'dakuon'); push(s.k, s.r, 'kata', 'dakuon'); });
    K.handakuon.forEach(s => { push(s.h, s.r, 'hira', 'handakuon'); push(s.k, s.r, 'kata', 'handakuon'); });
    K.youon.forEach(s => { push(s.h, s.r, 'hira', 'youon'); push(s.k, s.r, 'kata', 'youon'); });
    K.special.forEach(s => push(s.k, s.r, 'kata', 'special'));
    HOMO = new Map();
    idx.vocab.forEach(v => { const k = JP.kataToHira(v.kana.replace(/^〜/, '')); HOMO.set(k, (HOMO.get(k) || 0) + 1); });
  }

  const hk = v => JP.kataToHira(v.kana.replace(/^〜/, ''));
  const homophone = v => (HOMO.get(hk(v)) || 0) > 1;
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const sample = (arr, n, rng) => JP.shuffle(arr, rng).slice(0, n);
  const disp = v => v.ruby || v.word;            // 含振假名標記的顯示字串
  const speakWord = v => v.kana.replace(/^〜/, '');
  const speakSentence = src => JP.sentence(src).text;

  /* ---------- 假名題 ---------- */
  function kanaPool(chars) { return chars.map(c => KANA_BY.get(c)).filter(Boolean); }
  function setChars(setKeys) {
    const out = [];
    setKeys.forEach(k => (D.kana.sets[k] || []).forEach(c => { if (!out.includes(c)) out.push(c); }));
    return out;
  }
  function confusableOf(ch) {
    const out = [];
    D.kana.confusables.forEach(([a, b]) => { if (a === ch) out.push(b); else if (b === ch) out.push(a); });
    return out;
  }
  function kanaQ(e, kind, rng, pool) {
    // pool：可用的干擾選項（KANA 項目）
    const others = pool.filter(x => x.ch !== e.ch && x.r !== e.r);
    const conf = confusableOf(e.ch).map(c => KANA_BY.get(c)).filter(x => x && x.r !== e.r);
    const same = others.filter(x => x.type === e.type);
    const near = same.filter(x => x.r[0] === e.r[0] || x.ch.length === e.ch.length);
    const take = (list, n, out, key) => { JP.shuffle(list, rng).forEach(x => { if (out.length < n && !out.some(o => o[key] === x[key] || o.r === x.r)) out.push(x); }); };
    const picks = [];
    take(conf, 2, picks, 'ch'); take(near, 3, picks, 'ch'); take(same, 3, picks, 'ch'); take(others, 3, picks, 'ch');
    const wrongs = picks.slice(0, 3);
    const base = { cat: 'kana', ref: { kana: [e.ch] }, lesson: null };
    if (kind === 'k2r') {
      const answer = e.r, options = JP.shuffle([answer].concat(wrongs.map(w => w.r)), rng);
      const notes = {}; wrongs.forEach(w => { notes[w.r] = `「${w.r}」是「${w.ch}」的發音。`; });
      return Object.assign(base, { type: 'mc', kind, prompt: e.ch, big: true, speak: e.ch, sub: '這個假名怎麼念？', options, answer, optNotes: notes,
        explain: `「${e.ch}」念 ${e.r}（${e.type === 'hira' ? '平假名' : '片假名'}）。` + (confusableOf(e.ch).length ? ' 容易和「' + confusableOf(e.ch).join('、') + '」混淆：' + (D.kana.confusables.find(c => c[0] === e.ch || c[1] === e.ch) || [])[2] : '') });
    }
    if (kind === 'r2k') {
      const ok = pool.filter(x => KANA.filter(y => y.r === x.r).length === 1 || true);
      const cands = wrongs.filter(w => w.type === e.type);
      const ws = cands.length >= 3 ? cands.slice(0, 3) : wrongs;
      const options = JP.shuffle([e.ch].concat(ws.map(w => w.ch)), rng);
      const notes = {}; ws.forEach(w => { notes[w.ch] = `「${w.ch}」念 ${w.r}。`; });
      return Object.assign(base, { type: 'mc', kind, prompt: e.r, big: true, sub: '哪一個假名念這個音？', options, answer: e.ch, optNotes: notes, bigOptions: true,
        explain: `${e.r} 對應的假名是「${e.ch}」。` });
    }
    if (kind === 'h2k') { // 平假名 → 片假名
      const kataE = KANA_BY.get(JP.hiraToKata(e.ch));
      if (!kataE) return null;
      const ws = (conf.concat(near, same)).filter(x => x.type === 'kata' && x.ch !== kataE.ch && x.r !== kataE.r).slice(0, 3);
      const seen = new Set(); const wl = ws.filter(w => !seen.has(w.ch) && seen.add(w.ch));
      if (wl.length < 3) return null;
      return Object.assign(base, { type: 'mc', kind, prompt: e.ch, big: true, sub: '對應的片假名是哪一個？', options: JP.shuffle([kataE.ch].concat(wl.map(w => w.ch)), rng), answer: kataE.ch, bigOptions: true,
        ref: { kana: [e.ch, kataE.ch] }, explain: `平假名「${e.ch}」對應片假名「${kataE.ch}」，都念 ${e.r}。` });
    }
    return null;
  }
  function kanaMatchQ(entries, rng) {
    const uniq = []; entries.forEach(e => { if (!uniq.some(u => u.r === e.r)) uniq.push(e); });
    const es = uniq.slice(0, 5);
    if (es.length < 3) return null;
    return { type: 'match', cat: 'kana', kind: 'match', prompt: '請把假名和羅馬拼音配對', pairs: es.map(e => ({ l: e.ch, r: e.r })), options: JP.shuffle(es.map(e => e.r), rng),
      ref: { kana: es.map(e => e.ch) }, explain: es.map(e => `${e.ch}＝${e.r}`).join('、'), lesson: null };
  }

  /* ---------- 單字題 ---------- */
  function distractors(v, n, rng, pool, filterFn) {
    const cands = (pool || idx.vocab).filter(c => c.id !== v.id && filterFn(c));
    const samePos = JP.shuffle(cands.filter(c => c.pos === v.pos), rng);
    const sameCat = JP.shuffle(cands.filter(c => c.cat === v.cat && c.pos !== v.pos), rng);
    const rest = JP.shuffle(cands, rng);
    const out = [];
    [samePos, sameCat, rest].forEach(list => list.forEach(c => { if (out.length < n && !out.some(o => o.id === c.id)) out.push(c); }));
    return out;
  }
  function vocabQ(v, kind, rng, pool) {
    const ref = { vocab: v.id };
    const exNote = v.ex ? `例句：${v.ex.replace(/\s+/g, '')}` : '';
    const info = `${v.word}（${v.kana}／${v.romaji}）＝${v.zh}`;
    if (kind === 'kana2zh' && homophone(v)) kind = 'jp2zh';
    if (kind === 'listen' && homophone(v)) return null;
    if (kind === 'jp2zh' || kind === 'kana2zh') {
      const ds = distractors(v, 3, rng, pool, c => zhMain(c) !== zhMain(v) && hk(c) !== hk(v));
      const uniq = []; ds.forEach(d => { if (!uniq.some(u => zhMain(u) === zhMain(d))) uniq.push(d); });
      if (uniq.length < 3) return null;
      const options = JP.shuffle([zhMain(v)].concat(uniq.map(zhMain)), rng);
      const notes = {}; uniq.forEach(d => { notes[zhMain(d)] = `「${zhMain(d)}」是 ${d.word}（${d.kana}）的意思。`; });
      const showKana = kind === 'kana2zh';
      return { type: 'mc', cat: 'vocab', kind, prompt: showKana ? v.kana.replace(/^〜/, '') : disp(v), big: true, speak: speakWord(v), sub: showKana ? '看假名，選出正確的意思' : '這個詞是什麼意思？',
        options, answer: zhMain(v), optNotes: notes, ref, lesson: v.lesson, explain: info + (v.note ? '。' + v.note : '') + '。' + exNote, hint: showKana ? v.romaji : null };
    }
    if (kind === 'zh2jp') {
      const ds = distractors(v, 3, rng, pool, c => zhMain(c) !== zhMain(v) && disp(c) !== disp(v) && hk(c) !== hk(v));
      const uniq = []; ds.forEach(d => { if (!uniq.some(u => disp(u) === disp(d))) uniq.push(d); });
      if (uniq.length < 3) return null;
      const options = JP.shuffle([disp(v)].concat(uniq.map(disp)), rng);
      const notes = {}; uniq.forEach(d => { notes[disp(d)] = `${d.word}（${d.kana}）是「${zhMain(d)}」。`; });
      return { type: 'mc', cat: 'vocab', kind, prompt: zhMain(v), big: true, sub: '選出對應的日文', options, answer: disp(v), optNotes: notes, ref, lesson: v.lesson, explain: info + '。' + exNote, bigOptions: true };
    }
    if (kind === 'read') { // 漢字 → 讀音
      if (!JP.hasKanji(v.word)) return null;
      const kanaOf = c => c.kana.replace(/^〜/, '');
      const ds = distractors(v, 12, rng, pool, c => kanaOf(c) !== kanaOf(v) && Math.abs(kanaOf(c).length - kanaOf(v).length) <= 1);
      const seen = new Set([kanaOf(v)]); const uniq = ds.filter(d => !seen.has(kanaOf(d)) && seen.add(kanaOf(d))).slice(0, 3);
      if (uniq.length < 3) return null;
      const options = JP.shuffle([kanaOf(v)].concat(uniq.map(kanaOf)), rng);
      const notes = {}; uniq.forEach(d => { notes[kanaOf(d)] = `「${kanaOf(d)}」是 ${d.word} 的讀音。`; });
      return { type: 'mc', cat: 'vocab', kind, prompt: v.word, big: true, sub: '這個詞怎麼念？', options, answer: kanaOf(v), optNotes: notes, ref, lesson: v.lesson, explain: info + '。', speak: speakWord(v) };
    }
    if (kind === 'listen') { // 聽音辨字
      const ds = distractors(v, 8, rng, pool, c => hk(c) !== hk(v) && !homophone(c));
      const seen = new Set([disp(v)]); const uniq = ds.filter(d => !seen.has(disp(d)) && seen.add(disp(d))).slice(0, 3);
      if (uniq.length < 3) return null;
      const options = JP.shuffle([disp(v)].concat(uniq.map(disp)), rng);
      const notes = {}; uniq.forEach(d => { notes[disp(d)] = `${d.word}念 ${d.kana}（${zhMain(d)}）。`; });
      return { type: 'mc', cat: 'listening', kind, prompt: '🔊 聽發音，選出你聽到的詞', listen: true, speak: speakWord(v), options, answer: disp(v), optNotes: notes, ref, lesson: v.lesson, explain: info + '。', bigOptions: true, hideSpeakText: true };
    }
    return null;
  }

  /* ---------- 文法 / 句子 ---------- */
  function grammarQ(ex, g, rng, idxEx) {
    const ref = { grammar: g.id }, base = { cat: 'grammar', ref, lesson: g.lesson, kind: ex.type || 'grammar' };
    if (ex.type === 'order') {
      const chunks = ex.chunks.filter(c => !/^[。？！]$/.test(c));
      const tail = ex.chunks.filter(c => /^[。？！]$/.test(c));
      return Object.assign(base, { type: 'order', kind: 'order', prompt: ex.zh, sub: '把詞語排成正確的句子', chunks: JP.shuffle(chunks, rng), answer: chunks, tail: tail.join(''), alts: ex.alt || [], explain: ex.explain || '', promptKey: ex.zh + g.id });
    }
    const options = JP.shuffle([ex.answer].concat(ex.wrong), rng);
    const q = Object.assign(base, { type: 'mc', prompt: ex.q, sub: ex.type === 'particle' ? (ex.hint || '選出適合填入空格的詞') : null, options, answer: ex.answer, explain: `${ex.explain}（${g.id} ${g.name}）`, blank: ex.type === 'particle', promptKey: ex.q + g.id, answerKey: ex.answer });
    if (ex.type === 'particle') q.kind = 'particle';
    return q;
  }
  function orderFromSentence(src, zh, lessonId, rng) {
    const toks = JP.tokenize(src);
    const body = toks.filter(t => !t.punct), tail = toks.filter(t => t.punct).map(t => t.surface).join('');
    if (body.length < 3 || body.length > 7) return null;
    if (body.some(t => /[「」]/.test(t.raw))) return null;
    const chunks = body.map(t => t.raw);
    if (new Set(chunks.map(JP.stripRuby)).size !== chunks.length) return null; // 有重複的詞，順序可能有歧義
    let shuffled = JP.shuffle(chunks, rng), tries = 0;
    while (shuffled.join('|') === chunks.join('|') && tries++ < 5) shuffled = JP.shuffle(chunks, rng);
    return { type: 'order', cat: 'grammar', kind: 'order', prompt: zh, sub: '把詞語排成正確的句子', chunks: shuffled, answer: chunks, tail, alts: [], lesson: lessonId, ref: {}, explain: '正確語序：' + JP.sentence(src).text + '（日語語序有彈性，本題以教材的標準語序為準）', promptKey: zh + src };
  }
  function compQ(src, zh, pool, lessonId, rng, ref) {
    const ds = pool.filter(p => p[1] !== zh && JP.stripRuby(p[0]) !== JP.stripRuby(src));
    const seen = new Set([zh]); const w = JP.shuffle(ds, rng).filter(d => !seen.has(d[1]) && seen.add(d[1])).slice(0, 3);
    if (w.length < 3) return null;
    const notes = {}; w.forEach(d => { notes[d[1]] = `「${d[1]}」對應的日文是：${JP.sentence(d[0]).text}`; });
    return { type: 'mc', cat: 'grammar', kind: 'comp', prompt: src, big: false, speak: speakSentence(src), sub: '這句日文的意思是？', options: JP.shuffle([zh].concat(w.map(d => d[1])), rng), answer: zh, optNotes: notes, lesson: lessonId, ref: ref || {}, explain: `${JP.sentence(src).text} ＝ ${zh}`, promptKey: src, answerKey: zh };
  }
  function readingQs(r, rng) {
    return r.questions.map((q, i) => ({ type: 'mc', cat: 'reading', kind: 'reading', passageId: r.id, prompt: q.q, sub: `閱讀：${r.title}`, options: JP.shuffle([q.answer].concat(q.wrong), rng), answer: q.answer, explain: q.explain, lesson: r.unlock, ref: { reading: r.id }, promptKey: r.id + i + q.q, answerKey: q.answer }));
  }
  function listenQ(t, rng) {
    return { type: 'mc', cat: 'listening', kind: 'dialog', listenId: t.id, prompt: '🔊 聽對話，回答問題', sub: t.q, options: JP.shuffle([t.answer].concat(t.wrong), rng), answer: t.answer, explain: t.explain, lesson: t.unlock, ref: { listening: t.id }, promptKey: t.id + t.q, answerKey: t.answer, hideSpeakText: true };
  }

  /* ---------- 題庫範圍 ---------- */
  function lessonsUpTo(lessonId) { const i = idx.lessonOrder.get(lessonId); return idx.lessons.slice(0, i + 1).map(l => l.id); }
  function vocabOf(ids) { const s = new Set(ids); return idx.vocab.filter(v => s.has(v.lesson)); }
  function grammarOf(ids) { const s = new Set(ids); return idx.grammar.filter(g => s.has(g.lesson)); }
  function sentencesOf(ids) {
    const out = [];
    ids.forEach(id => { const l = idx.lById.get(id); if (!l) return; (l.sentences || []).forEach(s => out.push([s[0], s[1], id])); });
    vocabOf(ids).forEach(v => { if (v.ex) out.push([v.ex, v.exZh, v.lesson, v.id]); });
    return out.filter(s => /\s/.test(s[0].trim()) || true);
  }
  const clean = arr => arr.filter(Boolean);

  function vocabSet(vs, n, rng, kinds, pool) {
    const out = [];
    const list = JP.shuffle(vs, rng);
    let ki = 0;
    for (const v of list) {
      if (out.length >= n) break;
      for (let t = 0; t < kinds.length; t++) {
        const q = vocabQ(v, kinds[(ki + t) % kinds.length], rng, pool);
        if (q) { out.push(q); ki += t + 1; break; }
      }
    }
    return out;
  }
  function grammarSet(gs, n, rng, types) {
    const items = [];
    gs.forEach(g => g.exercises.forEach(ex => { const ty = ex.type || 'mc'; if (!types || types.includes(ty)) items.push([ex, g]); }));
    return JP.shuffle(items, rng).slice(0, n).map(([ex, g]) => grammarQ(ex, g, rng));
  }
  function orderSet(sents, n, rng) {
    const out = [];
    JP.shuffle(sents, rng).forEach(s => { if (out.length < n) { const q = orderFromSentence(s[0], s[1], s[2], rng); if (q) { if (s[3]) q.ref = { vocab: s[3] }; out.push(q); } } });
    return out;
  }
  function compSet(sents, n, rng) {
    const out = [];
    JP.shuffle(sents, rng).forEach(s => { if (out.length < n) { const q = compQ(s[0], s[1], sents, s[2], rng, s[3] ? { vocab: s[3] } : {}); if (q) out.push(q); } });
    return out;
  }

  /* ---------- 各種測驗 ---------- */
  function lessonQuiz(lessonId, rng) {
    rng = rng || Math.random;
    const l = idx.lById.get(lessonId);
    const vs = idx.vocabByLesson.get(lessonId) || [];
    let qs = [];
    const isStageTest = lessonId === 'L13' || lessonId === 'L24';
    if (isStageTest) {
      const ids = lessonsUpTo(lessonId).filter(id => (lessonId === 'L13' ? true : idx.lById.get(id).stage === 2));
      const pool = vocabOf(ids);
      if (lessonId === 'L13') {
        const chars = setChars(['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09']); const kp = kanaPool(chars);
        JP.shuffle(kp, rng).slice(0, 8).forEach(e => qs.push(kanaQ(e, 'k2r', rng, kp)));
        JP.shuffle(kp, rng).slice(0, 4).forEach(e => qs.push(kanaQ(e, 'r2k', rng, kp)));
        for (let i = 0; i < 2; i++) qs.push(kanaMatchQ(JP.shuffle(kp, rng).slice(0, 8), rng));
        qs.push(...vocabSet(pool, 8, rng, ['kana2zh', 'jp2zh', 'listen', 'zh2jp'], pool));
      } else {
        qs.push(...vocabSet(pool, 10, rng, ['jp2zh', 'zh2jp', 'kana2zh', 'read', 'listen'], vocabOf(lessonsUpTo(lessonId))));
        qs.push(...grammarSet(grammarOf(ids), 12, rng));
        qs.push(...orderSet(sentencesOf(ids), 3, rng)); qs.push(...compSet(sentencesOf(ids), 3, rng));
      }
    } else if (l.kana) {
      const own = setChars([l.kana]);
      const prevKeys = D.kana ? Object.keys(D.kana.sets).filter(k => k < l.kana) : [];
      const all = setChars(prevKeys.concat([l.kana]));
      const ownPool = kanaPool(own), allPool = kanaPool(all);
      JP.shuffle(ownPool, rng).slice(0, 8).forEach(e => qs.push(kanaQ(e, 'k2r', rng, allPool)));
      JP.shuffle(ownPool, rng).slice(0, 4).forEach(e => qs.push(kanaQ(e, 'r2k', rng, allPool)));
      if (l.kana === 'L05' || l.kana === 'L06' || parseInt(l.kana.slice(1)) >= 7) qs.push(kanaMatchQ(JP.shuffle(ownPool, rng).slice(0, 5), rng));
      else qs.push(kanaMatchQ(JP.shuffle(ownPool, rng).slice(0, 5), rng));
      if (parseInt(l.kana.slice(1)) >= 7) JP.shuffle(kanaPool(setChars(['L01', 'L02', 'L03', 'L04']).filter(c => KANA_BY.has(JP.hiraToKata(c)))), rng).slice(0, 2).forEach(e => qs.push(kanaQ(e, 'h2k', rng, allPool)));
      qs.push(...vocabSet(vs, 5, rng, ['kana2zh', 'listen', 'jp2zh'], vs.concat(idx.vocab.filter(v => v.cat === 'kana'))));
    } else {
      const upTo = vocabOf(lessonsUpTo(lessonId));
      qs.push(...vocabSet(vs, Math.min(6, vs.length), rng, ['jp2zh', 'zh2jp', 'kana2zh', 'read', 'listen'], upTo));
      const gs = (l.grammar || []).map(id => idx.gById.get(id)).filter(Boolean);
      if (gs.length) qs.push(...grammarSet(gs, 9, rng));
      const sents = sentencesOf([lessonId]);
      qs.push(...orderSet((l.sentences || []).map(s => [s[0], s[1], lessonId]), 2, rng));
      qs.push(...compSet(sents, 2, rng));
      if (qs.length < 10) qs.push(...vocabSet(upTo.filter(v => !vs.includes(v)), 10 - qs.length, rng, ['jp2zh', 'zh2jp', 'kana2zh'], upTo));
    }
    qs = clean(qs); qs.forEach(q => { if (!q.lesson) q.lesson = lessonId; });
    return qs;
  }

  function mixed(ids, n, rng, opts) {
    opts = opts || {};
    const vs = opts.vocab || vocabOf(ids), gs = grammarOf(ids), sents = sentencesOf(ids);
    const nv = Math.round(n * 0.4), ng = Math.round(n * 0.3);
    let qs = [];
    qs.push(...vocabSet(vs, nv, rng, ['jp2zh', 'zh2jp', 'kana2zh', 'read', 'listen'], vocabOf(ids)));
    if (gs.length) qs.push(...grammarSet(gs, ng, rng));
    qs.push(...compSet(sents, Math.max(1, Math.round(n * 0.15)), rng));
    qs.push(...orderSet(sents, Math.max(1, Math.round(n * 0.1)), rng));
    if (opts.kana) { const kp = kanaPool(opts.kana); JP.shuffle(kp, rng).slice(0, opts.kanaN || 2).forEach(e => qs.push(kanaQ(e, 'k2r', rng, kp))); }
    const lt = (D.listening || []).filter(t => ids.includes(t.unlock));
    if (lt.length) qs.push(listenQ(pick(lt, rng), rng));
    qs = clean(qs);
    // 不足 n 題時補單字題
    let guard = 0;
    while (qs.length < n && guard++ < 30) { const v = pick(vs, rng); const q = vocabQ(v, pick(['jp2zh', 'zh2jp', 'kana2zh'], rng), rng, vocabOf(ids)); if (q && !qs.some(x => x.prompt === q.prompt && x.kind === q.kind)) qs.push(q); }
    return JP.shuffle(qs, rng).slice(0, n);
  }

  function daily(dateKey, ids, extra) {
    const rng = JP.seeded(JP.hashStr('daily' + dateKey));
    extra = extra || {};
    const n = 10;
    const opts = {};
    if (extra.weakVocab && extra.weakVocab.length) opts.vocab = extra.weakVocab.concat(vocabOf(ids.slice(-6)));
    if (ids.length <= 12) { opts.kana = setChars(Object.keys(D.kana.sets)); opts.kanaN = 2; }
    return mixed(ids, n, rng, opts);
  }
  function weekly(dateKey, ids) { return mixed(ids, 15, JP.seeded(JP.hashStr('weekly' + dateKey))); }
  function monthly(dateKey, ids) { return mixed(ids, 30, JP.seeded(JP.hashStr('monthly' + dateKey)), { kana: setChars(Object.keys(D.kana.sets)), kanaN: 3 }); }

  /* 測驗中心的 12 種類型 */
  const TYPES = {
    kana_recog: { name: '五十音辨識', desc: '看假名，選出羅馬拼音（也有羅馬拼音選假名、平假名選片假名）' },
    kana_match: { name: '假名與羅馬拼音配對', desc: '把 5 個假名和羅馬拼音一一配對' },
    vocab_mc: { name: '單字選擇題', desc: '看假名，選出正確意思' },
    jp2zh: { name: '日翻中', desc: '看日文單字，選出中文意思' },
    zh2jp: { name: '中翻日', desc: '看中文，選出正確的日文' },
    grammar: { name: '文法選擇題', desc: '各文法項目的選擇題，附解析' },
    order: { name: '句子排序', desc: '把打散的詞語排成通順的句子' },
    particle: { name: '助詞填空', desc: '在空格選出正確的助詞' },
    listen: { name: '聽音辨字', desc: '聽發音，選出聽到的單字（需要日文語音）' },
    comp: { name: '句子理解', desc: '看日文句子，選出正確的中文意思' },
    reading: { name: '短篇閱讀理解', desc: '讀短文回答問題（12 篇）' },
    mock: { name: '綜合模擬考', desc: '依 N5 題型分四部分的自我檢測（約 45 分鐘）' }
  };
  function byType(type, ids, n, rng, extra) {
    rng = rng || Math.random; n = n || 10; extra = extra || {};
    const vs = vocabOf(ids), gs = grammarOf(ids), sents = sentencesOf(ids);
    const allKana = setChars(Object.keys(D.kana.sets));
    switch (type) {
      case 'kana_recog': {
        const chars = extra.kanaSets && extra.kanaSets.length ? setChars(extra.kanaSets) : allKana; const kp = kanaPool(chars); const out = [];
        JP.shuffle(kp, rng).forEach((e, i) => { if (out.length < n) { const q = kanaQ(e, i % 4 === 3 ? 'r2k' : (i % 7 === 5 ? 'h2k' : 'k2r'), rng, kp) || kanaQ(e, 'k2r', rng, kp); if (q) out.push(q); } });
        return out;
      }
      case 'kana_match': { const kp = kanaPool(extra.kanaSets && extra.kanaSets.length ? setChars(extra.kanaSets) : allKana); const out = []; const cnt = Math.max(2, Math.round(n / 3)); for (let i = 0; i < cnt; i++) out.push(kanaMatchQ(JP.shuffle(kp, rng).slice(0, 8), rng)); return clean(out); }
      case 'vocab_mc': return vocabSet(vs, n, rng, ['kana2zh'], vs);
      case 'jp2zh': return vocabSet(vs, n, rng, ['jp2zh'], vs);
      case 'zh2jp': return vocabSet(vs, n, rng, ['zh2jp'], vs);
      case 'listen': return vocabSet(vs.filter(v => !homophone(v)), n, rng, ['listen'], vs);
      case 'grammar': return grammarSet(gs, n, rng, ['mc', undefined]);
      case 'particle': return grammarSet(gs, n, rng, ['particle']);
      case 'order': { const items = []; gs.forEach(g => g.exercises.forEach(ex => { if (ex.type === 'order') items.push(grammarQ(ex, g, rng)); })); return JP.shuffle(items, rng).concat(orderSet(sents, n, rng)).slice(0, n); }
      case 'comp': return compSet(sents, n, rng);
      case 'reading': {
        const rs = (D.readings || []).filter(r => ids.includes(r.unlock)); const out = [];
        JP.shuffle(rs, rng).forEach(r => { if (out.length < n) readingQs(r, rng).forEach(q => out.push(q)); }); return out;
      }
    }
    return [];
  }

  /* ---------- 模擬考 ---------- */
  function mock(m, excludeIds) {
    const rng = JP.seeded(m.seed);
    const ids = lessonsUpTo('L49');
    const ex0 = new Set(excludeIds || []);
    const vs = vocabOf(ids).filter(v => !ex0.has(v.id));
    const used = new Set();
    const take = (kind, n, pred) => {
      const out = []; const list = JP.shuffle(vs, rng);
      for (const v of list) { if (out.length >= n) break; if (used.has(v.id) || (pred && !pred(v))) continue; const q = vocabQ(v, kind, rng, vocabOf(ids)); if (q) { out.push(q); used.add(v.id); } }
      return out;
    };
    const secA = [].concat(take('read', 6, v => JP.hasKanji(v.word)), take('jp2zh', 5), take('zh2jp', 5), take('kana2zh', 4));
    const gs = grammarOf(ids), pool = [];
    gs.forEach(g => g.exercises.forEach(ex => pool.push([ex, g])));
    const sh = JP.shuffle(pool, rng);
    const pick2 = (ty, n) => sh.filter(([ex]) => (ex.type || 'mc') === ty).slice(((m.grammarOffset || {})[ty]) || 0, (((m.grammarOffset || {})[ty]) || 0) + n).map(([ex, g]) => grammarQ(ex, g, rng));
    const secB = [].concat(pick2('mc', 7), pick2('particle', 6), pick2('order', 2));
    const sents = sentencesOf(ids);
    const secC = [].concat(...m.readings.map(rid => readingQs(D.readings.find(r => r.id === rid), rng)), compSet(sents, 3, rng));
    const secD = [].concat(m.listening.map(tid => listenQ(D.listening.find(t => t.id === tid), rng)), take('listen', 4, v => !homophone(v)));
    const sections = [
      { key: 'A', name: '文字・語彙', group: 'lang', items: clean(secA), minutes: 12 },
      { key: 'B', name: '文法', group: 'lang', items: clean(secB), minutes: 10 },
      { key: 'C', name: '讀解', group: 'lang', items: clean(secC), minutes: 13 },
      { key: 'D', name: '聽解', group: 'listen', items: clean(secD), minutes: 12 }
    ];
    sections.forEach(s => s.items.forEach(q => { q.section = s.key; }));
    const usedVocab = []; sections.forEach(s => s.items.forEach(q => { if (q.ref && q.ref.vocab) usedVocab.push(q.ref.vocab); }));
    return { id: m.id, title: m.title, sections, usedVocab };
  }

  /* ---------- 答案判定 ---------- */
  const normChunks = arr => arr.map(JP.stripRuby).join('');
  function check(q, resp) {
    if (q.type === 'mc') return resp === q.answer;
    if (q.type === 'order') {
      if (!Array.isArray(resp)) return false;
      const got = normChunks(resp);
      return [q.answer].concat(q.alts || []).some(a => normChunks(a) === got);
    }
    if (q.type === 'match') return q.pairs.every(p => resp && resp[p.l] === p.r);
    return false;
  }

  function fromSnapshot(snap) { return JSON.parse(JSON.stringify(snap)); }

  const QG = { init, lessonQuiz, daily, weekly, monthly, byType, mock, check, TYPES, vocabQ, kanaQ, grammarQ, readingQs, listenQ, compQ, orderFromSentence, setChars, kanaPool, vocabOf, grammarOf, sentencesOf, lessonsUpTo, speakWord, speakSentence, zhMain, disp, homophone, fromSnapshot, mixed, KANA: () => KANA };
  root.QuizGen = QG;
  if (typeof module !== 'undefined') module.exports = QG;
})(typeof window !== 'undefined' ? window : globalThis);
