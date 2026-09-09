const fs = require('fs');

const branch = process.env.CF_PAGES_BRANCH;
const hash = process.env.CF_PAGES_COMMIT_SHA;

// 只有在 Cloudflare Pages 且不是 main 分支 (代表是 Test Deploy) 時才執行
if (branch && branch !== 'main' && hash) {
  const file = 'dist/version.js';
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    const shortHash = hash.substring(0, 7);
    const next = code.replace(
      /(var\s+APP_CACHE_SUFFIX\s*=\s*)(['"])[^'"]*\2/,
      `$1$2-${shortHash}$2`
    );
    if (next === code) {
      console.warn('[Test Deploy] APP_CACHE_SUFFIX not found in dist/version.js; cache name unchanged');
    } else {
      fs.writeFileSync(file, next);
      console.log(`\x1b[32m[Test Deploy]\x1b[0m Automatically bumped SW cache version with commit hash: ${shortHash}`);
    }
  }
}
