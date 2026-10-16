// 流程 adapter 載入與 HTML 相同的 UI 模組，不替換任何功能實作。
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const uiFiles = Array.from(fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .matchAll(/<script src="\.\/(ui-[\w-]+\.js)"/g), match => match[1]);
module.exports = { uiFiles };
