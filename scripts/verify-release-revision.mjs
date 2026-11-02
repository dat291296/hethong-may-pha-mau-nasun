import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyReleaseRevision(env, request = fetch) {
  const sha = env.RELEASE_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha || '') || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SHA !== sha || env.GITHUB_REPOSITORY !== 'dat291296/hethong-may-pha-mau-nasun'
    || !env.GITHUB_TOKEN) throw new Error('RELEASE_REVISION_CONTEXT_REJECTED');
  const response = await request('https://api.github.com/repos/dat291296/hethong-may-pha-mau-nasun/branches/main', {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) throw new Error('RELEASE_REVISION_LOOKUP_FAILED');
  if ((await response.json())?.commit?.sha !== sha) throw new Error('RELEASE_MAIN_MOVED');
  return sha;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyReleaseRevision(process.env).then(sha => console.log(`Approved main revision verified: ${sha}`))
    .catch(() => { console.error('Release revision verification failed; no next release step is authorized.'); process.exitCode = 1; });
}
