/* counters.js — 數字與助數詞讀音產生器（含連音變化）
 * 用途：1) 讓「三枚」「五百円」這類組合詞能被逐詞拆解並驗證讀音；
 *      2) 驗證教材中的數字＋量詞讀音是否正確（錯誤的讀音會被 validate.js 抓出）。
 */
(function (root) {
  'use strict';
  const KD = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const BASE = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう', 'じゅう'];

  function toKanji(n) {
    if (n === 0) return '零';
    let s = '';
    const man = Math.floor(n / 10000), r = n % 10000;
    const part = x => {
      let t = '';
      const th = Math.floor(x / 1000), h = Math.floor(x / 100) % 10, te = Math.floor(x / 10) % 10, o = x % 10;
      if (th) t += (th > 1 ? KD[th] : '') + '千';
      if (h) t += (h > 1 ? KD[h] : '') + '百';
      if (te) t += (te > 1 ? KD[te] : '') + '十';
      if (o) t += KD[o];
      return t;
    };
    if (man) s += (man === 1 ? '一' : part(man)) + '万';
    if (r) s += part(r);
    return s;
  }

  // 數字本身的讀音（不含助數詞）
  function numReading(n) {
    if (n === 0) return 'れい';
    let out = '';
    const man = Math.floor(n / 10000), r = n % 10000;
    const part = x => {
      let t = '';
      const th = Math.floor(x / 1000), h = Math.floor(x / 100) % 10, te = Math.floor(x / 10) % 10, o = x % 10;
      if (th) t += ({ 1: 'せん', 3: 'さんぜん', 8: 'はっせん' }[th] || (BASE[th] + 'せん'));
      if (h) t += ({ 1: 'ひゃく', 3: 'さんびゃく', 6: 'ろっぴゃく', 8: 'はっぴゃく' }[h] || (BASE[h] + 'ひゃく'));
      if (te) t += (te === 1 ? 'じゅう' : BASE[te] + 'じゅう');
      if (o) t += BASE[o];
      return t;
    };
    if (man) out += (man === 1 ? 'いち' : part(man)) + 'まん';
    if (r) out += part(r);
    return out;
  }

  /* 助數詞規則：
   * kana：助數詞讀音；type：連音規則
   *   t：不變（まい、だい、えん、ねん…）  k：1,6,8,10 促音化（かい、こ、かげつ）
   *   s：1,8,10 促音化（さい、さつ、しゅうかん）  p：ふん/ほん/ひき/はい 類（半濁、濁音、促音）
   * special：個別數字的特殊讀音（1～10、何）
   */
  const P_SET = { 1: 'いっ', 6: 'ろっ', 8: 'はっ', 10: 'じゅっ' };
  const COUNTERS = {
    '時': { kana: 'じ', zh: '點', special: { 4: 'よじ', 7: 'しちじ', 9: 'くじ' }, nan: 'なんじ' },
    '分': { kana: 'ふん', zh: '分', type: 'pun', nan: 'なんぷん' },
    '時間': { kana: 'じかん', zh: '小時', special: { 4: 'よじかん', 7: 'ななじかん', 9: 'くじかん' }, alt: { 7: ['しちじかん'] }, nan: 'なんじかん' },
    '月': { kana: 'がつ', zh: '月', special: { 4: 'しがつ', 7: 'しちがつ', 9: 'くがつ' }, nan: 'なんがつ' },
    '円': { kana: 'えん', zh: '日圓', special: { 4: 'よえん' }, nan: 'なんえん' },
    '歳': { kana: 'さい', zh: '歲', type: 's', special: { 20: 'はたち' }, alt: { 10: ['じっさい'] }, nan: 'なんさい' },
    '人': { kana: 'にん', zh: '人', special: { 1: 'ひとり', 2: 'ふたり', 4: 'よにん', 7: 'ななにん' }, alt: { 7: ['しちにん'] }, nan: 'なんにん' },
    '枚': { kana: 'まい', zh: '張', nan: 'なんまい' },
    '本': { kana: 'ほん', zh: '支', type: 'hon', nan: 'なんぼん' },
    '冊': { kana: 'さつ', zh: '本', type: 's', nan: 'なんさつ' },
    '台': { kana: 'だい', zh: '台', nan: 'なんだい' },
    '匹': { kana: 'ひき', zh: '隻', type: 'hiki', nan: 'なんびき' },
    '回': { kana: 'かい', zh: '次', type: 'k', nan: 'なんかい' },
    '杯': { kana: 'はい', zh: '杯', type: 'hai', nan: 'なんばい' },
    '個': { kana: 'こ', zh: '個', type: 'k', nan: 'なんこ' },
    '階': { kana: 'かい', zh: '樓', type: 'kai', nan: 'なんがい' },
    '週間': { kana: 'しゅうかん', zh: '週', type: 's', nan: 'なんしゅうかん' },
    'か月': { kana: 'かげつ', zh: '個月', type: 'k', nan: 'なんかげつ' },
    '年': { kana: 'ねん', zh: '年', special: { 4: 'よねん' }, nan: 'なんねん' },
    '日': { kana: 'にち', zh: '日', daySpecial: true, nan: 'なんにち' }
  };
  const DAYS = { 1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか' };

  function counterReadings(n, cKey) {
    const c = COUNTERS[cKey];
    if (c.daySpecial) { return DAYS[n] ? [DAYS[n]] : [numReading(n) + 'にち']; }
    if (c.special && c.special[n]) return [c.special[n]].concat((c.alt && c.alt[n]) || []);
    const d = n % 10, tens = n - d;
    const lastUnit = d || (n >= 10 && n % 10 === 0 && n < 100 ? 10 : 0);
    const head = d ? numReading(tens) : numReading(n - 10);
    // 只對 1～10 與 11～99 的末位處理連音
    const soft = (rest) => {
      let base, key;
      if (d) { base = tens ? numReading(tens) : ''; key = d; }
      else if (n % 100 === 0 || n >= 100) { base = numReading(n); key = 0; }
      else { base = n > 10 ? BASE[n / 10] : ''; key = 10; }
      return [base, key];
    };
    const [base, key] = soft();
    let cr = c.kana, nr;
    const hard = P_SET[key];
    switch (c.type) {
      case 'k': case 'kai': // かい／こ／かげつ
        if (hard) { nr = (base + hard); cr = c.kana; }
        else nr = base + BASE[key] || base;
        if (c.type === 'kai' && key === 3) cr = 'がい';
        break;
      case 's': // さい／さつ／しゅうかん
        if ([1, 8, 10].includes(key)) { nr = base + P_SET[key]; } else nr = base + (BASE[key] || '');
        break;
      case 'pun': // ふん／ぷん
        if ([1, 3, 4, 6, 8, 10].includes(key)) { nr = base + (key === 1 ? 'いっ' : key === 3 ? 'さん' : key === 4 ? 'よん' : key === 6 ? 'ろっ' : key === 8 ? 'はっ' : 'じゅっ'); cr = 'ぷん'; }
        else nr = base + BASE[key] + '';
        if (key === 8) { // はちふん／はっぷん 兩種都常見
          const a = base + 'はっ' + 'ぷん', b = base + 'はち' + 'ふん';
          return [a, b];
        }
        if (key === 4) nr = base + 'よん';
        if (key === 7) nr = base + 'なな';
        break;
      case 'hon': // ほん／ぼん／ぽん
        if ([1, 6, 8, 10].includes(key)) { nr = base + P_SET[key]; cr = 'ぽん'; }
        else if (key === 3) { nr = base + 'さん'; cr = 'ぼん'; }
        else { nr = base + (key === 4 ? 'よん' : key === 7 ? 'なな' : BASE[key]); }
        break;
      case 'hiki':
        if ([1, 6, 8, 10].includes(key)) { nr = base + P_SET[key]; cr = 'ぴき'; }
        else if (key === 3) { nr = base + 'さん'; cr = 'びき'; }
        else { nr = base + (key === 4 ? 'よん' : key === 7 ? 'なな' : BASE[key]); }
        break;
      case 'hai':
        if ([1, 6, 8, 10].includes(key)) { nr = base + P_SET[key]; cr = 'ぱい'; }
        else if (key === 3) { nr = base + 'さん'; cr = 'ばい'; }
        else { nr = base + (key === 4 ? 'よん' : key === 7 ? 'なな' : BASE[key]); }
        break;
      default: nr = numReading(n);
    }
    if (key === 0) nr = numReading(n);
    const out = [nr + cr];
    if (c.alt && c.alt[n]) out.push(...c.alt[n]);
    return out;
  }

  // 產生 [{surface, kana[], n, counter, gloss}]
  function generate(maxN) {
    const list = [];
    const ns = [];
    for (let n = 1; n <= (maxN || 99); n++) ns.push(n);
    [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000, 30000, 50000, 100000].forEach(n => ns.push(n));
    Object.keys(COUNTERS).forEach(ck => {
      const c = COUNTERS[ck];
      ns.forEach(n => {
        if (n > 31 && (ck === '日' || ck === '月' || ck === '時' || ck === '分')) return;
        if (n > 12 && ck === '月') return;
        if (n > 24 && ck === '時') return;
        if (n >= 100 && !['円', '人', '年', '歳'].includes(ck)) return;
        list.push({ surface: toKanji(n) + ck, kana: counterReadings(n, ck), n, counter: ck, zh: c.zh });
      });
      list.push({ surface: '何' + ck, kana: [c.nan], n: null, counter: ck, zh: c.zh });
    });
    ns.forEach(n => list.push({ surface: toKanji(n), kana: [numReading(n)], n, counter: null }));
    list.push({ surface: '〇', kana: ['れい', 'ぜろ'], n: 0, counter: null });
    return list;
  }

  const CT = { toKanji, numReading, COUNTERS, counterReadings, generate };
  root.Counters = CT;
  if (typeof module !== 'undefined') module.exports = CT;
})(typeof window !== 'undefined' ? window : globalThis);
