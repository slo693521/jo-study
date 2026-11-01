/* mocks.js — 模擬考設定。題目由 quizgen.js 依固定亂數種子從題庫產生（每次打開內容相同，方便比較成績）。
 * 兩回的單字題互不重複。本模擬考為自編練習，依 N5 公開題型分「文字・語彙／文法／讀解／聽解」，非正式考題。 */
window.JP_DATA = window.JP_DATA || {};
window.JP_DATA.mocks = [
  { id: 'M1', title: '模擬考（1）', seed: 1001, readings: ['R04', 'R08'], listening: ['T02', 'T04', 'T06', 'T08', 'T10', 'T14'], grammarOffset: { mc: 0, particle: 0, order: 0 } },
  { id: 'M2', title: '模擬考（2）', seed: 2002, readings: ['R10', 'R12'], listening: ['T03', 'T05', 'T07', 'T09', 'T12', 'T15'], grammarOffset: { mc: 7, particle: 6, order: 2 } }
];
