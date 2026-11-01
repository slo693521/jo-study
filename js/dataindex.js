/* dataindex.js — 把教材原始資料整理成可查詢的索引（瀏覽器與驗證腳本共用）
 * - 解析單字字串 → 物件（自動產生羅馬拼音、振假名、動詞/形容詞變化）
 * - 建立詞彙表（lexicon），供例句逐詞拆解查詢
 */
(function (root) {
  'use strict';
  const JP = root.JP || (typeof require !== 'undefined' ? require('./jp.js') : null);
  const CT = root.Counters || (typeof require !== 'undefined' ? require('./counters.js') : null);

  function vocabId(word, kana) { return word + '｜' + kana; }

  function parseVocab(lines) {
    const list = [];
    lines.forEach((line, i) => {
      if (!line.trim() || line.startsWith('#')) return;
      const f = line.split('|');
      const [wordRaw, kana, pos, zh, cat, lesson, ex, exZh, note] = f;
      const word = JP.stripRuby(wordRaw);
      const ruby = /\[/.test(wordRaw) ? wordRaw : (JP.autoRuby(word, kana) || null);
      const v = {
        id: vocabId(word, kana), word, kana, ruby, pos, zh, cat, lesson,
        romaji: JP.kanaToRomaji(kana), ex: ex || '', exZh: exZh || '', note: note || '', line: i + 1, fields: f.length
      };
      if (pos === '動1' || pos === '動2' || pos === '動3') {
        try { v.forms = JP.conjugateVerb(word, kana, pos.slice(1)); } catch (e) { v.formsError = e.message; }
      } else if (pos === 'い形' || pos === 'な形') {
        v.forms = JP.conjugateAdj(word, kana, pos === 'い形' ? 'i' : 'na');
      }
      list.push(v);
    });
    return list;
  }

  /* 詞彙表：surface → [{gloss, kana, ref}] */
  function buildLexicon(vocab, func) {
    const lex = new Map();
    const add = (surface, kana, gloss, ref, form) => {
      if (!surface) return;
      if (!lex.has(surface)) lex.set(surface, []);
      lex.get(surface).push({ kana, gloss, ref, form });
    };
    vocab.forEach(v => {
      const main = v.zh.split('；')[0];
      if (v.pos === '接尾') { add(v.word.replace(/^〜/, ''), v.kana, v.zh, v.id); return; }
      add(v.word, v.kana, v.zh, v.id);
      if (v.word !== v.kana) add(v.kana, v.kana, v.zh, v.id);
      // お茶 → 茶 等：讓「お」可省略的情況也能查到
      if (v.forms) {
        Object.entries(v.forms).forEach(([k, [w, r]]) => {
          if (w === v.word) return;
          const fname = (JP.VERB_FORMS[k] || JP.ADJ_FORMS[k] || k);
          add(w, r, main + '（' + fname + '）', v.id, k);
          if (w !== r) add(r, r, main + '（' + fname + '）', v.id, k);
          // い形容詞/な形容詞去掉「です」的形態（〜くない、〜かった）
          if (/です$/.test(w)) add(w.replace(/です$/, ''), r.replace(/です$/, ''), main + '（' + fname.replace('〜です', '原形') + '）', v.id, k);
          // て形＋いる 的各種形態（〜ています 由兩個詞組成，這裡不處理）
        });
        if (v.pos === 'な形') add(v.word + 'な', v.kana + 'な', main + '（修飾名詞）', v.id, 'attr');
        if (v.pos === 'い形') {
          const f = v.forms;
          [['past', 'かったです', 'かった', '（過去）'], ['neg', 'くないです', 'くない', '（否定）'], ['pastNeg', 'くなかったです', 'くなかった', '（過去否定）']].forEach(([k, longS, shortS, g]) => {
            const [w, r] = f[k]; const w2 = w.replace(longS, shortS), r2 = r.replace(longS, shortS); add(w2, r2, main + g, v.id, k); if (w2 !== r2) add(r2, r2, main + g, v.id, k);
          });
        }
      }
    });
    // お／ご ＋ 名詞（お茶、ご飯、お名前…）
    vocab.forEach(v => {
      if (!(v.pos === '名' || v.pos === 'な形') || /^[おご]/.test(v.kana) && v.word[0] === v.kana[0]) return;
      if (!JP.hasKanji(v.word) && !/^[ぁ-ん]/.test(v.word)) return;
      add('お' + v.word, 'お' + v.kana, v.zh.split('；')[0] + '（禮貌說法）', v.id, 'honor');
      add('ご' + v.word, 'ご' + v.kana, v.zh.split('；')[0] + '（禮貌說法）', v.id, 'honor');
    });
    // する名詞：散歩します、掃除しない…
    const SURU = [['する','する'],['します','します'],['しません','しません'],['しました','しました'],['しませんでした','しませんでした'],['しない','しない'],['しないで','しないで'],
      ['して','して'],['した','した'],['しましょう','しましょう'],['しませんか','しませんか'],['したい','したい'],['し','し']];
    vocab.filter(v => v.pos === '名' && (root.JP_DATA.suruNouns || []).includes(v.word)).forEach(v =>
      SURU.forEach(([a, b]) => add(v.word + a, v.kana + b, v.zh.split('；')[0] + '＋する', v.id, 'suru')));
    // 動詞：〜ないで、〜なくて、〜ながら
    vocab.filter(v => v.forms && v.forms.nai && /^動/.test(v.pos)).forEach(v => {
      const st = JP.verbStems(v.word, v.kana, v.pos.slice(1)), main = v.zh.split('；')[0];
      add(st.naiStem[0] + 'ないで', st.naiStem[1] + 'ないで', main + '（不要～）', v.id, 'naide');
      add(st.naiStem[0] + 'なくて', st.naiStem[1] + 'なくて', main + '（否定連接）', v.id, 'nakute');
      add(st.masuStem[0] + 'ながら', st.masuStem[1] + 'ながら', main + '（一邊～）', v.id, 'nagara');
      add(st.masuStem[0] + 'に', st.masuStem[1] + 'に', main + '（目的：為了～）', v.id, 'purpose');
      [['たい', '想'], ['たくない', '不想'], ['たかった', '過去想'], ['たくなかった', '過去不想'], ['たくて', '想（連接）']].forEach(([s, g]) =>
        add(st.masuStem[0] + s, st.masuStem[1] + s, g + main, v.id, 'tai'));
    });
    // 時刻＋半（七時半）
    if (CT) for (let h = 1; h <= 24; h++) CT.counterReadings(h, '時').forEach(k => add(CT.toKanji(h) + '時半', k + 'はん', h + '點半', null, 'counter'));
    // 何（なに／なん）
    add('何', 'なん', '什麼', null, 'func');
    // 國名＋人（日本人、台湾人、アメリカ人…）
    vocab.filter(v => v.cat === 'place' && /^(日本|台湾|中国|アメリカ|外国|韓国)$/.test(v.word)).forEach(v =>
      add(v.word + '人', v.kana + 'じん', v.zh.split('；')[0] + '人', v.id, 'country'));
    // 數字＋助數詞（讀音規則見 counters.js）
    if (CT) CT.generate(99).forEach(e => {
      const gl = e.counter ? (e.n == null ? '幾' : e.n) + (e.zh || '') + '（' + e.counter + '）' : String(e.n);
      e.kana.forEach(k => add(e.surface, k, gl, null, 'counter'));
    });
    Object.entries(func || {}).forEach(([k, g]) => add(k, k, g, null, 'func'));
    return lex;
  }

  /* 查詢詞語解釋：優先使用句中 {說明}，其次以「寫法＋讀音」比對單字庫 */
  function glossToken(tok, lex) {
    if (tok.gloss) return { gloss: tok.gloss, ref: null, source: 'inline' };
    const cands = lex.get(tok.surface) || [];
    if (!cands.length) return null;
    const hk = JP.kataToHira(tok.kana);
    const exact = cands.filter(c => JP.kataToHira(c.kana) === hk);
    const pick = exact[0] || null;
    if (!pick) return { gloss: cands[0].gloss, ref: cands[0].ref, source: 'lex', readingMismatch: true, expected: cands.map(c => c.kana) };
    return { gloss: pick.gloss, ref: pick.ref, source: pick.form === 'func' ? 'func' : 'lex' };
  }

  function buildIndex(D) {
    const vocab = parseVocab(D.vocabSrc || []);
    const byId = new Map(vocab.map(v => [v.id, v]));
    const lex = buildLexicon(vocab, D.func);
    const grammar = D.grammar || [];
    const gById = new Map(grammar.map(g => [g.id, g]));
    const lessons = D.lessons || [];
    const lById = new Map(lessons.map(l => [l.id, l]));
    const vocabByLesson = new Map();
    vocab.forEach(v => { if (!vocabByLesson.has(v.lesson)) vocabByLesson.set(v.lesson, []); vocabByLesson.get(v.lesson).push(v); });
    const lessonOrder = new Map(lessons.map((l, i) => [l.id, i]));
    return { vocab, byId, lex, grammar, gById, lessons, lById, vocabByLesson, lessonOrder,
      gloss: tok => glossToken(tok, lex) };
  }

  const DI = { parseVocab, buildLexicon, glossToken, buildIndex, vocabId };
  root.DataIndex = DI;
  if (typeof module !== 'undefined') module.exports = DI;
})(typeof window !== 'undefined' ? window : globalThis);
