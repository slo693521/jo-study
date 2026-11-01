/* view-learn.js — 五十音、課程內頁、文法 */
(function (root) {
  'use strict';
  const App = root.App, JP = root.JP, D = root.JP_DATA, Progress = root.Progress, Store = root.Store, QG = root.QuizGen;
  const { esc, chip, notice, bar, playBtn, sentenceCard, vocabRuby, rubyWord } = App;
  const idx = () => App.idx;

  /* ================= 五十音 ================= */
  const K = D.kana;
  const TABS = [['hira', '平假名'], ['kata', '片假名'], ['dakuon', '濁音・半濁音'], ['youon', '拗音'], ['special', '特殊音'], ['rules', '特殊規則'], ['confuse', '易混淆']];
  const weakSet = () => new Set(Progress.weakKana(30).map(w => w.k));

  function cell(ch, r, ety, weak) {
    return `<button class="kcell${weak.has(ch) ? ' weak' : ''}" data-act="say" data-t="${esc(ch)}" aria-label="${esc(ch)} ${esc(r)}"><span class="k">${esc(ch)}</span><span class="r">${esc(r)}</span>${ety ? `<span class="ety">${esc(ety)}</span>` : ''}</button>`;
  }
  function seionChart(script, weak) {
    let out = '<div class="kana-chart">';
    const n = Math.ceil(K.seion.length / 5) * 5;
    for (let i = 0; i < n; i++) {
      if (i % 5 === 0) out += `<div class="row-label">${esc(K.rowNames[i / 5] || '')}</div>`;
      const s = K.seion[i];
      out += s ? cell(script === 'hira' ? s.h : s.k, s.r, '字源：' + (script === 'hira' ? s.ho : s.ko), weak) : '<div class="kcell empty"></div>';
    }
    return out + '</div>';
  }
  function exTable(rows) {
    return `<div class="tablewrap"><table><thead><tr><th>單字</th><th>讀音</th><th class="romaji">羅馬拼音</th><th>意思</th><th></th></tr></thead><tbody>${rows.map(([w, k, zh]) => {
      const ruby = JP.hasKanji(w) ? (JP.autoRuby(w, k) || w) : w;
      return `<tr><td class="jp">${rubyWord(ruby)}</td><td class="jp">${esc(k)}</td><td class="romaji">${esc(JP.kanaToRomaji(k))}</td><td>${esc(zh)}</td><td>${playBtn(k, { slow: false })}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  const SPECIAL_EX = [['ファ', 'fa', 'ファイル', 'ふぁいる', '檔案'], ['フィ', 'fi', 'フィルム', 'ふぃるむ', '底片'], ['フェ', 'fe', 'カフェ', 'かふぇ', '咖啡廳'], ['フォ', 'fo', 'フォーク', 'ふぉーく', '叉子'],
    ['ティ', 'ti', 'パーティー', 'ぱーてぃー', '派對'], ['ディ', 'di', 'ディスク', 'でぃすく', '磁碟'], ['ウィ', 'wi', 'ウィスキー', 'うぃすきー', '威士忌'], ['ウェ', 'we', 'ウェイター', 'うぇいたー', '男服務生'],
    ['シェ', 'she', 'シェフ', 'しぇふ', '主廚'], ['ジェ', 'je', 'ジェット', 'じぇっと', '噴射機'], ['チェ', 'che', 'チェック', 'ちぇっく', '檢查'], ['デュ', 'dyu', 'デュエット', 'でゅえっと', '二重唱'], ['ヴ', 'vu', 'ヴァイオリン', 'ゔぁいおりん', '小提琴']];

  function kanaPage(tab, weak) {
    const script = App.tmp.kanaScript || 'hira';
    const scriptSw = `<div class="row" style="margin-bottom:.6rem"><span class="small muted">文字：</span><button class="tab${script === 'hira' ? ' on' : ''}" data-act="kanaScript" data-v="hira">平假名</button><button class="tab${script === 'kata' ? ' on' : ''}" data-act="kanaScript" data-v="kata">片假名</button></div>`;
    if (tab === 'hira' || tab === 'kata') {
      return `<div class="card"><div class="row between"><div><h2 style="margin:0">${tab === 'hira' ? '平假名' : '片假名'}清音表</h2><div class="small muted">點任一格會朗讀。${tab === 'hira' ? '平假名用於一般日文句子。' : '片假名主要用於外來語、外國人名地名、擬聲詞。'}</div></div>
        <label class="chk"><input type="checkbox" data-on="etySw" ${App.tmp.showEty ? 'checked' : ''}> 顯示字源（漢字聯想）</label></div></div>
        <div class="card ${App.tmp.showEty ? 'show-ety' : ''}" id="kchart">${seionChart(tab, weak)}</div>
        <div class="notice">し＝shi、ち＝chi、つ＝tsu、ふ＝fu 的羅馬拼音與五十音表的規律不同；「は」「へ」「を」當助詞時分別念 wa、e、o。「ん」單獨佔一拍。紅色底表示你在測驗中常錯的字。</div>`;
    }
    if (tab === 'dakuon') {
      const pick = script === 'hira' ? 'h' : 'k';
      const mk = arr => `<div class="kana-chart">${arr.map(s => cell(s[pick], s.r, '', weak)).join('')}</div>`;
      return `${scriptSw}<div class="card"><h2>濁音（゛）</h2><p>${esc(K.tips.dakuon)}</p>${mk(K.dakuon)}</div>
        <div class="card"><h2>半濁音（゜）</h2><p>${esc(K.tips.handakuon)}</p>${mk(K.handakuon)}</div>`;
    }
    if (tab === 'youon') {
      const pick = script === 'hira' ? 'h' : 'k';
      return `${scriptSw}<div class="card"><h2>拗音</h2><p>${esc(K.tips.youon)}</p><div class="kana-chart" style="grid-template-columns:repeat(3,minmax(0,1fr));max-width:420px">${K.youon.map(s => cell(s[pick], s.r, '', weak)).join('')}</div></div>
        <div class="card"><h3>對照練習</h3>${exTable([['病院', 'びょういん', '醫院'], ['美容院', 'びよういん', '美容院'], ['今日', 'きょう', '今天'], ['写真', 'しゃしん', '照片'], ['料理', 'りょうり', '料理；做菜'], ['お茶', 'おちゃ', '茶']])}<p class="small muted" style="margin-top:.5rem">「びょういん」和「びよういん」只差一個小字，意思完全不同。</p></div>`;
    }
    if (tab === 'special') {
      return `<div class="card"><h2>片假名特殊音（外來語用）</h2><p>${esc(K.tips.katakana)} 下面是外來語為了模擬外國發音而出現的組合。這些音大多超出 N5 考試範圍，但在店名、菜單、外來語單字很常見，先認得就好。</p>
        <div class="tablewrap"><table><thead><tr><th>組合</th><th class="romaji">羅馬拼音</th><th>例字</th><th>意思</th><th></th></tr></thead><tbody>${SPECIAL_EX.map(([c, r, w, k, zh]) => `<tr><td class="jp" style="font-size:1.3rem">${c}</td><td class="romaji">${r}</td><td class="jp">${w}</td><td>${zh}</td><td>${playBtn(w, { slow: false })}</td></tr>`).join('')}</tbody></table></div></div>`;
    }
    if (tab === 'rules') {
      const blocks = [
        ['促音「っ」（小つ）', K.tips.sokuon, [['切手', 'きって', '郵票'], ['来て', 'きて', '請來（來的て形）'], ['学校', 'がっこう', '學校'], ['雑誌', 'ざっし', '雜誌'], ['切符', 'きっぷ', '車票']]],
        ['長音', K.tips.chouon, [['おばさん', 'おばさん', '阿姨'], ['おばあさん', 'おばあさん', '奶奶；外婆'], ['おじさん', 'おじさん', '叔叔'], ['おじいさん', 'おじいさん', '爺爺；外公'], ['先生', 'せんせい', '老師']]],
        ['撥音「ん」', K.tips.hatsuon, [['本', 'ほん', '書'], ['散歩', 'さんぽ', '散步'], ['りんご', 'りんご', '蘋果'], ['禁煙', 'きんえん', '禁菸']]],
        ['拗音的大小字', K.tips.youon, [['病院', 'びょういん', '醫院'], ['美容院', 'びよういん', '美容院']]]
      ];
      return blocks.map(([t, tip, rows]) => `<div class="card"><h2>${t}</h2><p>${esc(tip)}</p>${exTable(rows)}</div>`).join('') +
        '<div class="card"><h2>助詞的特殊念法</h2><p>「は」當助詞念 <b>wa</b>、「へ」當助詞念 <b>e</b>、「を」念 <b>o</b>。</p><div class="sentence"><span class="jp-text">' + JP.sentence('私[わたし] は 学校[がっこう] へ 行[い]きます 。').html + '</span><div class="romaji">Watashi wa gakkō e ikimasu.</div></div></div>';
    }
    if (tab === 'confuse') {
      return `<div class="card"><h2>容易混淆的假名</h2><p class="small muted">這些字形很像，測驗時也會優先拿來當干擾選項。</p>
        <div class="tablewrap"><table><thead><tr><th>字</th><th>字</th><th>怎麼分</th></tr></thead><tbody>${K.confusables.map(c => `<tr><td class="jp" style="font-size:1.6rem">${c[0]}</td><td class="jp" style="font-size:1.6rem">${c[1]}</td><td>${esc(c[2])}</td></tr>`).join('')}</tbody></table></div></div>`;
    }
    return '';
  }

  App.views.kana = function (parts) {
    App.pageTitle = '五十音';
    const tab = TABS.some(t => t[0] === parts[0]) ? parts[0] : 'hira';
    const weak = weakSet();
    App.render(`<h1>五十音</h1>
      <div class="tabs">${TABS.map(([k, n]) => `<a class="tab${k === tab ? ' on' : ''}" href="#/kana/${k}">${n}</a>`).join('')}</div>
      ${kanaPage(tab, weak)}
      <div class="card"><h3>練習</h3><div class="row"><a class="btn" href="#/quiz/type/kana_recog">假名辨識測驗</a><a class="btn" href="#/quiz/type/kana_match">假名配對測驗</a><a class="btn" href="#/lessons">到課程學習</a></div></div>`);
  };
  App.acts.kanaScript = el => { App.tmp.kanaScript = el.dataset.v; App.refresh(); };
  App.ons.etySw = el => { App.tmp.showEty = el.checked; const c = App.$('#kchart'); if (c) c.classList.toggle('show-ety', el.checked); };

  /* ================= 文法區塊（課程頁與文法頁共用） ================= */
  function grammarBlock(g, o) {
    o = o || {};
    const les = idx().lById.get(g.lesson);
    return `<div class="card" id="g-${g.id}">
      <div class="row between"><h2 style="margin:0">${g.id}　${esc(g.name)}</h2>${o.link ? `<a class="btn sm" href="#/grammar/${g.id}">單獨查看</a>` : `<a class="chip acc" href="#/lesson/${g.lesson}">${g.lesson} ${les ? esc(les.title) : ''}</a>`}</div>
      <div class="notice" style="margin-top:.7rem"><strong>接續規則</strong><span class="jp">${esc(g.conn)}</span></div>
      <h3>說明</h3><p>${esc(g.explain).replace(/\n/g, '<br>')}</p>
      <h3>使用場合</h3><p>${esc(g.usage)}</p>
      <h3>例句</h3>${g.examples.map(e => sentenceCard(e[0], e[1])).join('')}
      <h3>常見錯誤</h3><ul>${g.mistakes.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <h3>和相近文法比較</h3><p>${esc(g.compare)}</p>
      ${o.link ? '' : `<div class="row"><a class="btn sm" href="#/quiz/grammar/${g.id}">練習這個文法（${g.exercises.length} 題）</a></div>`}
    </div>`;
  }
  App.grammarBlock = grammarBlock;

  /* ================= 文法頁 ================= */
  App.views.grammar = function (parts) {
    const I = idx();
    if (parts[0]) {
      const g = I.gById.get(parts[0]);
      if (!g) return App.views.notfound();
      App.pageTitle = g.name;
      const i = I.grammar.indexOf(g), prev = I.grammar[i - 1], next = I.grammar[i + 1];
      const st = (Store.get().grammar || {})[g.id];
      App.render(`<p><a href="#/grammar">← 文法列表</a></p>${grammarBlock(g)}
        ${st ? `<div class="card tight small muted">你在測驗中這個文法答對 ${st.right} 次、答錯 ${st.wrong} 次。</div>` : ''}
        <div class="card"><h3>本文法練習題（${g.exercises.length} 題）</h3><a class="btn primary" href="#/quiz/grammar/${g.id}">開始練習</a></div>
        <div class="row between">${prev ? `<a class="btn" href="#/grammar/${prev.id}">← ${prev.id} ${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a class="btn" href="#/grammar/${next.id}">${next.id} ${esc(next.name)} →</a>` : ''}</div>`);
      return;
    }
    App.pageTitle = '文法';
    const q = (App.tmp.gq || '').trim();
    const list = I.grammar.filter(g => !q || (g.id + g.name + g.conn + g.explain).includes(q));
    const wk = new Set(Progress.weakGrammar(10).map(w => w.id));
    App.render(`<h1>文法</h1><p class="muted">共 ${I.grammar.length} 個文法項目，依課程順序排列。每個項目都有接續規則、例句（含逐詞解釋）、常見錯誤、比較與練習。</p>
      <div class="field"><label for="gq">搜尋（名稱、關鍵字，例如「に」「ます」）</label><input id="gq" type="search" data-in="gq" value="${esc(App.tmp.gq || '')}" placeholder="輸入關鍵字"></div>
      <div id="glist">${grammarListHtml(list, wk)}</div>`);
  };
  function grammarListHtml(list, wk) {
    const I = idx();
    if (!list.length) return '<div class="card muted">沒有符合的文法。</div>';
    return D.stages.map(s => {
      const gs = list.filter(g => { const l = I.lById.get(g.lesson); return l && l.stage === s.id; });
      if (!gs.length) return '';
      return `<div class="card"><h2>${esc(s.name)}</h2>${gs.map(g => `<a class="lessonrow" href="#/grammar/${g.id}"><span class="id">${g.id}</span><span><strong>${esc(g.name)}</strong><br><span class="tiny muted jp">${esc(g.conn)}</span></span><span>${wk.has(g.id) ? chip('常錯', 'bad') + ' ' : ''}${chip(g.lesson)}</span></a>`).join('')}</div>`;
    }).join('');
  }
  App.ins.gq = el => {
    App.tmp.gq = el.value; const q = el.value.trim();
    const list = idx().grammar.filter(g => !q || (g.id + g.name + g.conn + g.explain).includes(q));
    App.$('#glist').innerHTML = grammarListHtml(list, new Set(Progress.weakGrammar(10).map(w => w.id)));
  };

  /* ================= 課程內頁 ================= */
  const RELATED = {
    L50: [['#/reading', '前往閱讀練習（12 篇）']], L51: [['#/audiobook/L51', '有聲書：跟讀本課對話'], ['#/audiobook/L47', '有聲書：跟讀 L47'], ['#/audiobook/L48', '有聲書：跟讀 L48']],
    L52: [['#/listening', '前往聽力練習']], L53: [['#/quiz/mock/M1', '開始模擬考（1）']], L54: [['#/quiz/mock/M2', '開始模擬考（2）']]
  };

  App.views.lesson = function (parts) {
    const I = idx();
    const id = parts[0] || Progress.currentLesson().id;
    const l = I.lById.get(id);
    if (!l) return App.views.notfound();
    App.pageTitle = `${l.id} ${l.title}`;
    const st = Progress.lessonStatus(id), i = I.lessons.indexOf(l);
    const prev = I.lessons[i - 1], next = I.lessons[i + 1];
    const vs = I.vocabByLesson.get(id) || [];
    const stage = Progress.stageOf(l);
    const gs = (l.grammar || []).map(g => I.gById.get(g)).filter(Boolean);

    let kanaHtml = '';
    if (l.kana && K.sets[l.kana]) {
      const weak = weakSet(); const ent = new Map(QG.KANA().map(e => [e.ch, e]));
      const etyOf = ch => { const s = K.seion.find(x => x && (x.h === ch || x.k === ch)); return s ? (s.h === ch ? s.ho : s.ko) : ''; };
      kanaHtml = `<div class="card"><div class="row between"><h2 style="margin:0">本課假名</h2><label class="chk"><input type="checkbox" data-on="etySw" ${App.tmp.showEty ? 'checked' : ''}> 顯示字源</label></div>
        <p class="small muted">點一下可聽發音。先自己念，再看羅馬拼音確認。</p>
        <div class="kana-chart ${App.tmp.showEty ? 'show-ety' : ''}" id="kchart" style="margin-top:.5rem">${K.sets[l.kana].map(ch => { const e = ent.get(ch); return e ? cell(ch, e.r, etyOf(ch) ? '字源：' + etyOf(ch) : '', weak) : ''; }).join('')}</div>
        <p class="small" style="margin:.6rem 0 0"><a href="#/kana">完整五十音表</a></p></div>`;
    }
    const vocabHtml = vs.length ? `<div class="card"><div class="row between"><h2 style="margin:0">本課單字（${vs.length}）</h2><a class="btn sm primary" href="#/vocab/learn/${id}">用單字卡學習</a></div>
      <div class="tablewrap" style="margin-top:.7rem"><table><thead><tr><th></th><th>單字</th><th>讀音</th><th class="romaji">羅馬拼音</th><th>詞性</th><th>意思</th><th>狀態</th></tr></thead><tbody>${vs.map(v => {
        const s = Progress.status(v.id), fav = Progress.isFav(v.id);
        return `<tr><td><button class="icon-btn sm${fav ? ' on' : ''}" data-act="favToggle" data-id="${esc(v.id)}" aria-pressed="${fav}" aria-label="收藏">${fav ? '★' : '☆'}</button></td>
          <td class="jp" style="font-size:1.15rem"><a href="#/word/${encodeURIComponent(v.id)}" style="text-decoration:none;color:inherit">${vocabRuby(v)}</a> ${playBtn(v.kana.replace(/^〜/, ''), { slow: false })}</td>
          <td class="jp">${esc(v.kana)}</td><td class="romaji">${esc(v.romaji)}</td><td class="small">${esc(D.pos[v.pos] || v.pos)}</td><td>${esc(v.zh)}${v.note ? `<div class="tiny muted">${esc(v.note)}</div>` : ''}</td>
          <td><span class="badge ${s}">${Progress.STATUS_NAME[s]}</span></td></tr>
          ${v.ex ? `<tr><td></td><td colspan="6" class="small"><span class="jp-text" style="font-size:1rem;line-height:1.9">${JP.sentence(v.ex).html}</span> ${playBtn(JP.sentence(v.ex).text, { slow: false })}<div class="romaji">${esc(JP.sentence(v.ex).romaji)}</div><div class="zh muted">${esc(v.exZh)}</div></td></tr>` : ''}`;
      }).join('')}</tbody></table></div></div>` : '';

    const sentHtml = (l.sentences || []).length ? `<div class="card"><div class="row between"><h2 style="margin:0">${l.kana ? '練習單字／短句' : '重點句子'}</h2><a class="btn sm" href="#/audiobook/${id}">🎧 有聲書播放</a></div>
      <p class="small muted">按「詞」可看逐詞拆解；按 🔊 聽發音。</p>${l.sentences.map(s => sentenceCard(s[0], s[1])).join('')}</div>` : '';
    const dlg = l.dialogue ? `<div class="card"><h2>對話：${esc(l.dialogue.title)}</h2>${l.dialogue.lines.map(x => sentenceCard(x[1], x[2], { speaker: x[0] + '：' })).join('')}</div>` : '';
    const rel = (RELATED[id] || []).map(r => `<a class="btn" href="${r[0]}">${esc(r[1])}</a>`).join('');

    App.render(`
      <p class="small"><a href="#/lessons">← 課程總覽</a></p>
      <div class="row between"><div><div class="muted small">${esc(stage.name)}　·　第 ${l.week} 週</div><h1 style="margin:.1rem 0">${l.id}　${esc(l.title)}</h1></div>${st.done ? chip('已完成', 'ok') : st.started ? chip('進行中', 'warn') : chip('未開始')}</div>
      <div class="card"><h3>完成條件</h3>${st.steps.map(s => `<div class="step${s.ok ? ' ok' : ''}"><span class="tick">${s.ok ? '✓' : ''}</span><span>${esc(s.text)}</span></div>`).join('')}
        <div class="row" style="margin-top:.7rem">${l.id >= 'L50' ? '' : `<button class="btn ${st.rec.read ? '' : 'primary'}" data-act="lessonRead" data-id="${id}" ${st.rec.read ? 'disabled' : ''}>${st.rec.read ? '✓ 已讀完' : '我讀完了'}</button>`}
          ${l.id >= 'L50' ? '' : `<a class="btn primary" href="#/quiz/lesson/${id}">做本課測驗</a>`}${rel}</div>
        <p class="tiny muted" style="margin:.6rem 0 0">${esc(l.pass)}</p></div>
      <div class="card"><h2>本課目標</h2><ul>${l.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>
      <div class="card"><h2>課程說明</h2>${l.intro.split('\n').map(p => `<p>${esc(p)}</p>`).join('')}</div>
      ${kanaHtml}
      ${gs.map(g => grammarBlock(g, { link: true })).join('')}
      ${vocabHtml}${sentHtml}${dlg}
      <div class="card"><h2>常見錯誤</h2><ul>${l.mistakes.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>
      <div class="row between" style="margin-top:1rem">${prev ? `<a class="btn" href="#/lesson/${prev.id}">← ${prev.id}</a>` : '<span></span>'}${next ? `<a class="btn primary" href="#/lesson/${next.id}">${next.id} ${esc(next.title)} →</a>` : ''}</div>`);
  };
  App.acts.lessonRead = el => {
    Progress.markRead(el.dataset.id); Progress.markTask('lesson');
    App.toast('已記錄：本課已讀完。接著學單字、做測驗。'); App.refresh();
  };
})(window);
