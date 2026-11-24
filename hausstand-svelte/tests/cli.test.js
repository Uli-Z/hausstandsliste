import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ledgerAt } from '../src/lib/ledger.js';
import { projectAt } from '../src/lib/projector.js';
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
