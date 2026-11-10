const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/app.js', 'utf8');
const extract = (name, next) => source.slice(source.indexOf('  function ' + name + '('), source.indexOf(next, source.indexOf('  function ' + name + '(')));
let opened;
const context = {
  navigate: (rel) => { opened = rel; },
  window: { location: {} },
  downloadURL: () => { throw new Error('Folder must not be downloaded'); },
  homeView: { querySelectorAll: () => [{ dataset: { title: 'Videos' }, textContent: 'VideosBrowse all', parentElement: { __fill: 'fill' } }] }
};
vm.createContext(context);
vm.runInContext(extract('openEntry', '  /* ---------- detail sheet'), context);
context.openEntry({ dir: true, rel: 'Movies/Nested' });
assert.equal(opened, 'Movies/Nested');
vm.runInContext(extract('findRow', '  function maybeFeature'), context);
assert.equal(context.findRow('Videos').fill, 'fill');
assert.equal(context.findRow('Missing'), null);
console.log('PASS: Home folders navigate; aggregate rows resolve despite Browse all button text.');
