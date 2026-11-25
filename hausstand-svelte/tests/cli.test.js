import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerAt } from '../src/lib/ledger.js';
import { projectAt } from '../src/lib/projector.js';
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
    [['project','show','--input','-'],{format:'hausstand-aesgcm-v1'},'ENCRYPTED_UNSUPPORTED',4],
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
