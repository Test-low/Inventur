'use strict';
// Verhindert gemischte GitHub-Pages-Stände: für die Besucher genügt index.html.
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

function inline(name, file, external, tag) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (new RegExp('</' + tag + '\\s*>', 'i').test(source))
    throw Error(file + ' enthält einen HTML-Endtag und kann nicht inline eingebettet werden.');
  const bundled = `  <${tag} data-holzoptix-bundle="${name}">\n${source.trimEnd()}\n  </${tag}>`;
  const previous = new RegExp(`  <${tag} data-holzoptix-bundle="${name}">[\\s\\S]*?<\\/${tag}>`);
  if (previous.test(html)) html = html.replace(previous, bundled);
  else if (external.test(html)) html = html.replace(external, bundled);
  else throw Error('Einbindestelle für ' + file + ' fehlt in index.html.');
}

inline('css', 'style.css', /  <link rel="stylesheet" href="\.\/style\.css\?v=[^\"]+">/, 'style');
inline('photo', 'photo.js', /  <script src="\.\/photo\.js\?v=[^\"]+" defer><\/script>/, 'script');
inline('app', 'app.js', /  <script src="\.\/app\.js\?v=[^\"]+" defer><\/script>/, 'script');

if (!html.includes("HolzOptiXAppVersion = '1.3.2'") || !html.includes("version:'1.3.2'"))
  throw Error('Versionsprüfung fehlgeschlagen – HTML wird nicht geschrieben.');
fs.writeFileSync(htmlPath, html);
console.log('OK: Vollständige Inventur v1.3.2 in index.html eingebettet (' + Buffer.byteLength(html) + ' Bytes).');
