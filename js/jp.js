/* jp.js — 日文處理核心：振假名解析、假名轉換、羅馬拼音、句子斷詞、動詞/形容詞變化
 * 所有教材資料都以同一種「標記語法」撰寫，這個檔案負責把它轉成：
 *   顯示用 HTML（含 <ruby> 振假名）、純假名讀音、羅馬拼音、逐詞拆解。
 * 標記語法：
 *   漢字[かな]   → 漢字加上振假名（中括號內是前面連續漢字/數字的讀音）
 *   以半形空白分隔詞語；詞語後可加 {中文說明} 作為逐詞拆解的解釋
 *   例："私[わたし] は 学生[がくせい] です 。"
 * 這個檔案在瀏覽器與 Node（驗證腳本）都能執行。
 */
(function (root) {
  'use strict';

  const KANJI_RUN = '[\\u3400-\\u9fff\\uf900-\\ufaff々〆ヶ0-9０-９]+';
  const RUBY_RE = new RegExp('(' + KANJI_RUN + ')\\[([^\\]]+)\\]', 'g');
  const PUNCT = /^[。、？！「」『』（）・…,.?!~〜：:]+$/;
  const PUNCT_SPLIT = /([。、？！「」『』（）…?!：])/;

  /* ---------- 假名工具 ---------- */
  function kataToHira(s) {
    return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  function hiraToKata(s) {
    return s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }
  function isKana(s) { return /^[ぁ-ゖァ-ヺー・\s]+$/.test(s); }
  function hasKanji(s) { return /[㐀-鿿々]/.test(s); }

  /* ---------- 羅馬拼音（修正式平文式，長音直接寫出母音：おう→ou、ー→重複母音） ---------- */
  const DIGRAPHS = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho', 'しぇ': 'she',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'ちぇ': 'che', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'じぇ': 'je', 'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo', 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo', 'てぃ': 'ti', 'でぃ': 'di', 'でゅ': 'dyu',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'とぅ': 'tu', 'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo'
  };
  const MONO = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o', 'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so', 'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no', 'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo', 'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro', 'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go', 'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do', 'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po', 'ゔ': 'vu',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa'
  };
  // 詞語層級的特例：助詞「は」「へ」「を」與固定問候語
  const WORD_ROMAJI = {
    'は': 'wa', 'へ': 'e', 'を': 'o', 'には': 'niwa', 'では': 'dewa', 'とは': 'towa', 'へは': 'ewa',
    'からは': 'karawa', 'までは': 'madewa', 'にも': 'nimo', 'でも': 'demo',
    'こんにちは': 'konnichiwa', 'こんばんは': 'konbanwa', 'では、': 'dewa,',
    'ではありません': 'dewa arimasen', 'ではありませんでした': 'dewa arimasen deshita',
    'じゃありません': 'ja arimasen', 'じゃありませんでした': 'ja arimasen deshita',
    'ではない': 'dewa nai', 'じゃない': 'ja nai'
  };

  function kanaToRomaji(input) {
    const s = kataToHira(input);
    if (WORD_ROMAJI[s] !== undefined) return WORD_ROMAJI[s];
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i], two = s.substr(i, 2);
      if (c === 'っ') {
        // 促音：重複下一個子音
        let next = DIGRAPHS[s.substr(i + 1, 2)] || MONO[s[i + 1]] || '';
        if (next.startsWith('ch')) out += 't';
        else if (next) out += next[0];
        else out += "'";
        i++; continue;
      }
      if (c === 'ー') { // 長音記號：重複前一個母音
        const m = out.match(/[aeiou](?=[^aeiou]*$)/);
        out += m ? m[0] : '-';
        i++; continue;
      }
      if (c === 'ん') {
        const nxt = s[i + 1];
        const nr = nxt ? (MONO[nxt] || '') : '';
        out += (nr && /^[aeiouy]/.test(nr)) ? "n'" : 'n';
        i++; continue;
      }
      if (DIGRAPHS[two]) { out += DIGRAPHS[two]; i += 2; continue; }
      if (MONO[c] !== undefined) { out += MONO[c]; i++; continue; }
      out += c; i++;
    }
    return out;
  }

  /* ---------- 振假名解析 ---------- */
  function stripRuby(s) { return s.replace(RUBY_RE, '$1'); }
  function rubyToKana(s) { return s.replace(RUBY_RE, '$2'); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function rubyToHtml(s) {
    let html = '', last = 0;
    s.replace(RUBY_RE, (m, base, rt, off) => {
      html += esc(s.slice(last, off)) + '<ruby>' + esc(base) + '<rt>' + esc(rt) + '</rt></ruby>';
      last = off + m.length;
    });
    return html + esc(s.slice(last));
  }

  /* 依讀音自動對齊單字的振假名（回溯式比對）：飲み物 / のみもの → 飲[の]み物[もの]
   * 漢字連續段至少對應 1 個假名；假名必須逐字相符。找不到唯一可行解時回傳 null，請在資料中手動標注。 */
  function autoRuby(word, kana) {
    if (/\[/.test(word)) return word;
    let pre = '';
    if (word[0] === '〜') { pre = '〜'; word = word.slice(1); }
    if (!hasKanji(word)) return pre + word;
    const hk = kataToHira(kana.replace(/^〜/, ''));
    const segs = word.match(new RegExp(KANJI_RUN + '|[^\\u3400-\\u9fff々〆ヶ0-9０-９]+', 'g')) || [];
    const isK = x => hasKanji(x) || /^[0-9０-９]+$/.test(x);
    const sols = [];
    (function go(si, ki, acc) {
      if (sols.length > 1) return;
      if (si === segs.length) { if (ki === hk.length) sols.push(acc.slice()); return; }
      const seg = segs[si];
      if (!isK(seg)) {
        const h = kataToHira(seg);
        if (hk.substr(ki, h.length) === h) { acc.push(seg); go(si + 1, ki + h.length, acc); acc.pop(); }
        return;
      }
      for (let len = 1; ki + len <= hk.length; len++) {
        acc.push(seg + '[' + hk.substr(ki, len) + ']'); go(si + 1, ki + len, acc); acc.pop();
      }
    })(0, 0, []);
    return sols.length === 1 ? pre + sols[0].join('') : (sols.length ? pre + sols[0].join('') : null);
  }

  /* ---------- 句子斷詞 ---------- */
  // 回傳 [{raw, surface, kana, romaji, gloss, punct}]
  function tokenize(src) {
    const parts = [];
    src.trim().split(/\s+/).forEach(chunk => {
      // 取出 {說明}
      let gloss = null;
      const gm = chunk.match(/^(.*?)\{([^}]*)\}(.*)$/);
      if (gm) { chunk = gm[1] + gm[3]; gloss = gm[2]; }
      chunk.split(PUNCT_SPLIT).filter(Boolean).forEach((p, idx, arr) => {
        if (PUNCT.test(p)) parts.push({ raw: p, surface: p, kana: p, romaji: romajiPunct(p), punct: true });
        else parts.push({ raw: p, surface: stripRuby(p), kana: rubyToKana(p), gloss: gloss, punct: false });
      });
    });
    parts.forEach(t => { if (!t.punct) t.romaji = kanaToRomaji(t.kana); });
    return parts;
  }
  function romajiPunct(p) {
    return p.replace(/。/g, '.').replace(/、/g, ',').replace(/？/g, '?').replace(/！/g, '!')
      .replace(/[「」『』]/g, '"').replace(/[（）]/g, '').replace(/…/g, '...').replace(/：/g, ':');
  }

  function sentence(src) {
    const tokens = tokenize(src);
    const text = tokens.map(t => t.surface).join('');
    const kana = tokens.map(t => t.kana).join('');
    let romaji = '';
    tokens.forEach((t, i) => {
      if (t.punct) romaji += t.romaji;
      else romaji += (romaji && !/["(]$/.test(romaji) ? ' ' : '') + t.romaji;
    });
    romaji = romaji.replace(/\s+([.,?!])/g, '$1').trim();
    if (romaji) romaji = romaji[0].toUpperCase() + romaji.slice(1);
    const html = tokens.map(t => t.punct ? esc(t.surface) : rubyToHtml(t.raw)).join('');
    return { src, tokens, text, kana, romaji, html };
  }

  /* ---------- 動詞變化 ----------
   * type: '1' 五段(第一類)、'2' 一段(第二類)、'3' 不規則(第三類：する、来る、〜する)
   * 同時變化「漢字寫法」與「讀音」，避免 来る→来ない(こない) 這類讀音錯誤。
   */
  const G1 = { // 語尾 → [い段, あ段(否定), て形, た形]
    'う': ['い', 'わ', 'って', 'った'], 'く': ['き', 'か', 'いて', 'いた'], 'ぐ': ['ぎ', 'が', 'いで', 'いだ'],
    'す': ['し', 'さ', 'して', 'した'], 'つ': ['ち', 'た', 'って', 'った'], 'ぬ': ['に', 'な', 'んで', 'んだ'],
    'ぶ': ['び', 'ば', 'んで', 'んだ'], 'む': ['み', 'ま', 'んで', 'んだ'], 'る': ['り', 'ら', 'って', 'った']
  };
  const E_DAN = { 'う': 'え', 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て', 'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ' };
  const O_DAN = { 'う': 'お', 'く': 'こ', 'ぐ': 'ご', 'す': 'そ', 'つ': 'と', 'ぬ': 'の', 'ぶ': 'ぼ', 'む': 'も', 'る': 'ろ' };

  function verbStems(word, kana, type) {
    // 回傳各形態的 [寫法, 讀音]
    const f = {};
    const set = (k, w, r) => { f[k] = [w, r]; };
    if (type === '3') {
      if (/来る$/.test(word) || kana === 'くる') {
        const pw = word.replace(/来る$/, '来'), pk = kana.replace(/くる$/, '');
        set('dict', pw + 'る', pk + 'くる');
        set('masuStem', pw, pk + 'き'); set('nai', pw + 'ない', pk + 'こない'); set('naiStem', pw, pk + 'こ');
        set('te', pw + 'て', pk + 'きて'); set('ta', pw + 'た', pk + 'きた');
        set('vol', pw + 'よう', pk + 'こよう'); set('pot', pw + 'られる', pk + 'こられる');
        return f;
      }
      const pw = word.replace(/する$/, ''), pk = kana.replace(/する$/, '');
      set('dict', pw + 'する', pk + 'する'); set('masuStem', pw + 'し', pk + 'し'); set('nai', pw + 'しない', pk + 'しない');
      set('naiStem', pw + 'し', pk + 'し'); set('te', pw + 'して', pk + 'して'); set('ta', pw + 'した', pk + 'した');
      set('vol', pw + 'しよう', pk + 'しよう'); set('pot', pw + 'できる', pk + 'できる');
      return f;
    }
    if (type === '2') {
      const sw = word.slice(0, -1), sk = kana.slice(0, -1);
      set('dict', word, kana); set('masuStem', sw, sk); set('nai', sw + 'ない', sk + 'ない'); set('naiStem', sw, sk);
      set('te', sw + 'て', sk + 'て'); set('ta', sw + 'た', sk + 'た'); set('vol', sw + 'よう', sk + 'よう');
      set('pot', sw + 'られる', sk + 'られる');
      return f;
    }
    const end = kana.slice(-1), g = G1[end];
    if (!g) throw new Error('無法變化的動詞：' + word);
    const sw = word.slice(0, -1), sk = kana.slice(0, -1);
    let te = g[2], ta = g[3];
    if (kana === 'いく' || /行く$/.test(word)) { te = 'って'; ta = 'った'; } // 行く 例外
    set('dict', word, kana);
    set('masuStem', sw + g[0], sk + g[0]);
    const neg = (kana === 'ある') ? ['', 'ない'] : [sw + g[1] + 'ない', sk + g[1] + 'ない'];
    if (kana === 'ある') set('nai', 'ない', 'ない'); else set('nai', neg[0], neg[1]);
    set('naiStem', sw + g[1], sk + g[1]);
    set('te', sw + te, sk + te); set('ta', sw + ta, sk + ta);
    set('vol', sw + O_DAN[end] + 'う', sk + O_DAN[end] + 'う');
    set('pot', sw + E_DAN[end] + 'る', sk + E_DAN[end] + 'る');
    return f;
  }

  const VERB_FORMS = {
    dict: '辭書形', masu: 'ます形', masen: 'ません（否定）', mashita: 'ました（過去）',
    masendeshita: 'ませんでした（過去否定）', mashou: 'ましょう（邀約）', masenka: 'ませんか（邀請）',
    te: 'て形', ta: 'た形（過去）', nai: 'ない形（否定）', nakatta: 'なかった（過去否定）', tai: 'たい（想要）'
  };
  function conjugateVerb(word, kana, type) {
    const s = verbStems(word, kana, type);
    const [mw, mk] = s.masuStem;
    const out = {
      dict: s.dict, te: s.te, ta: s.ta, nai: s.nai,
      masu: [mw + 'ます', mk + 'ます'], masen: [mw + 'ません', mk + 'ません'],
      mashita: [mw + 'ました', mk + 'ました'], masendeshita: [mw + 'ませんでした', mk + 'ませんでした'],
      mashou: [mw + 'ましょう', mk + 'ましょう'], masenka: [mw + 'ませんか', mk + 'ませんか'],
      tai: [mw + 'たい', mk + 'たい'],
      nakatta: [s.nai[0].replace(/ない$/, 'なかった'), s.nai[1].replace(/ない$/, 'なかった')]
    };
    return out;
  }

  /* ---------- 形容詞變化 ---------- */
  const ADJ_FORMS = {
    plain: '原形', desu: '〜です', neg: '否定', past: '過去', pastNeg: '過去否定', te: 'て形（連接）', adv: '副詞形', naru: '〜なる'
  };
  function conjugateAdj(word, kana, type) {
    if (type === 'i') {
      let w = word.slice(0, -1), k = kana.slice(0, -1);
      if (kana === 'いい') { w = 'よ'; k = 'よ'; } // いい → よくない
      else if (/いい$/.test(kana) && /良い$|いい$/.test(word) && kana.length > 2) { // かっこいい
        w = word.slice(0, -2) + 'よ'; k = kana.slice(0, -2) + 'よ';
      }
      return {
        plain: [word, kana], desu: [word + 'です', kana + 'です'],
        neg: [w + 'くないです', k + 'くないです'], past: [w + 'かったです', k + 'かったです'],
        pastNeg: [w + 'くなかったです', k + 'くなかったです'], te: [w + 'くて', k + 'くて'],
        adv: [w + 'く', k + 'く'], naru: [w + 'くなります', k + 'くなります']
      };
    }
    return {
      plain: [word, kana], desu: [word + 'です', kana + 'です'],
      neg: [word + 'ではありません', kana + 'ではありません'], past: [word + 'でした', kana + 'でした'],
      pastNeg: [word + 'ではありませんでした', kana + 'ではありませんでした'], te: [word + 'で', kana + 'で'],
      adv: [word + 'に', kana + 'に'], naru: [word + 'になります', kana + 'になります'], attr: [word + 'な', kana + 'な']
    };
  }

  /* ---------- 共用：洗牌（Fisher–Yates）與隨機 ---------- */
  function shuffle(arr, rng) {
    const a = arr.slice(), r = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function seeded(seed) { // mulberry32：可重現的亂數（每日測驗同一天題目一致）
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  const JP = {
    kataToHira, hiraToKata, isKana, hasKanji, kanaToRomaji, stripRuby, rubyToKana, rubyToHtml, autoRuby,
    tokenize, sentence, conjugateVerb, conjugateAdj, verbStems, VERB_FORMS, ADJ_FORMS, shuffle, seeded, hashStr, esc,
    WORD_ROMAJI
  };
  root.JP = JP;
  if (typeof module !== 'undefined') module.exports = JP;
})(typeof window !== 'undefined' ? window : globalThis);
