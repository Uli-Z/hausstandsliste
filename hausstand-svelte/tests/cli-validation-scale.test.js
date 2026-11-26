import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPortableSave } from '../src/lib/versionHistory.js';
import { storedProjectProblem } from '../src/lib/projectValidation.js';

const bin = fileURLToPath(new URL('../bin/hausstand.mjs', import.meta.url));
const run = (args, payload) => spawnSync(process.execPath, [bin, ...args], {
  input: payload === undefined ? undefined : JSON.stringify(payload),
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000
});
const query = (args, payload) => {
  const r = run(args, payload);
  assert.equal(r.status, 0, r.stderr || String(r.error || ''));
  assert.equal(r.stderr, '');
  const response = JSON.parse(r.stdout);
  assert.equal(response.responseVersion, 1);
  return response.data;
};
const fixture = (count = 1) => ({
  schemaVersion: 1, currency: 'EUR', community: { name: 'Synthetic household' },
  lastSavedAt: '2026-01-01T00:00:00Z',
  people: [{id:'a',name:'Anna'},{id:'b',name:'Ben'}],
  items: Array.from({length: count}, (_,i) => ({ id:'i'+String(i).padStart(5,'0'), name:'Item '+i, tags:['inventory'] })),
  drafts: [], versionHistory: {format:'portable-v1', entries:[]},
  events: [
    {id:'a1',type:'person-added',personId:'a',date:'2026-01-01',order:1},
    {id:'b1',type:'person-added',personId:'b',date:'2026-01-01',order:2},
    ...Array.from({length:count}, (_,i) => ({
      id:'purchase'+i,type:'item-added',itemId:'i'+String(i).padStart(5,'0'),
      date:'2026-01-02',order:i+1,initialValue:10,valuation:{type:'fixed',minimumValue:0},
      shares:{a:1,b:1},financialMode:'derived',purchaseContributionsCents:{a:1000}
    })),
    {id:'payment',type:'claim-settlement-recorded',date:'2026-01-03',order:1,
      amountCents:100,debtorPersonId:'b',creditorPersonId:'a',settlementKind:'paid'}
  ]
});
test('explicit stored-data audit rejects corrupted historical rows without rewriting files', async () => {
  const cases = [
    p => p.people.push({...p.people[0]}),
    p => p.items.push({...p.items[0]}),
    p => p.events.push({...p.events[2]}),
    p => p.events[2].date='2026-02-30',
    p => p.events[2].order='1',
    p => p.events[2].initialValue=0.001,
    p => p.events[2].valuation={type:'linear',durationYears:0,minimumValue:0},
    p => p.events[2].shares={a:1,unknown:1},
    p => p.events[2].shares={a:-1,b:1},
    p => p.events[2].shares={},
    p => p.events[2].itemId='missing',
    p => p.events[2].purchaseContributionsCents={missing:1000},
    p => p.events[2].financialMode='invented',
    p => p.events[2].type='unknown',
    p => p.events.at(-1).amountCents=-100,
    p => p.events.at(-1).creditorPersonId='missing',
    p => p.events.push({id:'red',type:'redistribution-executed',date:'2026-01-04',order:1,
      financialMode:'none',events:[{id:'child',type:'shares-set',itemId:p.items[0].id,shareUnitDeltas:{missing:1}}]}),
    p => p.drafts.push({id:'draft',type:'item',data:{effectiveDate:'2026-01-01',shares:{a:-1}}})
  ];
  const dir = mkdtempSync(join(tmpdir(),'hausstand-audit-'));
  try {
    const file = join(dir,'input.json');
    assert.equal(storedProjectProblem(fixture()),null);
    for (const corrupt of cases) {
      const p=fixture(); corrupt(p);
      assert.ok(storedProjectProblem(p));
      writeFileSync(file,JSON.stringify(p));
      const previous=readFileSync(file);
      const r=run(['project','validate','--input',file]);
      assert.equal(r.status,4,r.stderr);
      assert.equal(r.stdout,'');
      assert.equal(JSON.parse(r.stderr).error.code,'INVALID_BUSINESS_DATA');
      assert.deepEqual(readFileSync(file),previous);
    }
    // A cryptographically valid archive may still contain invalid business data.
    const damaged=fixture(); damaged.events.at(-1).amountCents=-100;
    const archived=await createPortableSave(fixture(),damaged);
    assert.equal(storedProjectProblem(archived),null);
    assert.equal(JSON.parse(run(['project','validate','--input','-'],archived).stderr).error.code,'INVALID_ARCHIVE');

    // Explicit validation must not close off the repair path.
    writeFileSync(file,JSON.stringify(damaged));
    const before=readFileSync(file);
    const repaired=join(dir,'repaired.json');
    const edit=['events','edit','--input',file,'--id','payment','--payload','-'];
    assert.equal(query([...edit,'--dry-run'],{amountCents:100}).saved,false);
    assert.equal(existsSync(repaired),false);
    assert.equal(query([...edit,'--output',repaired,'--confirm'],{amountCents:100}).saved,true);
    assert.deepEqual(readFileSync(file),before);
    assert.equal(storedProjectProblem(JSON.parse(readFileSync(repaired,'utf8'))),null);
    // The prior invalid historical snapshot is retained, not silently erased.
    assert.equal(JSON.parse(run(['project','validate','--input',repaired]).stderr).error.code,'INVALID_ARCHIVE');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('large portable project: 1205 items, 35 archive snapshots, pagination, cent balances and safe save', {timeout:180000}, async () => {
  const count=1205, dir=mkdtempSync(join(tmpdir(),'hausstand-large-'));
  try {
    let p=fixture(count);
    for(let i=1;i<=35;i++) {
      const next=structuredClone(p);
      next.community.name='Synthetic version '+i;
      p=await createPortableSave(next,p);
    }
    const file=join(dir,'large.json'), output=join(dir,'next.json');
    writeFileSync(file,JSON.stringify(p));
    const before=readFileSync(file);
    const input=['--input',file];
    assert.equal(query(['project','validate',...input]).businessValidated,true);
    assert.equal(query(['versions','list',...input]).total,35);
    const first=query(['items','list',...input,'--as-of','2026-01-02','--limit','1000']);
    const second=query(['items','list',...input,'--as-of','2026-01-02','--limit','1000','--offset','1000']);
    assert.equal(first.total,count); assert.equal(first.rows.length,1000); assert.equal(second.rows.length,205);
    assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,count);
    const balances=query(['balances','show',...input,'--as-of','2026-01-03']).balances;
    assert.deepEqual(balances.map(r=>r.balanceCents),[count*500-100,-count*500+100]);
    const payment={date:'2026-01-04',amountCents:100,debtorPersonId:'b',creditorPersonId:'a',settlementKind:'paid'};
    const args=['payments','record',...input,'--payload','-'];
    assert.equal(query([...args,'--dry-run'],payment).saved,false);
    assert.equal(existsSync(output),false);
    assert.equal(query([...args,'--output',output,'--confirm'],payment).versionCount,36);
    assert.deepEqual(readFileSync(file),before);
    assert.equal(query(['project','validate','--input',output]).businessValidated,true);
    assert.deepEqual(query(['balances','show','--input',output,'--as-of','2026-01-04']).balances.map(r=>r.balanceCents),
      [count*500-200,-count*500+200]);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
