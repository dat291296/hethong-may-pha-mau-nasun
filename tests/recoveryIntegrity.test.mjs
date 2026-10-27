import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createRecoveryIntegrity,verifyRecoveryIntegrity} from '../scripts/recovery-integrity.mjs';
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'nasun-recovery-'));
 t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('nasun-recovery-'));return rm(directory,{recursive:true,force:true});});
 await mkdir(join(directory,'storage'));for(const name of ['database.dump','roles.sql','storage/manifest.json'])await writeFile(join(directory,name),'Synthetic archive data');return directory;}
test('recovery manifest binds database roles and Storage without claiming a restore',async t=>{
 const directory=await fixture(t);assert.deepEqual(await createRecoveryIntegrity(directory),{files:3,fullRestoreVerified:false});assert.deepEqual(await verifyRecoveryIntegrity(directory),{files:3,fullRestoreVerified:false});
});
test('missing, changed and unexpected archive components fail verification',async t=>{
 for(const mode of ['changed','missing','extra']){const directory=await fixture(t);await createRecoveryIntegrity(directory);
 if(mode==='changed')await writeFile(join(directory,'database.dump'),'Changed');if(mode==='missing')await rm(join(directory,'roles.sql'));if(mode==='extra')await writeFile(join(directory,'unexpected'),'Extra');
 await assert.rejects(verifyRecoveryIntegrity(directory));}
});
