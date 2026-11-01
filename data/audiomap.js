/* audiomap.js — 正式錄音檔對照表（預設為空：本系統沒有附任何錄音，也不宣稱有真人錄音）
 *
 * 如果你有自己的日文音檔（例如請日本朋友錄、或使用授權許可的教材音檔），可以這樣替換 TTS：
 *   window.JP_AUDIO_MAP = {
 *     'はじめまして。': 'audio/hajimemashite.mp3',
 *     '私は学生です。': 'audio/watashi-gakusei.mp3'
 *   };
 * 鍵（key）是「日文原文去掉所有空白」的字串（與朗讀時的文字完全相同），值是相對於 index.html 的音檔路徑。
 * 有對應音檔的句子會優先播放音檔，其餘仍使用瀏覽器語音。可用 tests/list-audio-keys.js 列出所有需要錄音的句子。
 */
window.JP_AUDIO_MAP = window.JP_AUDIO_MAP || {};
