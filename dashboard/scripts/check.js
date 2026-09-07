const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const dir of ['', 'api', 'lib', 'scripts']) {
  for (const file of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', path.join(root, dir, file)], { stdio: 'inherit' });
  }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, file] of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
  if (!file.startsWith('http') && !fs.existsSync(path.join(root, file))) throw Error(`Missing ${file}`);
}
console.log('JavaScript and dashboard assets checked. Static app ready for Vercel.');
