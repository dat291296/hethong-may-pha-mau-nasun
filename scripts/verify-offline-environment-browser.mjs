import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createOfflinePreviewServer } from './serve-offline-preview.mjs';
const engine=process.env.UI_TEST_ENGINE||'chrome';
if(!['chrome','webkit'].includes(engine))throw Error('INVALID_TEST_ENGINE');
const session=`nasun-stage1-${engine}-${Date.now()}`;
let instance;
let browserOpened=false;
async function cli(...args) {
  return new Promise((accept,reject)=>{
    const child=spawn('npx',['--yes','--package','@playwright/cli@0.1.22','playwright-cli',`-s=${session}`,...args],{
      env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/SUPABASE|VITE_|PASSWORD|TOKEN|PASSPHRASE|SECRET|API_KEY/.test(key))),stdio:['ignore','pipe','pipe'],
    });
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('STAGE1_BROWSER_TIMEOUT'));},150000);
    child.stdout.on('data',chunk=>{if(output.length<200000)output+=chunk;});child.stderr.on('data',chunk=>{if(output.length<200000)output+=chunk;});
    child.on('error',()=>{clearTimeout(timer);reject(Error('STAGE1_BROWSER_UNAVAILABLE'));});
    child.on('close',code=>{clearTimeout(timer);if(code===0&&!output.includes('### Error'))accept();else{
      const diagnostic=output.match(/UI_[A-Z_]+|FIELD_[A-Z_]+|STAGE1_[A-Z_]+|TimeoutError|SyntaxError|TypeError|strict mode violation/);
      if(diagnostic)console.error(`Isolated browser diagnostic: ${diagnostic[0]}`);
      reject(Error('STAGE1_BROWSER_CHECK_FAILED'));
    }});
  });
}
try {
  instance=await createOfflinePreviewServer({port:0});
  await cli('open',`${instance.origin}/regression.html`,`--browser=${engine}`);
  browserOpened=true;
  await cli('run-code',`async page=>{
    let checkpoint='REGRESSION';try{
    await page.locator('#result[data-complete="true"]').waitFor({timeout:60000});
    const report=JSON.parse(await page.locator('#result').textContent());
    if(report.passed!==true || report.backendConnected!==false || Object.keys(report.checks).length<32 || Object.values(report.checks).some(value=>value!==true))throw Error('STAGE1_BROWSER_REGRESSION');
    await page.reload();
    await page.locator('#result[data-passed="true"]').waitFor({timeout:60000});
    await page.context().setOffline(true);
    await page.getByRole('button',{name:'Đọc lại nháp khi mất mạng',exact:true}).click();
    await page.locator('#offline-read-result[data-passed="true"]').waitFor();
    await page.context().setOffline(false);
    await page.getByRole('button',{name:'Kiểm tra kết nối trở lại',exact:true}).click();
    await page.locator('#reconnect-result[data-passed="true"]').waitFor();
    await page.setViewportSize({width:390,height:844});
    checkpoint='FIELD_START';
    await page.goto('${instance.origin}/');
    await page.getByRole('button',{name:'Nghiệp vụ mới',exact:true}).click();
    await page.getByLabel('Nội dung nghiệp vụ mới',{exact:true}).fill('Synthetic field materials with spaces');
    await page.getByLabel('Tình huống mạng',{exact:true}).selectOption('lost');
    checkpoint='FIELD_LOST_ACK';
    await page.getByRole('button',{name:'Lưu vào hàng chờ',exact:true}).click();
    await page.getByRole('button',{name:'Gửi / thử lại cùng mã',exact:true}).click();
    await page.getByText('Server mô phỏng ghi 1 lần.',{exact:false}).waitFor();
    await page.getByLabel('Tình huống mạng',{exact:true}).selectOption('online');
    checkpoint='FIELD_ACK';
    await page.getByRole('button',{name:'Gửi / thử lại cùng mã',exact:true}).click();
    if(!/Hàng chờ\\s*0/.test(await page.locator('.stats').last().textContent()))throw Error('FIELD_OUTBOX_NOT_ACKNOWLEDGED');
    await page.getByLabel('Giả lập hết dung lượng khi lưu hàng chờ',{exact:true}).check();
    checkpoint='FIELD_QUOTA';
    await page.getByLabel('Nội dung nghiệp vụ mới',{exact:true}).fill('Synthetic changed field notes');
    await page.getByRole('button',{name:'Lưu vào hàng chờ',exact:true}).click();
    await page.getByText('Không lưu được hàng chờ. Nội dung còn trên màn hình, chưa được coi là đã lưu.',{exact:true}).waitFor();
    await page.getByLabel('Giả lập hết dung lượng khi lưu hàng chờ',{exact:true}).uncheck();
    checkpoint='FIELD_REVIEW';
    await page.getByRole('button',{name:'Đồng nghiệp sửa phiếu',exact:true}).click();
    await page.getByRole('button',{name:'Lưu vào hàng chờ',exact:true}).click();
    await page.getByRole('button',{name:'Gửi / thử lại cùng mã',exact:true}).click();
    await page.getByRole('button',{name:'Giữ bản gốc để đối chiếu và làm lại',exact:true}).click();
    await page.getByText('Bản gốc đã giữ trên thiết bị (1)',{exact:true}).waitFor();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('FIELD_MOBILE_OVERFLOW');
    }catch(error){throw Error('UI_'+checkpoint+'_'+(String(error.message).includes('strict mode')?'STRICT_LOCATOR':error.name==='TimeoutError'?'TIMEOUT':/FIELD_[A-Z_]+/.exec(error.message)?.[0]||'CHECK_FAILED'));}
  }`);
  await mkdir('output/stage1-evidence',{recursive:true});
  await writeFile(`output/stage1-evidence/${engine}.json`,JSON.stringify({passed:true,engine,commit:process.env.GITHUB_SHA||null,
    synthetic:true,backendConnected:false,realSafariVerified:false,fullSupabaseRestoreVerified:false,
    browserNetworkOfflineVerified:true,
    newFieldOutboxUiVerified:true,mobileViewport:{width:390,height:844},minimumRegressionChecks:32,
    scope:'Schema v3 fixture -> page reload -> current storage, old/future queue compatibility, owner isolation, lease, network faults and offline/reconnect in browser context',
  },null,2));
  console.log(`[stage1] ${engine} isolated browser environment passed; real Safari and live restore remain separate.`);
} catch {console.error('STAGE1_BROWSER_VERIFICATION_FAILED');process.exitCode=1;}
finally {if(browserOpened)await cli('close').catch(()=>{});await instance?.close();}
