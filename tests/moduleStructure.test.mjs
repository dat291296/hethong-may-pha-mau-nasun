import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(target) : /\.(?:js|jsx|css)$/.test(entry.name) ? [target] : [];
  }));
  return groups.flat();
}

test('source imports resolve after module reorganization', async () => {
  for (const file of await sources(root)) {
    const source = await readFile(file, 'utf8');
    const imports = source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*|url\(\s*)['"](\.[^'"\n]+)['"]/g);
    for (const [, specifier] of imports) {
      const target = path.resolve(path.dirname(file), specifier);
      const matches = await Promise.all(['', '.js', '.jsx', '.css'].map(extension => stat(target + extension).then(info => info.isFile(), () => false)));
      assert.ok(matches.some(Boolean), `${path.relative(root, file)}: ${specifier}`);
    }
  }
});

test('feature modules do not depend on the application shell', async () => {
  for (const file of await sources(path.join(root, 'modules'))) {
    const source = await readFile(file, 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"\n]+)['"]/g)) {
      const relative = path.relative(path.join(root, 'app'), path.resolve(path.dirname(file), specifier));
      assert.ok(relative.startsWith('..'), `${path.relative(root, file)} imports application code`);
    }
  }
});

test('generic search, regions and draft expiry remain independent of feature modules', async () => {
  for (const relative of ['shared/utils/searchText.js', 'shared/utils/draftExpiry.js', 'shared/workspace/regions.js']) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /modules\//, relative);
  }
});
