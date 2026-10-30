import assert from 'node:assert/strict';

export function schemaSelection(toc) {
  return toc.split('\n').filter(line => {
    if (line.startsWith(';')) return true;
    if (/ SCHEMA - public /.test(line)) return false;
    // Preserve platform-owned schemas and default ACLs from the pinned target stack.
    if (/ DEFAULT ACL /.test(line) && !/ postgres\s*$/.test(line)) return false;
    if (/ (?:public|nasun_internal) /.test(line)) return true;
    // Auth sequences must follow restored rows or a subsequent login can collide.
    if (/ (?:TABLE DATA|SEQUENCE SET) auth /.test(line) && !/schema_migrations/.test(line)) return true;
    if (/ POLICY storage objects /.test(line)) return true;
    return / TRIGGER auth users on_auth_user_created /.test(line);
  }).join('\n');
}

export function orderAuthDataEntries(selected, dependencies) {
  const pending = selected.split('\n').filter(line => / TABLE DATA auth /.test(line));
  const tableName = line => `auth.${line.match(/ TABLE DATA auth (\w+) /)[1]}`;
  const ordered = [];
  while (pending.length) {
    const index = pending.findIndex(line => !dependencies.some(edge => edge.child === tableName(line)
      && edge.parent !== edge.child && pending.some(other => tableName(other) === edge.parent)));
    assert.notEqual(index, -1, 'Auth restore dependency cycle requires explicit review');
    ordered.push(pending.splice(index, 1)[0]);
  }
  return ordered.concat(selected.split('\n').filter(line => !/ TABLE DATA auth /.test(line))).join('\n');
}
