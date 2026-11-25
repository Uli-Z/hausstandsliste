import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerAt } from '../src/lib/ledger.js';
import { projectAt } from '../src/lib/projector.js';
import { encryptProject, decryptProject } from '../src/lib/crypto.js';
import { readPortableVersion } from '../src/lib/versionHistory.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const bin = fileURLToPath(new URL('../bin/hausstand.mjs',import.meta.url));
const p = {schemaVersion:1,currency:'EUR',community:{name:'Test'},lastSavedAt:'2026-01-01T00:00:00Z',
  people:[{id:'a',name:'A'},{id:'b',name:'B'}],items:[{id:'i',name:'Chair'}],drafts:[],
  versionHistory:{format:'portable-v1',entries:[]},events:[
    {id:'a1',type:'person-added',personId:'a',date:'2026-01-01',order:1},
    {id:'b1',type:'person-added',personId:'b',date:'2026-01-01',order:2},
    {id:'buy',type:'item-added',itemId:'i',date:'2026-01-02',order:1,initialValue:123.45,
      valuation:{type:'fixed',minimumValue:0},shares:{a:1,b:1},financialMode:'derived',financedByPersonId:'a'},
    {id:'pay',type:'claim-settlement-recorded',date:'2027-01-01',order:1,amountCents:1248,
      debtorPersonId:'b',creditorPersonId:'a',settlementKind:'paid'}
  ]};
const run = (args,input=p) => spawnSync(process.execPath,[bin,...args],{input:JSON.stringify(input),encoding:'utf8'});
const query = (args,input=p) => {
  const r=run([...args,'--input','-','--json'],input);
  assert.equal(r.status,0,r.stderr); assert.equal(r.stderr,'');
  const result=JSON.parse(r.stdout); assert.equal(result.responseVersion,1); return result;
};
test('CLI help and version are discoverable without a project',()=>{
  assert.match(run(['--help']).stdout,/balances show/);
  assert.match(run(['items','show','--help']).stdout,/--id/);
  assert.match(run(['--version']).stdout,/^\d+\.\d+\.\d+/);
});
test('CLI file contract, stored snapshot and archive listing',()=>{
  assert.equal(query(['project','validate']).data.valid,true);
  assert.deepEqual(query(['project','show']).data,p);
  assert.deepEqual(query(['versions','list']).data.rows,[]);
});
test('CLI uses identical date-specific shared ledger and item projection',()=>{
  for (const date of ['2026-01-01','2026-01-02','2027-01-01']) {
    const result=query(['balances','show','--as-of',date]);
    const expected=ledgerAt(p,date);
    assert.deepEqual(result.data.proposals,expected.simplified);
    assert.deepEqual(result.data.claims,expected.claims);
    assert.deepEqual(result.data.balances.map(b=>b.balanceCents),['a','b'].map(id=>expected.balances.get(id)||0));
    const items=query(['items','list','--as-of',date]).data.rows;
    assert.deepEqual(items.map(i=>i.valueCents),projectAt(p,date).items.map(i=>Math.round(i.value*100)));
  }
});
test('CLI stable lists, pagination and detail',()=>{
  assert.equal(query(['people','list','--as-of','2026-01-02','--offset','1','--limit','1']).data.rows[0].id,'b');
  assert.equal(query(['items','show','--as-of','2026-01-02','--id','i']).data.initialValueCents,12345);
  assert.equal(query(['events','list','--limit','1']).data.rows[0].id,'pay');
});
test('CLI errors have stable codes, nonzero exits and empty stdout',()=>{
  for (const [args,input,code,status] of [
    [['items','list','--as-of','2026-02-30','--input','-'],p,'INVALID_DATE',2],
    [['items','show','--id','missing','--input','-'],p,'NOT_FOUND',5],
    [['project','validate','--input','-'],{},'UNSUPPORTED_PROJECT',4],
    [['project','show','--input','-'],{format:'hausstand-aesgcm-v1'},'INVALID_ENVELOPE',4],
    [['events','list','--limit','0','--input','-'],p,'USAGE',2]
  ]) {
    const r=run(args,input); assert.equal(r.status,status,r.stderr);
    assert.equal(r.stdout,''); assert.equal(JSON.parse(r.stderr).error.code,code);
  }
});

