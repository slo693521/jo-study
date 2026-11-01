/* audio.js — 日文朗讀與有聲書控制
 *
 * 設計原則（重要）：
 *  1. 優先使用瀏覽器 Web Speech API（speechSynthesis），一律指定 lang='ja-JP'，並且只選用「語言為日文」的語音。
 *     絕不使用中文或其他語言的語音來念日文。
 *  2. 沒有日文語音時，狀態會是 'no-voice'，介面必須顯示提示；speak() 會回傳 false，不會假裝有播放。
 *  3. 可替換為正式錄音檔：在 data/audiomap.js 設定 window.JP_AUDIO_MAP = { '日文原句（無空白）': 'audio/xxx.mp3' }，
 *     有對應檔案的句子會改播放音檔（同樣支援暫停、語速）。本系統預設沒有附任何錄音檔，也不宣稱有真人錄音。
 *  4. 一次只播放一段；切換頁面或課程時呼叫 Audio.stopAll()，避免前一段語音繼續播放。
 *  5. 有聲書是「逐句」佇列播放，而不是把整頁文字丟給語音引擎。
 *  6. 暫停採用「停止目前句子、恢復時從該句開頭重念」的方式，因為 speechSynthesis.pause() 在 Android 等平台不可靠。
 */
(function (root) {
  'use strict';
  const synth = root.speechSynthesis || null;
  const hasAPI = !!(synth && root.SpeechSynthesisUtterance);
  let voices = [], jaVoices = [], status = hasAPI ? 'loading' : 'unsupported';   // loading | ready | no-voice | unsupported
  let voiceURI = '', rate = 1;
  const listeners = [];
  const keep = [];     // 保留 utterance 參考，避免部分瀏覽器（Chrome）過早垃圾回收導致 onend 不觸發
  let currentAudio = null, token = 0;
  let sessionTimer = null;

  function emit(ev) { listeners.forEach(f => { try { f(ev); } catch (e) { /* ignore */ } }); }
  function onChange(f) { listeners.push(f); }

  function scanVoices() {
    if (!hasAPI) return;
    voices = synth.getVoices() || [];
    jaVoices = voices.filter(v => /^ja([-_]|$)/i.test(v.lang));
    const prev = status;
    status = jaVoices.length ? 'ready' : (voices.length ? 'no-voice' : status);
    if (prev !== status) emit({ type: 'status', status });
  }
  function init() {
    if (!hasAPI) { emit({ type: 'status', status }); return; }
    scanVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', scanVoices); else synth.onvoiceschanged = scanVoices;
    // 有些瀏覽器（尤其是 Chrome）要等一下才有語音清單；3 秒後仍沒有任何語音就視為沒有
    let n = 0;
    const t = setInterval(() => { scanVoices(); if (++n >= 12 || status === 'ready') { clearInterval(t); if (status === 'loading') { status = 'no-voice'; emit({ type: 'status', status }); } } }, 250);
  }

  function pickVoice() {
    if (!jaVoices.length) return null;
    if (voiceURI) { const v = jaVoices.find(x => x.voiceURI === voiceURI); if (v) return v; }
    // 優先：本機語音、名稱含 Kyoko/O-Ren/Haruka/Google 日本語 等
    const pref = jaVoices.find(v => /ja[-_]JP/i.test(v.lang) && v.localService) || jaVoices.find(v => /ja[-_]JP/i.test(v.lang));
    return pref || jaVoices[0];
  }
  function setVoice(uri) { voiceURI = uri || ''; }
  function setRate(r) { rate = Math.min(2, Math.max(0.3, +r || 1)); }
  function getRate() { return rate; }
  function getStatus() { return status; }
  function getVoices() { return jaVoices.slice(); }
  function available() { return status === 'ready' || hasMap(); }
  function hasMap() { return !!(root.JP_AUDIO_MAP && Object.keys(root.JP_AUDIO_MAP).length); }
  function statusMessage() {
    if (status === 'unsupported') return '這個瀏覽器不支援 Web Speech API（speechSynthesis），無法朗讀日文。建議使用 Chrome、Edge 或 Safari 的新版本。';
    if (status === 'loading') return '正在偵測日文語音……';
    if (status === 'no-voice') return '偵測不到日文語音（ja-JP）。請在作業系統安裝「日文」語音（Windows：設定 → 時間與語言 → 語音；macOS：系統設定 → 輔助使用 → 語音內容；Android：文字轉語音設定），或改用 Chrome／Edge。在沒有日文語音之前，系統不會用其他語言的語音代替朗讀。';
    return '';
  }

  /* 播放單一段文字。回傳 Promise<boolean>：true=正常播放完畢，false=被取消或無法播放 */
  function speakOne(text, opts) {
    opts = opts || {};
    const my = ++token;
    cancelCurrent();
    return new Promise(resolve => {
      const done = (ok) => { if (my === token || !ok) resolve(ok); };
      // 1. 錄音檔優先
      const map = root.JP_AUDIO_MAP, key = String(text).replace(/\s+/g, '');
      if (map && map[key]) {
        const a = new root.Audio(map[key]); currentAudio = a; a.playbackRate = Math.min(2, Math.max(0.5, opts.rate || rate));
        a.onended = () => { currentAudio = null; done(true); };
        a.onerror = () => { currentAudio = null; emit({ type: 'error', message: '音檔載入失敗：' + map[key] }); done(false); };
        a.play().then(() => { if (opts.onstart) opts.onstart(); }).catch(() => { currentAudio = null; done(false); });
        return;
      }
      // 2. 語音合成
      if (!hasAPI || !jaVoices.length) { emit({ type: 'novoice', status }); return resolve(false); }
      const u = new root.SpeechSynthesisUtterance(String(text));
      u.lang = 'ja-JP'; u.voice = pickVoice(); u.rate = opts.rate || rate; u.pitch = 1; u.volume = 1;
      keep.push(u); if (keep.length > 8) keep.shift();
      let started = false;
      const watchdog = setTimeout(() => { if (!started && my === token) { emit({ type: 'silent', message: '瀏覽器沒有開始朗讀（可能語音引擎尚未準備好或被系統靜音）。' }); } }, 4000);
      u.onstart = () => { started = true; clearTimeout(watchdog); if (opts.onstart) opts.onstart(); };
      u.onend = () => { clearTimeout(watchdog); done(true); };
      u.onerror = (e) => { clearTimeout(watchdog); if (e && (e.error === 'canceled' || e.error === 'interrupted')) return done(false); emit({ type: 'error', message: '朗讀失敗：' + (e && e.error) }); done(false); };
      try { synth.speak(u); } catch (e) { clearTimeout(watchdog); emit({ type: 'error', message: String(e) }); resolve(false); }
    });
  }
  function cancelCurrent() {
    if (currentAudio) { try { currentAudio.pause(); } catch (e) { /* ignore */ } currentAudio = null; }
    if (hasAPI) { try { synth.cancel(); } catch (e) { /* ignore */ } }
  }
  function stopAll() { token++; cancelCurrent(); Player.stop(true); }

  /* 單次播放（單字、單句按鈕）。回傳是否真的開始播放；不可用時顯示原因 */
  function speak(text, opts) {
    if (!available()) { emit({ type: 'novoice', status }); return Promise.resolve(false); }
    Player.stop(true);
    return speakOne(text, opts);
  }

  /* ---------- 有聲書播放器：逐句佇列 ----------
   * items: [{text, id}]；mode: 'normal' | 'follow'（跟讀：每句念完留空白讓使用者跟著念）
   * 狀態 state: idle | playing | paused | gap（跟讀等待中） | done
   */
  const Player = {
    items: [], i: 0, state: 'idle', mode: 'normal', rate: 1, repeat: 'none', gapMs: 1500, onUpdate: null, _run: 0, _gapTimer: null, _gapEnd: 0,
    load(items, opts) {
      this.stop(true); opts = opts || {};
      this.items = items || []; this.i = 0; this.state = 'idle';
      this.mode = opts.mode || 'normal'; this.rate = opts.rate || 1; this.repeat = opts.repeat || 'none'; this.onUpdate = opts.onUpdate || null;
      this._notify();
    },
    _notify() { if (this.onUpdate) this.onUpdate({ i: this.i, state: this.state, total: this.items.length, gapEnd: this._gapEnd }); },
    setMode(m) { this.mode = m; },
    setRate(r) { this.rate = r; },
    async _play() {
      const run = ++this._run;
      while (run === this._run && this.i < this.items.length) {
        this.state = 'playing'; this._notify();
        const it = this.items[this.i];
        const ok = await speakOne(it.text, { rate: this.rate });
        if (run !== this._run) return;
        if (!ok) { // 無法播放：停下來而不是跳過整篇
          if (!available()) { this.state = 'idle'; this._notify(); return; }
          if (this.state !== 'paused') { this.state = 'paused'; this._notify(); }
          return;
        }
        if (this.mode === 'follow') {
          const ms = Math.max(2000, Math.round(String(it.text).length * 420 * (1 / this.rate) * (this.gapMs / 1.4 / 1.0)));
          this.state = 'gap'; this._gapEnd = Date.now() + ms; this._notify();
          await new Promise(r => { this._gapTimer = setTimeout(r, ms); });
          if (run !== this._run) return;
        } else await new Promise(r => { this._gapTimer = setTimeout(r, 450); });
        if (run !== this._run) return;
        if (this.repeat === 'one') continue;
        this.i++;
        if (this.i >= this.items.length) {
          if (this.repeat === 'all') { this.i = 0; continue; }
          this.i = this.items.length - 1; this.state = 'done'; this._notify();
          if (this.onEnd) this.onEnd();
          return;
        }
      }
    },
    play() {
      if (!available()) { emit({ type: 'novoice', status }); return false; }
      if (!this.items.length) return false;
      if (this.state === 'done') this.i = 0;
      this._clearGap(); this._play(); return true;
    },
    pause() { if (this.state === 'playing' || this.state === 'gap') { this._run++; this._clearGap(); token++; cancelCurrent(); this.state = 'paused'; this._notify(); } },
    resume() { if (this.state === 'paused') this.play(); },
    stop(silent) { this._run++; this._clearGap(); if (this.state !== 'idle') { token++; cancelCurrent(); } this.state = 'idle'; if (!silent) { this.i = 0; } this._notify(); },
    replay() { this._run++; this._clearGap(); token++; cancelCurrent(); this.play(); },
    next() { this._jump(Math.min(this.items.length - 1, this.i + 1)); },
    prev() { this._jump(Math.max(0, this.i - 1)); },
    goto(n) { this._jump(Math.max(0, Math.min(this.items.length - 1, n))); },
    _jump(n) {
      const wasPlaying = this.state === 'playing' || this.state === 'gap';
      this._run++; this._clearGap(); token++; cancelCurrent();
      this.i = n; this.state = wasPlaying ? 'playing' : 'paused'; this._notify();
      if (wasPlaying) this.play();
    },
    _clearGap() { if (this._gapTimer) { clearTimeout(this._gapTimer); this._gapTimer = null; } }
  };

  /* 語音測試：確認真的有發出聲音（以 onstart 事件判斷） */
  function test() {
    return new Promise(resolve => {
      if (!hasAPI) return resolve({ ok: false, reason: 'unsupported' });
      if (!jaVoices.length) return resolve({ ok: false, reason: 'no-voice' });
      let started = false;
      const t = setTimeout(() => { if (!started) { cancelCurrent(); resolve({ ok: false, reason: 'silent' }); } }, 4500);
      speakOne('こんにちは。日本語の音声テストです。', { rate, onstart: () => { started = true; } }).then(ok => { clearTimeout(t); resolve({ ok: started && ok, reason: started ? 'ok' : 'silent', voice: (pickVoice() || {}).name }); });
    });
  }

  const Audio = { init, onChange, speak, speakOne, stopAll, Player, setVoice, setRate, getRate, getStatus, getVoices, available, statusMessage, test, pickVoice, hasMap };
  root.JPAudio = Audio;
  if (typeof module !== 'undefined') module.exports = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
