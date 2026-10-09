import { spawnSync } from 'node:child_process';

const url = process.argv[2];
if (url !== 'https://kythuat-staging.nasun.workers.dev') throw Error('STAGING_ONLY');
function cli(...args) {
  const result = spawnSync('npx', ['--yes', '--package', '@playwright/cli@0.1.22', 'playwright-cli', '-s=staging-shell', ...args], {
    encoding: 'utf8', timeout: 180000,
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/SUPABASE|PASSWORD|TOKEN|PASSPHRASE/.test(name))),
  });
  if (result.status !== 0 || result.stdout.includes('### Error')) throw Error('WEBKIT_SHELL_CHECK_FAILED');
}
try {
  cli('open', url, '--browser=webkit', '--device=iphone 12');
  cli('run-code', `async (page) => {
    await page.getByRole('heading', {name:'Đăng nhập hệ thống',exact:true}).waitFor();
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller, null, {timeout:60000});
    await page.context().setOffline(true);
    await page.reload();
    await page.getByRole('heading', {name:'Đăng nhập hệ thống',exact:true}).waitFor();
    await page.context().setOffline(false);
    await page.reload();
    await page.getByRole('heading', {name:'Đăng nhập hệ thống',exact:true}).waitFor();
  }`);
  console.log('WebKit iPhone 12 emulation: full login shell, offline reload and reconnect passed. Physical Safari acceptance remains separate.');
} finally { try { cli('close'); } catch { /* Preserve the verification result. */ } }
