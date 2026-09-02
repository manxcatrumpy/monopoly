const fs = require('fs');

const branch = process.env.CF_PAGES_BRANCH;
const hash = process.env.CF_PAGES_COMMIT_SHA;

// 只有在 Cloudflare Pages 且不是 main 分支 (代表是 Test Deploy) 時才執行
if (branch && branch !== 'main' && hash) {
  const file = 'dist/sw.js';
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    // 使用正則表達式尋找 const CACHE = '...'; 並在最後面加上 commit hash
    const shortHash = hash.substring(0, 7);
    code = code.replace(/(const\s+CACHE\s*=\s*['"][^'"]+)(['"])/, `$1-${shortHash}$2`);
    fs.writeFileSync(file, code);
    console.log(`\x1b[32m[Test Deploy]\x1b[0m Automatically bumped SW cache version with commit hash: ${shortHash}`);
  }
}
