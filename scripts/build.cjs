const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { stampPreview } = require('./test-bump.js');
const digest = content => crypto.createHash('sha256').update(content).digest('hex');

function build({ source = path.resolve(__dirname, '..'), output = path.join(source, 'dist'), env = process.env } = {}) {
  source = path.resolve(source); output = path.resolve(output);
  if (source === output || source.startsWith(output + path.sep)) throw new Error('Output must not contain source');
  const files = new Map();
  function collect(directory) {
    for (const entry of fs.readdirSync(path.join(source, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) collect(relative);
      else if (entry.isFile()) files.set(relative, fs.readFileSync(path.join(source, relative)));
    }
  }
  for (const name of fs.readdirSync(source)) {
    if (/\.(html|js|css|webmanifest)$/.test(name) && name !== 'pwa-manifest.js') files.set(name, fs.readFileSync(path.join(source, name)));
  }
  for (const directory of ['icons', 'locales', 'vendor']) collect(directory);
  files.set('version.js', Buffer.from(stampPreview(files.get('version.js').toString(), env)));
  const byPath = ([a], [b]) => a < b ? -1 : a > b ? 1 : 0;
  const canonical = [...files].sort(byPath);
  const id = digest(JSON.stringify(canonical.map(([name, bytes]) => [name, digest(bytes)]))).slice(0, 24);
  files.set('sw.js', Buffer.from(files.get('sw.js') + '\n// Release ' + id + '\n'));
  const version = vm.runInNewContext(files.get('version.js') + '\n({version:APP_SEMVER,build:APP_BUILD,suffix:APP_CACHE_SUFFIX})');
  const pin = url => url + (url.includes('?') ? '&' : '?') + 'rev=' + id;
  for (const [name, bytes] of files) {
    if (name.endsWith('.html')) files.set(name, Buffer.from(bytes.toString().replace(/\b(src|href)="(\.\/[^"#]+)"/g, (_, attr, url) => `${attr}="${pin(url)}"`)));
  }
  const manifest = JSON.parse(files.get('manifest.webmanifest'));
  manifest.icons.forEach(icon => { icon.src = pin(icon.src); });
  files.set('manifest.webmanifest', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  const release = { schema: 1, id, ...version, assets: [...files].filter(([name]) => name !== 'sw.js')
    .sort(byPath).map(([name, bytes]) => ({ path: './' + name, sha256: digest(bytes) })) };
  files.set('pwa-manifest.js', Buffer.from('var PWA_RELEASE = ' + JSON.stringify(release) + ';\n'));
  fs.rmSync(output, { recursive: true, force: true });
  for (const [name, bytes] of files) {
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  }
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  return release;
}
if (require.main === module) { const release = build(); console.log('PWA release ' + release.id + ' (' + release.assets.length + ' assets)'); }
module.exports = { build };
