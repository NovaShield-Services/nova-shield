#!/usr/bin/env node
// Copy the official npm ESM graph, changing import paths only. No bundler,
// transpilation or remote CDN transformation. npm ci verifies registry SRI.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse, initSync } = require('es-module-lexer');
initSync();
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'shared/vendor');
const lock = require('../package-lock.json');
const roots = ['@supabase/supabase-js', '@capacitor/core', '@capacitor/app', '@capacitor/camera',
  '@capacitor/filesystem', '@capacitor/geolocation', '@capacitor/haptics', '@capacitor/share', '@capacitor/status-bar'];
const packages = {}, files = {}, seen = new Set();
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
function metadata(name, importer) {
  if (packages[name] && !importer) return packages[name];
  importer ||= ROOT;
  let parent = importer, base;
  while (parent.startsWith(ROOT)) {
    const candidate = path.join(parent, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) { base = candidate; break; }
    if (parent === ROOT) break;
    parent = path.dirname(parent);
  }
  if (!base) throw Error(`Missing installed dependency ${name}`);
  if (packages[name]) {
    if (packages[name].installedPath !== path.relative(ROOT, base).split(path.sep).join('/'))
      throw Error(`Multiple installed copies of ${name}; resolve the graph before vendoring`);
    return packages[name];
  }
  const pkg = require(path.join(base, 'package.json'));
  const locked = lock.packages[path.relative(ROOT, base).split(path.sep).join('/')];
  if (!locked || locked.version !== pkg.version || !locked.integrity) throw Error(`Unverified package ${name}`);
  const entry = pkg.module;
  if (!entry) throw Error(`No official ESM entry for ${name}`);
  packages[name] = { version: pkg.version, integrity: locked.integrity, entry, runtimeEntry: path.posix.normalize(entry).replace(/\.mjs$/, '.js'), installedPath: path.relative(ROOT, base).split(path.sep).join('/') };
  const license = fs.readdirSync(base).find(f => /^licen[sc]e(?:\.|$)/i.test(f));
  if (!license) throw Error(`Missing license for ${name}`);
  const dest = path.join(OUT, name, license);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(base, license), dest);
  files[path.relative(OUT, dest).split(path.sep).join('/')] = hash(fs.readFileSync(dest));
  return packages[name];
}
function visit(name, file) {
  const key = name + '/' + file;
  // .js participates in the existing production Caddy no-cache rule.
  // Only filenames/import paths change; official ESM syntax stays intact.
  const outputKey = path.posix.normalize(key).replace(/\.mjs$/, '.js');
  if (seen.has(key)) return outputKey;
  seen.add(key); metadata(name);
  const absolute = path.join(ROOT, metadata(name).installedPath, file);
  let body = fs.readFileSync(absolute, 'utf8');
  const imports = parse(body)[0];
  for (const item of imports.reverse()) {
    if (!item.n) {
      if (item.d >= 0) throw Error(`Computed vendor import cannot be packaged: ${key}`);
      continue; // import.meta is not a module dependency.
    }
    const spec = item.n;
    let dep = name, target;
    if (spec.startsWith('.')) {
      target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (!fs.existsSync(path.join(ROOT, metadata(dep).installedPath, target))) target += '.js';
    } else {
      if (/^(https?:|node:)/.test(spec)) throw Error(`Non-browser dependency ${key}: ${spec}`);
      const parts = spec.split('/');
      dep = spec.startsWith('@') ? parts.splice(0, 2).join('/') : parts.shift();
      const meta = metadata(dep, path.dirname(absolute));
      target = parts.length ? parts.join('/') : meta.entry;
    }
    const resolved = visit(dep, target);
    let relative = path.posix.relative(path.posix.dirname(outputKey), resolved);
    if (!relative.startsWith('.')) relative = './' + relative;
    // Dynamic import spans include quotes; static import spans do not.
    const replacement = item.d >= 0 ? JSON.stringify(relative) : relative;
    body = body.slice(0, item.s) + replacement + body.slice(item.e);
  }
  body = body.replace(/^\/\/# sourceMappingURL=.*$/gm, ''); // maps are not runtime assets
  const dest = path.join(OUT, outputKey);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  files[outputKey] = hash(body);
  return outputKey;
}
for (const name of roots) visit(name, metadata(name).entry);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ format: 1, packages, files }, null, 2) + '\n');
console.log(`Vendored ${Object.keys(packages).length} exact-version packages, ${Object.keys(files).length} files`);
