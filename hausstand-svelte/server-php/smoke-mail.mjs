// Real PHP HTTP requests with a local fake sendmail command: no email leaves CI.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { encryptProject, decryptProject, hashSecret, randomSecret } from '../src/lib/crypto.js';
import { emptyProject } from '../src/lib/domain.js';

async function freePort() {
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
for (const mode of ['accepted','rejected','disabled','invalid','preparation']) {
  const root=await mkdtemp(join(tmpdir(),'hausstand-mail-'));
  const port=await freePort();
  const script=join(root,'sendmail.sh');
  const logFile=join(root,'mail.log');
  const failFile=join(root,'reject');
  await writeFile(script,'#!/bin/sh\ncat >> "$HAUSSTAND_TEST_MAIL_LOG"\nprintf "\\n---END---\\n" >> "$HAUSSTAND_TEST_MAIL_LOG"\nif [ -f "$HAUSSTAND_TEST_MAIL_REJECT" ]; then exit 1; fi\nexit 0\n',{mode:0o700});
  if(mode==='rejected') await writeFile(failFile,'reject');
  const server=spawn('php',['-d','sendmail_path='+script,'-S','127.0.0.1:'+port,'-t','dist'],{
    env:{...process.env,HAUSSTAND_DATA_DIR:root,HAUSSTAND_ADMIN_TOKEN:'mail-test-admin',
      HAUSSTAND_BACKUP_EMAIL:mode==='disabled'?'':mode==='invalid'?'bad-address':'backup@example.test',
      HAUSSTAND_MAIL_FROM:mode==='disabled'?'':'sender@example.test',
      HAUSSTAND_TEST_MAIL_LOG:logFile,HAUSSTAND_TEST_MAIL_REJECT:failFile},
    stdio:['ignore','ignore','pipe']
  });
  let stderr='';
  server.stderr.on('data',data=>stderr+=data);
  const id='hausstand-hauptdatei';
  const token=randomSecret();
  const auth={'X-File-Token':token};
  const dir=join(root,'files',id);
  async function call(action,body=null,headers={}) {
    const url=new URL('http://127.0.0.1:'+port+'/hausstand.php');
    url.searchParams.set('api',action);
    if(action==='read') url.searchParams.set('id',id);
    const response=await fetch(url,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify({id,...body}):undefined});
    return {status:response.status,...await response.json()};
  }
  try {
    let ready=false;
    for(let i=0;i<80;i++){try{ready=(await call('config')).status===200;if(ready)break;}catch{} await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(ready,stderr);
    const envelope=await encryptProject(emptyProject(),'mail-test-password',token);
    const created=await call('create',{name:'Mail test',envelope,tokenHash:await hashSecret(token)},{'X-Hausstand-Admin':'mail-test-admin'});
    assert.equal(created.saveStatus,'saved',JSON.stringify(created));
    const checkout=await call('checkout',{expectedRevision:1},auth);
    const saving={...auth,'X-Lease-Token':checkout.leaseToken};
    if(mode==='preparation'){
      await rename(join(dir,'mail-queue'),join(dir,'old-mail-queue'));
      await writeFile(join(dir,'mail-queue'),'not a directory');
    }
    const changed={...emptyProject(),community:{name:'Committed '+mode}};
    const next=await encryptProject(changed,'mail-test-password',token);
    const result=await call('save',{expectedRevision:1,envelope:next},saving);
    assert.equal(result.status,200,JSON.stringify(result));
    assert.equal(result.saveStatus,'saved');
    assert.equal(result.revision,2);
    const expected=mode==='accepted'?'accepted':mode==='disabled'?'disabled':'failed';
    assert.equal(result.mailStatus,expected,JSON.stringify(result));
    if(mode==='rejected') assert.equal(result.mailErrorCode,'rejected');
    if(mode==='invalid') assert.equal(result.mailErrorCode,'configuration');
    if(mode==='preparation') assert.equal(result.mailErrorCode,'preparation');
    const current=await call('read');
    assert.equal(current.revision,2);
    assert.equal((await decryptProject(current.envelope,'mail-test-password')).project.community.name,changed.community.name);
    assert.equal((await call('save',{expectedRevision:1,envelope:next},saving)).status,409);
    assert.equal((await call('checkin',{},saving)).status,200);
    assert.equal((await call('retryMail',{expectedRevision:2})).status,403);
    assert.equal((await call('retryMail',{expectedRevision:1},auth)).status,409);
    if(mode==='rejected'){
      const cooling=await call('retryMail',{expectedRevision:2},auth);
      assert.equal(cooling.mailErrorCode,'cooldown');
      const metaPath=join(dir,'meta.json');
      const meta=JSON.parse(await readFile(metaPath,'utf8'));
      const entry=meta.mailQueue.find(e=>e.revision===2);
      assert.equal(entry.attempts,1);
      entry.lastAttempt=0;
      await writeFile(metaPath,JSON.stringify(meta));
      await rm(failFile);
    }
    if(mode==='preparation'){
      await rm(join(dir,'mail-queue'));
      await rename(join(dir,'old-mail-queue'),join(dir,'mail-queue'));
    }
    const retried=await call('retryMail',{expectedRevision:2},auth);
    assert.equal(retried.status,200,JSON.stringify(retried));
    assert.equal(retried.mailStatus,mode==='invalid'?'failed':mode==='disabled'?'disabled':'accepted');
    assert.equal((await call('read')).revision,2);
    assert.deepEqual((await call('read')).envelope,current.envelope);
    if(retried.mailStatus==='accepted'){
      const before=await readFile(logFile,'utf8');
      assert.match(before,/hausstand-2\.enc\.json/);
      assert.equal((await call('retryMail',{expectedRevision:2},auth)).mailStatus,'accepted');
      assert.equal(await readFile(logFile,'utf8'),before,'accepted revision must not be submitted twice');
    }
    if(mode==='disabled'||mode==='invalid') await assert.rejects(access(logFile));
    if(mode==='accepted'){
      const again=await call('checkout',{expectedRevision:2},auth);
      await mkdir(join(dir,'current-3.json'));
      const failure=await call('save',{expectedRevision:2,envelope:next},{...auth,'X-Lease-Token':again.leaseToken});
      assert.equal(failure.status,500,JSON.stringify(failure));
      assert.notEqual(failure.saveStatus,'saved');
      assert.equal((await call('read')).revision,2);
      const messages=await readFile(logFile,'utf8');
      assert.ok(!messages.includes('hausstand-3.enc.json'));
    }
    console.log('Q42 PHP mail smoke passed: '+mode);
  } finally {
    server.kill();
    await rm(root,{recursive:true,force:true});
  }
}