test('CLI payment dry run, explicit save, history, restore and output collision', async () => {
  const dir = mkdtempSync(join(tmpdir(),'hausstand-cli-'));
  try {
    const input=join(dir,'input.json'), payload=join(dir,'payment.json'), output=join(dir,'new.json'), restored=join(dir,'restored.json');
    const actual={date:'2026-05-01',amountCents:1234,debtorPersonId:'b',creditorPersonId:'a',settlementKind:'paid'};
    writeFileSync(input,JSON.stringify(p)); writeFileSync(payload,JSON.stringify(actual));
    const args=['payments','record','--input',input,'--payload',payload];
    const preview=run([...args,'--dry-run']);
    assert.equal(preview.status,0,preview.stderr);
    const dry=JSON.parse(preview.stdout);
    assert.equal(dry.source,'working'); assert.equal(dry.data.saved,false);
    assert.equal(dry.data.event.amountCents,1234); assert.equal(existsSync(output),false);
    assert.equal(run([...args,'--output',output]).status,2);
    const result=run([...args,'--output',output,'--confirm']);
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).data.saved,true);
    const next=JSON.parse(readFileSync(output,'utf8'));
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),p);
    assert.equal(next.events.length,p.events.length+1);
    assert.equal(next.events.at(-1).amountCents,1234);
    assert.equal(next.versionHistory.entries.length,1);
    const id=next.versionHistory.entries[0].id;
    assert.deepEqual((await readPortableVersion(next,id)).events,p.events);
    assert.deepEqual(ledgerAt(next,'2026-05-01').counterclaims.map(x=>x.amountCents),[1234]);
    const collision=run([...args,'--output',output,'--confirm']);
    assert.equal(collision.status,6); assert.equal(JSON.parse(collision.stderr).error.code,'OUTPUT_EXISTS');
    assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),next);
    assert.equal(run([...args,'--output',input,'--confirm']).status,6);
    const restoreArgs=['versions','restore','--input',output,'--id',id];
    const previewRestore=run([...restoreArgs,'--dry-run']);
    assert.equal(previewRestore.status,0,previewRestore.stderr);
    assert.deepEqual(JSON.parse(previewRestore.stdout).data.project.events,p.events);
    const restore=run([...restoreArgs,'--output',restored]);
    assert.equal(restore.status,0,restore.stderr);
    const back=JSON.parse(readFileSync(restored,'utf8'));
    assert.deepEqual(back.events,p.events);
    assert.equal(back.versionHistory.entries.length,2);
    assert.deepEqual(back.versionHistory.entries[0],next.versionHistory.entries[0]);
    assert.deepEqual((await readPortableVersion(back,back.versionHistory.entries[1].id)).events,next.events);
    assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),next);
    const damaged=structuredClone(next); damaged.versionHistory.entries[0].sha256='0'.repeat(64);
    writeFileSync(input,JSON.stringify(damaged));
    const corrupt=run([...args,'--output',join(dir,'corrupt.json'),'--confirm']);
    assert.equal(corrupt.status,4); assert.equal(JSON.parse(corrupt.stderr).error.code,'INVALID_ARCHIVE');
    assert.equal(existsSync(join(dir,'corrupt.json')),false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('CLI payment uses shared guard and rejects malformed payloads without writing', () => {
  const dir=mkdtempSync(join(tmpdir(),'hausstand-cli-'));
  try {
    const payload=join(dir,'payment.json'), output=join(dir,'new.json');
    const actual={date:'2026-05-01',amountCents:100,debtorPersonId:'missing',creditorPersonId:'a',settlementKind:'paid'};
    writeFileSync(payload,JSON.stringify(actual));
    const args=['payments','record','--input','-','--payload',payload,'--output',output,'--confirm'];
    const rejected=run(args);
    assert.equal(rejected.status,4,rejected.stderr);
    assert.equal(JSON.parse(rejected.stderr).error.code,'MUTATION_REJECTED');
    assert.equal(existsSync(output),false);
    for (const bad of [{...actual,amountCents:0},{...actual,date:'2026-02-30'},{...actual,itemId:'i'}]) {
      writeFileSync(payload,JSON.stringify(bad));
      const result=run(args); assert.equal(result.status,4,result.stderr);
      assert.equal(result.stdout,''); assert.equal(existsSync(output),false);
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('CLI shared person add and rename retain historical event and archive', async () => {
  const dir = mkdtempSync(join(tmpdir(),'hausstand-person-'));
  try {
    const input = join(dir,'project.json'), payload = join(dir,'payload.json'), added = join(dir,'added.json'), renamed = join(dir,'renamed.json');
    writeFileSync(input,JSON.stringify(p));
    writeFileSync(payload,JSON.stringify({name:'Clara',date:'2028-01-01'}));
    const args = ['people','add','--input',input,'--payload',payload];
    const preview=run([...args,'--dry-run']);
    assert.equal(preview.status,0,preview.stderr);
    assert.equal(JSON.parse(preview.stdout).data.event.type,'person-added');
    assert.equal(existsSync(added),false);
    const result=run([...args,'--output',added]);
    assert.equal(result.status,0,result.stderr);
    const next=JSON.parse(readFileSync(added,'utf8'));
    const person=next.people.at(-1);
    assert.equal(person.name,'Clara');
    assert.equal(projectAt(next,'2027-12-31').peopleById.get(person.id)?.active || false,false);
    assert.equal(projectAt(next,'2028-01-01').peopleById.get(person.id).active,true);
    assert.deepEqual((await readPortableVersion(next,next.versionHistory.entries[0].id)).events,p.events);
    writeFileSync(payload,JSON.stringify({personId:person.id,name:'Clara New'}));
    const rename=run(['people','rename','--input',added,'--payload',payload,'--output',renamed]);
    assert.equal(rename.status,0,rename.stderr);
    const final=JSON.parse(readFileSync(renamed,'utf8'));
    assert.equal(final.people.at(-1).name,'Clara New');
    assert.deepEqual(final.events,next.events);
    assert.equal(final.versionHistory.entries.length,2);
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),p);
    for (const bad of [{name:' a ',date:'2028-01-01'},{name:'D',date:'2028-02-30'},{name:' ',date:'2028-01-01'}]) {
      writeFileSync(payload,JSON.stringify(bad));
      const rejected=run([...args,'--dry-run']);
      assert.equal(rejected.status,4,rejected.stderr);
      assert.equal(JSON.parse(rejected.stderr).error.code,'INVALID_PERSON');
    }
    writeFileSync(payload,JSON.stringify({personId:'missing',name:'Other'}));
    assert.equal(run(['people','rename','--input',added,'--payload',payload,'--dry-run']).status,5);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('CLI membership changes preserve ownership, financial history and effective dates',()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-status-'));
  try {
    const input=join(dir,'p.json'), payload=join(dir,'payload.json'), out=join(dir,'out.json'), back=join(dir,'back.json');
    writeFileSync(input,JSON.stringify(p));
    const cmd=(kind,source,mode)=>run(['people',kind,'--input',source,'--payload',payload,...mode]);
    writeFileSync(payload,JSON.stringify({personId:'a',date:'2025-12-31'}));
    assert.equal(JSON.parse(cmd('deactivate',input,['--dry-run']).stderr).error.code,'INVALID_PERSON_STATUS');
    writeFileSync(payload,JSON.stringify({personId:'a',date:'2028-02-01',reason:'Moved'}));
    assert.equal(cmd('reactivate',input,['--dry-run']).status,4);
    const dry=cmd('deactivate',input,['--dry-run']);
    assert.equal(dry.status,0,dry.stderr);
    assert.equal(JSON.parse(dry.stdout).data.event.type,'person-deactivated');
    assert.equal(existsSync(out),false);
    const saved=cmd('deactivate',input,['--output',out]);
    assert.equal(saved.status,0,saved.stderr);
    const next=JSON.parse(readFileSync(out,'utf8'));
    assert.equal(projectAt(next,'2028-01-31').peopleById.get('a').active,true);
    assert.equal(projectAt(next,'2028-02-01').peopleById.get('a').active,false);
    assert.deepEqual(projectAt(next,'2028-02-01').items[0].shares,projectAt(p,'2028-02-01').items[0].shares);
    assert.deepEqual(ledgerAt(next,'2028-02-01').balances,ledgerAt(p,'2028-02-01').balances);
    assert.deepEqual(next.events.slice(0,-1),p.events);
    assert.equal(cmd('deactivate',out,['--dry-run']).status,4);
    writeFileSync(payload,JSON.stringify({personId:'a',date:'2028-02-01'}));
    const returned=cmd('reactivate',out,['--output',back]);
    assert.equal(returned.status,0,returned.stderr);
    const final=JSON.parse(readFileSync(back,'utf8'));
    assert.equal(projectAt(final,'2028-02-01').peopleById.get('a').active,true);
    assert.ok(final.events.at(-1).order>next.events.at(-1).order);
    assert.equal(final.versionHistory.entries.length,2);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('CLI deletion uses existing all-history guard and requires explicit confirmation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-delete-'));
  try {
    const input=join(dir,'p.json'), payload=join(dir,'payload.json'), out=join(dir,'out.json');
    const withUnused=structuredClone(p);
    withUnused.people.push({id:'c',name:'C'});
    withUnused.events.push({id:'c-in',type:'person-added',personId:'c',date:'2028-01-01',order:1});
    writeFileSync(input,JSON.stringify(withUnused));
    const cmd=(mode)=>run(['people','delete','--input',input,'--payload',payload,...mode]);
    writeFileSync(payload,JSON.stringify({personId:'a'}));
    assert.equal(JSON.parse(cmd(['--dry-run']).stderr).error.code,'PERSON_IN_USE');
    writeFileSync(payload,JSON.stringify({personId:'c'}));
    const draft=structuredClone(withUnused);
    draft.drafts.push({id:'future',data:{shares:{c:1}}});
    writeFileSync(input,JSON.stringify(draft));
    assert.equal(JSON.parse(cmd(['--dry-run']).stderr).error.code,'PERSON_IN_USE');
    writeFileSync(input,JSON.stringify(withUnused));
    const preview=cmd(['--dry-run']);
    assert.equal(preview.status,0,preview.stderr);
    assert.equal(JSON.parse(preview.stdout).data.deleted,true);
    assert.equal(JSON.parse(cmd(['--output',out]).stderr).error.code,'CONFIRM_REQUIRED');
    assert.equal(existsSync(out),false);
    const result=cmd(['--output',out,'--confirm']);
    assert.equal(result.status,0,result.stderr);
    const saved=JSON.parse(readFileSync(out,'utf8'));
    assert.deepEqual(saved.people,p.people);
    assert.deepEqual(saved.events,p.events);
    assert.deepEqual((await readPortableVersion(saved,saved.versionHistory.entries[0].id)).people,withUnused.people);
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),withUnused);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('CLI item lifecycle and redistribution use shared valuation, ownership and ledger',()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-items-'));
  try {
    const input=join(dir,'p.json'), payload=join(dir,'payload.json');
    writeFileSync(input,JSON.stringify(p));
    const call=(command,data,source,target)=>{
      writeFileSync(payload,JSON.stringify(data));
      return run([...command.split(' '),'--input',source,'--payload',payload,...(target?['--output',target]:['--dry-run'])]);
    };
    const purchase={name:'Desk',date:'2026-06-01',initialValueCents:30000,valuation:{type:'linear',durationYears:6,minimumValueCents:5000},shares:{a:1,b:1},financedByPersonId:'a'};
    const out=join(dir,'added.json');
    assert.equal(call('items add',{...purchase,shares:{missing:1}},input).status,4);
    assert.equal(call('items add',{...purchase,shares:{a:-1}},input).status,4);
    assert.equal(call('items add',{...purchase,valuation:{type:'linear',durationYears:0,minimumValueCents:0}},input).status,4);
    const preview=call('items add',purchase,input);
    assert.equal(preview.status,0,preview.stderr); assert.equal(existsSync(out),false);
    const result=call('items add',purchase,input,out);
    assert.equal(result.status,0,result.stderr);
    const id=JSON.parse(result.stdout).data.item.id;
    const added=JSON.parse(readFileSync(out,'utf8'));
    assert.equal(projectAt(added,'2026-06-01').items.find(i=>i.id===id).value,300);
    assert.equal(ledgerAt(added,'2026-06-01').claims.filter(c=>c.itemId===id)[0].amountCents,15000);
    const update=join(dir,'update.json');
    assert.equal(call('items update',{itemId:id,name:'New desk',tags:['office'],note:'Note'},out,update).status,0);
    const shares=join(dir,'shares.json');
    assert.equal(call('shares set',{itemId:id,date:'2026-07-01',shares:{a:1},financialMode:'none'},update,shares).status,0);
    assert.equal(call('shares set',{itemId:id,date:'2026-05-01',shares:{a:1},financialMode:'none'},update).status,4);
    const red=join(dir,'red.json');
    const re=call('redistribution execute',{effectiveDate:'2026-08-01',financialMode:'none',changes:[{itemId:id,shares:{b:1}},{itemId:'i',shares:{a:1}}]},shares,red);
    assert.equal(re.status,0,re.stderr);
    const redistributed=JSON.parse(readFileSync(red,'utf8'));
    assert.deepEqual(projectAt(redistributed,'2026-08-01').items.find(i=>i.id===id).shares,{b:1});
    assert.equal(redistributed.events.at(-1).events.length,2);
    const end=join(dir,'end.json');
    const cont=call('items continue',{itemId:id,name:'Successor',date:'2026-09-01',initialValueCents:10000,valuation:{type:'fixed',minimumValueCents:0},shares:{b:1}},red,end);
    assert.equal(cont.status,0,cont.stderr);
    const successor=JSON.parse(cont.stdout).data.item.id;
    const final=JSON.parse(readFileSync(end,'utf8'));
    assert.equal(projectAt(final,'2026-09-01').items.find(i=>i.id===id).status,'succeeded');
    assert.equal(final.items.find(i=>i.id===successor).predecessorItemId,id);
    const archived=join(dir,'archived.json');
    assert.equal(call('items end',{itemId:successor,date:'2026-10-01'},end,archived).status,0);
    assert.equal(projectAt(JSON.parse(readFileSync(archived,'utf8')),'2026-10-01').items.find(i=>i.id===successor).status,'ended');
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),p);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('packaged skill discovery, exact export and explicit replacement',()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-skill-'));
  try {
    const output=join(dir,'SKILL.md');
    const expected=readFileSync(new URL('../skills/hausstandsliste-cli/SKILL.md',import.meta.url),'utf8');
    assert.match(run(['--help']).stdout,/skill export/);
    assert.match(run(['skill','--help']).stdout,/--force/);
    assert.equal(run(['skill','show']).stdout,expected);
    assert.equal(run(['skill','export','--output','-']).stdout,expected);
    const saved=run(['skill','export','--output',output]);
    assert.equal(saved.status,0,saved.stderr);
    assert.equal(readFileSync(output,'utf8'),expected);
    writeFileSync(output,'old');
    assert.equal(run(['skill','export','--output',output]).status,6);
    assert.equal(readFileSync(output,'utf8'),'old');
    assert.equal(run(['skill','export','--output',output,'--force']).status,0);
    assert.equal(readFileSync(output,'utf8'),expected);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI encrypted roundtrip uses browser crypto and never saves plaintext',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-crypto-'));
  try {
    const input=join(dir,'p.json'), payload=join(dir,'payload.json'), out=join(dir,'out.json'), fresh=join(dir,'fresh.json');
    const secret='synthetic-test-passphrase';
    const original=await encryptProject(p,secret);
    writeFileSync(input,JSON.stringify(original));
    writeFileSync(payload,JSON.stringify({name:'Clara',date:'2028-01-01'}));
    const invoke=(args,password)=>spawnSync(process.execPath,[bin,...args],{encoding:'utf8',env:{...process.env,HAUSSTAND_PASSWORD:password||''}});
    const validate=['project','validate','--input',input];
    assert.equal(JSON.parse(invoke(validate,'').stderr).error.code,'PASSWORD_REQUIRED');
    assert.equal(JSON.parse(invoke(validate,'incorrect-password').stderr).error.code,'DECRYPT_FAILED');
    assert.equal(invoke(validate,secret).status,0);
    const result=invoke(['people','add','--input',input,'--payload',payload,'--output',out],secret);
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).data.encrypted,true);
    const envelope=JSON.parse(readFileSync(out,'utf8'));
    assert.equal(envelope.format,'hausstand-aesgcm-v1');
    assert.equal(envelope.people,undefined);
    const after=await decryptProject(envelope,secret);
    assert.equal(after.project.people.at(-1).name,'Clara');
    assert.equal(after.editToken,(await decryptProject(original,secret)).editToken);
    assert.deepEqual((await readPortableVersion(after.project,after.project.versionHistory.entries[0].id)).people,p.people);
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),original);
    writeFileSync(payload,JSON.stringify({name:'Fresh'}));
    const creation=invoke(['project','create','--payload',payload,'--output',fresh,'--encrypt'],secret);
    assert.equal(creation.status,0,creation.stderr);
    const newProject=(await decryptProject(JSON.parse(readFileSync(fresh,'utf8')),secret)).project;
    assert.equal(newProject.community.name,'Fresh');
    assert.equal(newProject.versionHistory.entries.length,0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('project create and full archive validation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-create-'));
  try {
    const out=join(dir,'new.json');
    const result=run(['project','create','--payload','-','--output',out],{name:'Fresh'});
    assert.equal(result.status,0,result.stderr);
    const project=JSON.parse(readFileSync(out,'utf8'));
    assert.equal(project.community.name,'Fresh');
    assert.equal(query(['project','validate'],project).data.scope,'file-and-archive');
    project.versionHistory.entries.push({id:'bad',sha256:'0'.repeat(64),encoding:'gzip-base64',data:'broken'});
    const corrupt=run(['project','validate','--input','-'],project);
    assert.equal(JSON.parse(corrupt.stderr).error.code,'INVALID_ARCHIVE');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI historical correction preserves event identity and independent payment facts',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-edit-'));
  try {
    const input=join(dir,'p.json'), payload=join(dir,'payload.json'), out=join(dir,'out.json'), paymentOut=join(dir,'pay.json'), removed=join(dir,'removed.json');
    writeFileSync(input,JSON.stringify(p));
    const edit=(source,id,mode)=>run(['events','edit','--input',source,'--id',id,'--payload',payload,...mode]);
    writeFileSync(payload,JSON.stringify({type:'person-added'}));
    assert.equal(JSON.parse(edit(input,'buy',['--dry-run']).stderr).error.code,'EVENT_MUTATION_REJECTED');
    writeFileSync(payload,JSON.stringify({initialValueCents:20000,valuation:{type:'fixed',minimumValueCents:0}}));
    const preview=edit(input,'buy',['--dry-run']);
    assert.equal(preview.status,0,preview.stderr);
    assert.equal(JSON.parse(preview.stdout).data.event.id,'buy');
    assert.equal(edit(input,'buy',['--output',out]).status,2);
    const result=edit(input,'buy',['--output',out,'--confirm']);
    assert.equal(result.status,0,result.stderr);
    const next=JSON.parse(readFileSync(out,'utf8'));
    assert.equal(next.events.find(e=>e.id==='buy').initialValue,200);
    assert.deepEqual(next.events.find(e=>e.id==='pay'),p.events.find(e=>e.id==='pay'));
    assert.equal(ledgerAt(next,'2027-01-01').claims[0].amountCents,10000);
    assert.equal(query(['events','show','--id','pay'],next).data.amountCents,1248);
    writeFileSync(payload,JSON.stringify({amountCents:1234,date:'2027-01-02'}));
    const pay=edit(out,'pay',['--output',paymentOut,'--confirm']);
    assert.equal(pay.status,0,pay.stderr);
    const paid=JSON.parse(readFileSync(paymentOut,'utf8'));
    assert.equal(paid.events.find(e=>e.id==='pay').amountCents,1234);
    assert.equal(ledgerAt(paid,'2027-01-01').counterclaims.length,0);
    const del=['events','delete','--input',paymentOut,'--id','buy'];
    assert.equal(run([...del,'--dry-run']).status,0);
    assert.equal(run([...del,'--output',removed]).status,2);
    const deletion=run([...del,'--output',removed,'--confirm']);
    assert.equal(deletion.status,0,deletion.stderr);
    assert.equal(JSON.parse(deletion.stdout).data.deleted,true);
    const final=JSON.parse(readFileSync(removed,'utf8'));
    assert.equal(final.events.some(e=>e.id==='buy'),false);
    assert.deepEqual(final.events.find(e=>e.id==='pay'),paid.events.find(e=>e.id==='pay'));
    assert.equal(final.versionHistory.entries.length,3);
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),p);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI draft creation, replacement, execution and deletion share browser draft operations',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hausstand-drafts-'));
  try {
    const input=join(dir,'p.json'), payload=join(dir,'payload.json'), a=join(dir,'a.json'), b=join(dir,'b.json'), c=join(dir,'c.json'), d=join(dir,'d.json'), e=join(dir,'e.json');
    writeFileSync(input,JSON.stringify(p));
    const put=(source,data,target)=>{
      writeFileSync(payload,JSON.stringify(data));
      return run(['drafts','put','--input',source,'--payload',payload,'--output',target]);
    };
    const initial={type:'item',title:'Draft',data:{effectiveDate:'2026-06-01'}};
    const first=put(input,initial,a);
    assert.equal(first.status,0,first.stderr);
    const draft=JSON.parse(first.stdout).data.draft;
    const aProject=JSON.parse(readFileSync(a,'utf8'));
    assert.equal(query(['drafts','show','--id',draft.id],aProject).data.title,'Draft');
    const exec=(source,id,mode)=>run(['drafts','execute','--input',source,'--id',id,...mode]);
    assert.equal(exec(a,draft.id,['--dry-run']).status,4,'incomplete draft cannot execute');
    const second=put(a,{...initial,id:draft.id,data:{...initial.data,name:'Table',initialValueCents:30000,
      valuation:{type:'fixed',minimumValueCents:0},shares:{a:1,b:1},financedByPersonId:'a'}},b);
    assert.equal(second.status,0,second.stderr);
    assert.equal(JSON.parse(second.stdout).data.draft.createdAt,draft.createdAt);
    assert.equal(exec(b,draft.id,['--dry-run']).status,0);
    assert.equal(exec(b,draft.id,['--output',c]).status,2);
    const applied=exec(b,draft.id,['--output',c,'--confirm']);
    assert.equal(applied.status,0,applied.stderr);
    const item=JSON.parse(applied.stdout).data.item;
    const cProject=JSON.parse(readFileSync(c,'utf8'));
    assert.equal(cProject.drafts.length,0);
    assert.equal(ledgerAt(cProject,'2026-06-01').claims.find(claim=>claim.itemId===item.id).amountCents,15000);
    const third=put(c,{type:'redistribution',title:'Transfer',effectiveDate:'2026-07-01',financialMode:'none',
      changes:[{itemId:item.id,shares:{b:1}}]},d);
    assert.equal(third.status,0,third.stderr);
    const red=JSON.parse(third.stdout).data.draft;
    const del=['drafts','delete','--input',d,'--id',red.id];
    assert.equal(run([...del,'--dry-run']).status,0);
    assert.equal(run([...del,'--output',e]).status,2);
    assert.equal(exec(d,red.id,['--dry-run']).status,0);
    const discard=run([...del,'--output',e,'--confirm']);
    assert.equal(discard.status,0,discard.stderr);
    const final=JSON.parse(readFileSync(e,'utf8'));
    assert.equal(final.drafts.length,0);
    assert.deepEqual(final.events,cProject.events);
    assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),p);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
