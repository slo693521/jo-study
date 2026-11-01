/* view-records.js — 學習紀錄、設定與備份、使用說明 */
(function (root) {
  'use strict';
  const App = root.App, JP = root.JP, D = root.JP_DATA, Progress = root.Progress, Store = root.Store, Audio = root.JPAudio;
  const { esc, chip, notice, bar } = App;
  const I = () => App.idx;
  const CAT = Progress.CAT_NAME;

  /* ================= 學習紀錄 ================= */
  function longestStreak() {
    const days = Object.keys(Store.get().days).filter(k => Store.get().days[k].active).sort();
    let best = 0, run = 0, prev = null;
    days.forEach(k => { const d = new Date(k + 'T00:00:00'); if (prev && Math.round((d - prev) / 86400000) === 1) run++; else run = 1; best = Math.max(best, run); prev = d; });
    return best;
  }
  App.views.records = function () {
    App.pageTitle = '學習紀錄';
    const st = Store.get(), cnt = Progress.counts(), total = I().vocab.length;
    const activeDays = Object.values(st.days).filter(d => d.active).length;
    const reviews = Object.values(st.days).reduce((a, d) => a + (d.reviews || 0), 0);
    const rows30 = App.dayRows(30);
    const quizzes = st.quizzes;
    const last15 = quizzes.slice(-15);
    const es = Progress.errorStats();
    const ret7 = Progress.retention(7), ret30 = Progress.retention(30), retAll = Progress.retention(3650);
    const mocks = quizzes.filter(q => q.mode === 'mock');
    const lessonRows = I().lessons.filter(l => st.lessons[l.id] && (st.lessons[l.id].quizBest != null || st.lessons[l.id].read));
    const seg = (n, cls) => `<i style="width:${n / total * 100}%;background:${cls}" title="${n}"></i>`;
    App.render(`<h1>學習紀錄</h1>
      <p class="muted">所有數字都來自你自己的作答與複習紀錄；沒有紀錄的項目會顯示「—」，不會用假資料填充。</p>
      <div class="grid g4 keep2">
        <div class="card stat"><div class="n">${activeDays}</div><div class="l">累計學習天數</div></div>
        <div class="card stat"><div class="n">${Progress.streak()}／${longestStreak()}</div><div class="l">目前連續／最長連續（天）</div></div>
        <div class="card stat"><div class="n">${Progress.lessonsDoneCount()}/${I().lessons.length}</div><div class="l">已完成課程</div></div>
        <div class="card stat"><div class="n">${quizzes.length}</div><div class="l">完成的測驗次數</div></div>
        <div class="card stat"><div class="n">${reviews}</div><div class="l">累計單字複習／答題次數</div></div>
        <div class="card stat"><div class="n">${ret7 == null ? '—' : ret7 + '%'}</div><div class="l">7 天記憶保持率</div></div>
        <div class="card stat"><div class="n">${ret30 == null ? '—' : ret30 + '%'}</div><div class="l">30 天記憶保持率</div></div>
        <div class="card stat"><div class="n">${retAll == null ? '—' : retAll + '%'}</div><div class="l">全部期間記憶保持率</div></div>
      </div>
      <p class="tiny muted">記憶保持率＝複習時評為「困難、良好、簡單」的次數 ÷ 全部複習次數（「重來」算沒記住）。</p>
      <div class="card"><h2>單字掌握狀態（共 ${total}）</h2>
        <div class="bar" style="height:18px;display:flex">${seg(cnt.familiar, 'var(--ok)')}${seg(cnt.learning, '#d99a00')}${seg(cnt.due, 'var(--bad)')}</div>
        <div class="row small" style="margin-top:.5rem"><span class="badge familiar">已熟悉 ${cnt.familiar}</span><span class="badge learning">學習中 ${cnt.learning}</span><span class="badge due">待複習 ${cnt.due}</span><span class="badge new">尚未學習 ${cnt.new}</span></div></div>
      <div class="grid g2">
        <div class="card"><h2>近 30 天：單字學習量</h2>${App.daybars(rows30, 'words')}<div class="row between tiny muted" style="margin-top:.3rem"><span>${rows30[0].label}</span><span>${rows30[29].label}</span></div></div>
        <div class="card"><h2>近 30 天：測驗次數</h2>${App.daybars(rows30, 'quizzes')}<div class="row between tiny muted" style="margin-top:.3rem"><span>${rows30[0].label}</span><span>${rows30[29].label}</span></div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>各類別累計正確率</h2>${Object.keys(es).length ? Object.entries(es).map(([k, v]) => { const p = Math.round(v.c / v.t * 100); return `<div class="hbar"><span>${esc(CAT[k] || k)}</span>${bar(p, p >= 80 ? 'ok' : p < 60 ? 'warn' : '')}<span class="right">${p}%</span></div><div class="tiny muted" style="margin:-.3rem 0 .4rem 5rem">${v.c}/${v.t} 題</div>`; }).join('') : '<p class="muted">還沒有測驗紀錄。</p>'}</div>
        <div class="card"><h2>最近 ${last15.length || 15} 次測驗成績</h2>${last15.length ? `<div class="daybars">${last15.map(q => `<div class="b" style="height:${Math.max(3, q.pct)}%;${q.pct < 60 ? 'background:var(--bad)' : q.pct >= 80 ? 'background:var(--ok)' : ''}" title="${App.fmtDate(q.t)} ${esc(q.label || '')}：${q.pct}%"></div>`).join('')}</div><div class="tiny muted" style="margin-top:.3rem">綠色 ≥ 80%，紅色 < 60%。滑鼠移上去可看細節。</div>` : '<p class="muted">還沒有測驗紀錄。</p>'}</div>
      </div>
      ${mocks.length ? `<div class="card"><h2>模擬考紀錄</h2><div class="tablewrap"><table><thead><tr><th>日期</th><th>場次</th><th>正確率</th><th>分項</th></tr></thead><tbody>${mocks.slice().reverse().map(m => `<tr><td>${App.fmtDate(m.t, true)}</td><td>${esc(m.label)}</td><td>${m.correct}/${m.total}（${m.pct}%）</td><td class="small">${(m.sections || []).map(s => `${s.key}:${s.correct}/${s.total}`).join('　')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="card"><h2>各課進度</h2>${lessonRows.length ? `<div class="tablewrap"><table><thead><tr><th>課</th><th>已讀</th><th>測驗最佳</th><th>最近</th><th>次數</th><th>完成</th></tr></thead><tbody>${lessonRows.map(l => { const r = st.lessons[l.id]; return `<tr><td><a href="#/lesson/${l.id}">${l.id} ${esc(l.title)}</a></td><td>${r.read ? '✓' : ''}</td><td>${r.quizBest != null ? r.quizBest + '%' : '—'}</td><td>${r.quizLast != null ? r.quizLast + '%' : '—'}</td><td>${r.attempts || 0}</td><td>${Progress.isLessonDone(l.id) ? '✓' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">還沒有課程紀錄。</p>'}</div>
      <div class="card"><h2>測驗歷史（最近 30 次）</h2>${quizzes.length ? `<div class="tablewrap"><table><thead><tr><th>日期</th><th>內容</th><th>成績</th><th>用時</th></tr></thead><tbody>${quizzes.slice(-30).reverse().map(q => `<tr><td>${App.fmtDate(q.t, true)}</td><td>${esc(q.label || q.mode)}</td><td>${q.correct}/${q.total}（${q.pct}%）</td><td>${q.seconds ? Math.floor(q.seconds / 60) + ':' + App.pad(q.seconds % 60) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有測驗紀錄。</p>'}</div>`);
  };

  /* ================= 設定與備份 ================= */
  const slider = (id, label, min, max, step, val, unit) => `<div class="field"><label for="${id}">${label}：<span id="${id}V">${val}</span>${unit || ''}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-in="setNum" data-k="${id}"></div>`;
  App.views.settings = function () {
    App.pageTitle = '設定與備份';
    const s = Store.get().settings, st = Store.get();
    const voices = Audio.getVoices();
    const kb = Math.round(Store.usage() / 1024);
    App.render(`<h1>設定與備份</h1>
      <div class="card"><h2>日文語音</h2>
        <div id="voiceBox">${voiceBox()}</div>
        <div class="field"><label for="voiceSel">語音</label><select id="voiceSel" data-on="setVoice" ${voices.length ? '' : 'disabled'}><option value="">自動選擇（建議）</option>${voices.map(v => `<option value="${esc(v.voiceURI)}" ${s.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}${v.localService ? '，本機' : '，線上'}）</option>`).join('')}</select></div>
        ${slider('rate', '正常語速', 0.6, 1.4, 0.05, s.rate, '×')}${slider('slowRate', '慢速', 0.4, 1, 0.05, s.slowRate, '×')}${slider('followGap', '跟讀留白長度（倍率）', 0.8, 3, 0.1, s.followGap, '×')}
        <div class="row"><button class="btn primary" data-act="voiceTest">🔊 測試日文語音</button><span class="small muted" id="voiceTestOut"></span></div>
        <p class="small muted" style="margin:.8rem 0 0">語音由瀏覽器／作業系統提供。本系統只會使用語言為日文（ja）的語音，找不到時會明確告訴你，不會用中文或其他語言的聲音硬念日文。想改用真人錄音檔，請看「使用說明」與 README。</p></div>
      <div class="card"><h2>顯示</h2>
        <div class="field"><label for="romajiSel">羅馬拼音</label><select id="romajiSel" data-on="setSel" data-k="romaji"><option value="auto" ${s.romaji === 'auto' ? 'selected' : ''}>自動（前 13 課顯示，之後隱藏）</option><option value="on" ${s.romaji === 'on' ? 'selected' : ''}>一律顯示</option><option value="off" ${s.romaji === 'off' ? 'selected' : ''}>一律隱藏</option></select></div>
        <div class="field"><label class="chk"><input type="checkbox" data-on="setChk" data-k="furigana" ${s.furigana ? 'checked' : ''}> 顯示振假名（漢字上方的讀音）</label><label class="chk"><input type="checkbox" data-on="setChk" data-k="zh" ${s.zh ? 'checked' : ''}> 顯示中文翻譯</label></div>
        <div class="field"><label for="themeSel">外觀</label><select id="themeSel" data-on="setSel" data-k="theme"><option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>跟隨系統</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>淺色</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>深色</option></select></div>
        ${slider('fontScale', '文字大小', 0.9, 1.4, 0.05, s.fontScale, '×')}</div>
      <div class="card"><h2>學習量</h2>${slider('newPerDay', '每天新單字上限', 3, 30, 1, s.newPerDay, ' 個')}${slider('reviewCap', '每次複習上限', 10, 100, 5, s.reviewCap, ' 張')}
        <p class="small muted" style="margin:0">建議新單字每天 8–12 個。複習到期的單字比學新字重要。</p></div>
      <div class="card"><h2>備份與還原</h2>
        ${notice('你的學習進度只存在這個瀏覽器的 <b>localStorage</b>。它<b>不是雲端備份</b>：清除瀏覽資料、使用無痕模式、換瀏覽器或換電腦，進度都會消失。請定期匯出備份檔，並放在雲端硬碟或隨身碟。', 'warn')}
        <div class="row"><button class="btn primary" data-act="doExport">⬇ 匯出備份（JSON）</button><label class="btn" for="impFile" style="cursor:pointer">⬆ 匯入備份…</label><input id="impFile" type="file" accept="application/json,.json" data-on="impFile" style="position:absolute;left:-9999px"></div>
        <div class="row" style="margin-top:.5rem"><button class="btn" data-act="copyExport">📋 複製備份文字</button><button class="btn" data-act="pasteImport">📥 貼上備份文字匯入</button></div>
        <p class="small muted" style="margin:.4rem 0 0">手機或電腦之間轉移進度：在一台按「複製備份文字」，用 LINE／記事本／Email 傳到另一台，再按「貼上備份文字匯入」。</p>
        <p class="small muted" style="margin:.6rem 0 0">上次匯出：${st.lastExport ? App.fmtDate(st.lastExport, true) : '從未匯出'}　·　目前資料大小約 ${kb} KB　·　儲存狀態：${Store.isPersistent() ? '正常' : '<b style="color:var(--bad)">無法寫入 localStorage（資料只存在記憶體）</b>'}</p></div>
      <div class="card"><h2>清除所有資料</h2><p class="small muted">會刪除全部課程進度、單字進度、測驗紀錄與設定，無法復原。建議先匯出備份。</p><button class="btn danger" data-act="doReset">清除全部資料…</button></div>`);
    App.onVoiceChange = () => { if (App.current === 'settings') App.refresh(); };
  };
  function voiceBox() {
    const st = Audio.getStatus(), v = Audio.pickVoice();
    if (st === 'ready') return notice(`偵測到 ${Audio.getVoices().length} 個日文語音。目前使用：<b>${esc(v ? v.name : '?')}</b>（${esc(v ? v.lang : '')}）。請按下面的「測試日文語音」確認真的有聲音。`, 'ok', '日文語音可用');
    if (Audio.hasMap()) return notice('偵測不到日文語音，但已設定錄音檔對照表，有對應音檔的句子仍可播放。', 'warn');
    return notice(esc(Audio.statusMessage()), st === 'loading' ? '' : 'warn', st === 'loading' ? '偵測中' : '沒有可用的日文語音');
  }
  App.acts.voiceTest = async () => {
    const out = App.$('#voiceTestOut'); out.textContent = '測試中……';
    const r = await Audio.test();
    out.textContent = r.ok ? `✔ 已播放（${r.voice || '日文語音'}）。如果你有聽到聲音就沒問題。` : ({ unsupported: '✘ 這個瀏覽器不支援語音合成。', 'no-voice': '✘ 沒有日文語音，請先安裝（見上方說明）。', silent: '✘ 語音引擎沒有開始發聲：請檢查系統音量、靜音，或換瀏覽器。' }[r.reason] || '✘ 播放失敗');
  };
  App.ons.setVoice = el => { Store.get().settings.voiceURI = el.value; Store.save(); Audio.setVoice(el.value); App.refresh(); };
  App.ins.setNum = el => {
    const s = Store.get().settings, k = el.dataset.k; s[k] = +el.value; Store.save();
    App.$('#' + k + 'V').textContent = el.value;
    if (k === 'fontScale') document.documentElement.style.setProperty('--scale', el.value);
    if (k === 'rate') Audio.setRate(+el.value);
  };
  App.ons.setSel = el => { Store.get().settings[el.dataset.k] = el.value; Store.save(); App.applySettings(); };
  App.ons.setChk = el => { Store.get().settings[el.dataset.k] = el.checked; Store.save(); App.applySettings(); };

  App.acts.doExport = () => {
    const text = Store.exportData();
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `jp-study-backup-${Store.today()}.json`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    App.toast('已匯出。請把檔案存放在安全的地方。'); setTimeout(() => App.refresh(), 300);
  };
  App.ons.impFile = el => {
    const f = el.files && el.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => impText(String(rd.result));
    rd.onerror = () => App.toast('讀檔失敗', true);
    rd.readAsText(f); el.value = '';
  };
  function impText(text) {
      text = String(text || '').trim();
      let obj; try { obj = JSON.parse(text); } catch (e) { App.toast('無法讀取：這不是有效的 JSON 檔。', true); return; }
      const bad = Store.validate(obj);
      if (bad) { App.toast('匯入失敗：' + bad, true); return; }
      const d = obj.app === 'jp-study-app' ? obj.data : obj;
      App.tmp.importText = text;
      App.modal(`<h2>匯入備份</h2><p>檔案內容：單字進度 ${Object.keys(d.cards || {}).length} 個、課程紀錄 ${Object.keys(d.lessons || {}).length} 筆、測驗 ${(d.quizzes || []).length} 次${obj.exportedAt ? `，匯出時間 ${esc(String(obj.exportedAt).slice(0, 16).replace('T', ' '))}` : ''}。</p>
        <p><b>合併</b>：保留目前的資料，並把備份中較新或較多的進度併進來（建議）。<br><b>取代</b>：丟掉目前所有資料，完全換成備份檔的內容。</p>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-act="mcancel">取消</button><button class="btn primary" data-act="impDo" data-m="merge">合併</button><button class="btn danger" data-act="impDo" data-m="replace">取代</button></div>`);
  }
  App.acts.copyExport = async () => {
    const text = Store.exportData();
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* 部分瀏覽器或內嵌頁面不允許，改成手動複製 */ }
    App.modal(`<h2>備份文字</h2><p>${copied ? '✔ 已複製到剪貼簿。' : '請長按下方文字框 →「全選」→「複製」。'}把它貼到 LINE、記事本或 Email 傳到另一台裝置，再用「貼上備份文字匯入」。</p>
      <textarea id="expText" readonly style="min-height:160px;font-size:.8rem">${esc(text)}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:.6rem"><button class="btn" data-act="selExport">全選</button><button class="btn primary" data-act="mcancel">完成</button></div>`);
  };
  App.acts.selExport = () => { const t = App.$('#expText'); if (t) { t.focus(); t.select(); t.setSelectionRange(0, t.value.length); } };
  App.acts.pasteImport = () => {
    App.modal(`<h2>貼上備份文字</h2><p>把從另一台裝置複製的備份文字（以 <code>{</code> 開頭）貼在下面。</p>
      <textarea id="impText" style="min-height:160px;font-size:.8rem" placeholder="在這裡貼上…"></textarea>
      <div class="row" style="justify-content:flex-end;margin-top:.6rem"><button class="btn" data-act="mcancel">取消</button><button class="btn primary" data-act="impPaste">下一步</button></div>`);
  };
  App.acts.impPaste = () => { const t = App.$('#impText'); const v = t ? t.value : ''; if (!v.trim()) { App.toast('還沒有貼上內容', true); return; } App.closeModal(false); impText(v); };
  App.acts.impDo = el => {
    const r = Store.importData(App.tmp.importText, el.dataset.m); App.tmp.importText = null; App.closeModal(false);
    if (!r.ok) { App.toast('匯入失敗：' + r.error, true); return; }
    App.toast(`匯入完成：單字 ${r.cards} 個、課程 ${r.lessons} 筆、測驗 ${r.quizzes} 次。`); App.applySettings(); App.updateChips(); App.refresh();
  };
  App.acts.doReset = () => {
    App.modal(`<h2 style="color:var(--bad)">清除全部資料</h2><p>這會刪除所有學習進度與設定，<b>無法復原</b>。若要繼續，請在下面輸入「清除」兩個字。</p>
      <input type="text" id="rstIn" placeholder="輸入：清除" autocomplete="off" style="width:100%">
      <div class="row" style="justify-content:flex-end;margin-top:1rem"><button class="btn" data-act="mcancel">取消</button><button class="btn danger" data-act="rstGo">永久清除</button></div>`);
  };
  App.acts.rstGo = () => {
    if (App.$('#rstIn').value.trim() !== '清除') { App.toast('請先輸入「清除」。', true); return; }
    Store.reset(); App.closeModal(false); App.applySettings(); App.updateChips(); App.toast('已清除全部資料。'); App.go('#/home');
  };

  /* ================= 使用說明 ================= */
  App.views.about = function () {
    App.pageTitle = '使用說明';
    const I_ = I();
    const exCount = I_.grammar.reduce((a, g) => a + g.exercises.length, 0);
    const sentCount = I_.lessons.reduce((a, l) => a + (l.sentences || []).length + (l.dialogue ? l.dialogue.lines.length : 0), 0) + I_.grammar.reduce((a, g) => a + g.examples.length, 0);
    App.render(`<h1>使用說明</h1>
      <div class="card"><h2>這個系統是什麼</h2><p>一套給零基礎中文使用者的 6 個月 JLPT N5 自學系統：54 課、26 週，每天 30–45 分鐘。全部在你的瀏覽器裡執行，沒有後端、不需要帳號、不連網也能用（朗讀可能需要作業系統的日文語音）。</p>
        ${notice('完成這套系統<b>不等於</b>通過 JLPT N5。它是自編教材，不含任何官方題目；模擬考與分數換算只是自我檢測。報考前請另外做官方公開的樣題，並以官方資訊為準。', 'warn')}</div>
      <div class="card"><h2>內容統計（即時計算）</h2><div class="grid g3 keep2">
        <div class="stat"><div class="n">${I_.lessons.length}</div><div class="l">課程</div></div><div class="stat"><div class="n">${I_.vocab.length}</div><div class="l">單字</div></div><div class="stat"><div class="n">${I_.grammar.length}</div><div class="l">文法項目</div></div>
        <div class="stat"><div class="n">${sentCount}</div><div class="l">例句／對話句</div></div><div class="stat"><div class="n">${exCount}</div><div class="l">文法練習題</div></div><div class="stat"><div class="n">${D.readings.length}</div><div class="l">閱讀短文</div></div>
        <div class="stat"><div class="n">${D.listening.length}</div><div class="l">聽力題</div></div><div class="stat"><div class="n">${D.mocks.length}</div><div class="l">模擬考（各 54 題）</div></div><div class="stat"><div class="n">${Object.keys(QG_TYPES()).length}</div><div class="l">題型</div></div></div>
        <p class="small muted" style="margin:.6rem 0 0">另有依單字、句子、假名自動產生的題目，每次測驗的選項都會重新洗牌，正確答案不會集中在同一個位置。</p></div>
      <div class="card"><h2>每天怎麼用</h2><ol><li>打開首頁，按「開始今日課程」，或到「今日任務」看清單。</li><li><b>複習舊單字</b>（先做！）→ 學新教材 → 練習 → 聽力／跟讀 → 每日測驗。</li><li>做完一課：讀完按「我讀完了」、學完本課單字、本課測驗 ≥ 80%，三項都完成才算過關。</li><li>前一課測驗偏低時，系統會自動把今天改成先複習那一課。</li><li>每週一次每週複習，每月一次階段測驗，最後兩課做模擬考。</li></ol></div>
      <div class="card"><h2>間隔複習（SRS）怎麼運作</h2><p>每個單字有自己的複習時間。看到答案後依記憶情況按：<b>重來</b>（想不起來，約 10 分鐘後再出現）、<b>困難</b>、<b>良好</b>、<b>簡單</b>（間隔越拉越長）。越熟間隔越久，最長 1 年。測驗答錯的單字也會自動進複習。「已熟悉」代表複習間隔 ≥ 21 天而且最近 7 天沒答錯。</p></div>
      <div class="card"><h2>有聲書與朗讀</h2><ul><li>聲音來自瀏覽器的語音合成（Web Speech API），只使用語言為日文的語音；<b>不是真人錄音</b>。</li><li>需要作業系統有日文語音。Windows：設定 → 時間與語言 → 語音；macOS：系統設定 → 輔助使用 → 語音內容；Android：文字轉語音設定。Chrome／Edge 通常有可用的日文語音。</li><li>找不到日文語音時，系統會提示，並且不會用中文語音代替。</li><li>想用真人錄音檔：把音檔放在 <code>audio/</code>，並在 <code>data/audiomap.js</code> 登記，詳見 README。</li></ul></div>
      <div class="card"><h2>快速鍵</h2><ul><li>單字卡：空白鍵／Enter 顯示答案、1–4 評分、P 朗讀、F 收藏</li><li>測驗：1–4 或 A–D 選擇、Enter 下一題</li><li>Esc：關閉視窗或選單</li></ul></div>
      <div class="card"><h2>已知限制</h2><ul><li>進度存在 localStorage，不是雲端備份；請定期匯出。</li><li>語音品質與可用性取決於瀏覽器與作業系統；部分手機瀏覽器在背景或螢幕關閉時會中斷朗讀。</li><li>沒有手寫或發音評分功能；跟讀只能靠你自己判斷。</li><li>題目是自編的，雖已逐一檢查讀音、翻譯與答案，仍可能有疏漏，發現問題請以字典或日語老師為準。</li></ul></div>`);
  };
  const QG_TYPES = () => root.QuizGen.TYPES;
})(window);
