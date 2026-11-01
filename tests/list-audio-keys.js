#!/usr/bin/env node
/* list-audio-keys.js — 列出所有會被朗讀的日文句子（即 data/audiomap.js 的鍵），方便準備真人錄音檔。
 * 執行：node tests/list-audio-keys.js > audio-keys.txt */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => /^(js\/(jp|counters|dataindex)\.js|data\/)/.test(s))
  .forEach(s => vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), ctx, { filename: s }));
const { JP, JP_DATA: D, DataIndex } = ctx;
const idx = DataIndex.buildIndex(D);
const keys = new Set();
const add = src => keys.add(JP.sentence(src).text.replace(/\s+/g, ''));
idx.lessons.forEach(l => { (l.sentences || []).forEach(s => add(s[0])); if (l.dialogue) l.dialogue.lines.forEach(x => add(x[1])); });
idx.grammar.forEach(g => g.examples.forEach(e => add(e[0])));
idx.vocab.forEach(v => { keys.add(v.kana.replace(/^〜/, '')); if (v.ex) add(v.ex); });
(D.readings || []).forEach(r => r.lines.forEach(l => add(l[0])));
(D.listening || []).forEach(t => t.lines.forEach(l => add(l[1])));
console.log([...keys].join('\n'));
console.error(`共 ${keys.size} 個朗讀鍵`);
