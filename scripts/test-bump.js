const fs = require('fs');

function stampPreview(code, { CF_PAGES_BRANCH: branch, CF_PAGES_COMMIT_SHA: hash } = {}) {
  if (branch && branch !== 'main' && /^[a-f\d]{7,40}$/i.test(hash || '')) {
    return code.replace(/(var\s+APP_CACHE_SUFFIX\s*=\s*)(['"])[^'"]*\2/, `$1$2-${hash.substring(0, 7)}$2`);
  }
  return code;
}
if (require.main === module && fs.existsSync('dist/version.js')) fs.writeFileSync('dist/version.js', stampPreview(fs.readFileSync('dist/version.js', 'utf8'), process.env));
module.exports = { stampPreview };
