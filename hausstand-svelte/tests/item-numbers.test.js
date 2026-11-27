import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, normalize } from '../src/lib/domain.js';
import { collectItemNumbers, applyItemNumbers, nextItemNumber, itemNumberMutationProblem } from '../src/lib/itemNumbers.js';
import { addItem, updateItemMetadata, endItem } from '../src/lib/itemMutations.js';
import { createSessionUndo } from '../src/lib/sessionUndo.js';
import { createPortableSave, readPortableVersion, verifyPortableHistory } from '../src/lib/versionHistory.js';
import { projectAt } from '../src/lib/projector.js';
import { itemDisplayName } from '../src/lib/itemNames.js';

const base=()=>({...emptyProject(),people:[{id:'p',name:'P'}],events:[{id:'join',type:'person-added',personId:'p',date:'2025-01-01',order:1}]});
const payload=(name,date='2025-03-01')=>({name,date,initialValue:100,valuation:{type:'fixed'},shares:{p:1},purchaseContributionsCents:{p:10000}});
test('numbers follow creation, not acquisition date or name; deletion retains reservation',()=>{
  const p=base();
  const a=addItem(p,payload('Sofa')).item;
  const b=addItem(p,payload('Sofa','2025-02-01')).item;
  assert.deepEqual([a.number,b.number],[1,2]);
  updateItemMetadata(p,{itemId:a.id,name:'New sofa'});
  endItem(p,{itemId:a.id,date:'2025-04-01'});
  assert.equal(itemDisplayName(projectAt(p,'2025-05-01').items.find(i=>i.id===a.id)),'#1 New sofa');
  assert.equal(projectAt(p,'2025-02-15').items[0].number,2);
  p.items=p.items.filter(i=>i.id!==a.id);
  p.events=p.events.filter(e=>e.itemId!==a.id);
  const c=addItem(p,payload('Sofa')).item;
  assert.equal(c.number,3);
  assert.equal(p.itemNumberRegistry.length,3);
});
test('undo and branching never reuse allocated numbers; redo retains identity',()=>{
  const p=base(), undo=createSessionUndo();
  const a=structuredClone(p); const item=addItem(a,payload('One')).item;
  undo.record(p,a);
  const back=undo.undo(a);
  assert.equal(back.items.length,0);
  assert.equal(undo.redo(back).items[0].number,item.number);
  const backAgain=undo.undo(a);
  const next=addItem(backAgain,payload('Two')).item;
  assert.equal(next.number,2);
});
test('legacy archive and restore share a registry without rewriting compressed entries',async()=>{
  const old={...base(),items:[{id:'old',name:'Old'}],lastSavedAt:'2025-01-01T00:00:00Z',versionHistory:{format:'portable-v1',entries:[]}};
  const fresh={...old,items:[{id:'new',name:'New'}]};
  const saved=await createPortableSave(fresh,old);
  const json=JSON.parse(JSON.stringify(saved));
  const entry=json.versionHistory.entries[0];
  const bytes=entry.data;
  await verifyPortableHistory(json);
  const restored=await readPortableVersion(json,entry.id);
  const oldNumber=restored.items[0].number;
  const newNumber=json.items[0].number;
  assert.notEqual(oldNumber,newNumber);
  assert.deepEqual(restored.itemNumberRegistry,json.itemNumberRegistry);
  assert.equal(json.versionHistory.entries[0].data,bytes);
  assert.equal(nextItemNumber(restored,'later').at(-1).number,3);
});
test('reject conflicting or reassigned numbers and preserve old unnumbered import order',()=>{
  const p=normalize({...base(),items:[{id:'b',name:'B'},{id:'a',name:'A'}]});
  assert.deepEqual(p.items.map(i=>i.number),[1,2]);
  assert.throws(()=>collectItemNumbers([{items:[{id:'a',number:1},{id:'b',number:1}]}]));
  const changed=structuredClone(p); changed.items[0].number=3;
  assert.equal(itemNumberMutationProblem(p,changed),true);
  const deleted=structuredClone(p); deleted.items=[]; deleted.itemNumberRegistry=[];
  assert.equal(itemNumberMutationProblem(p,deleted),true);
});

test('legacy items receive numbers by item-added date, same-day order, then stable event ID',()=>{
  const items=['late','sameB','early','sameA','undated'].map(id=>({id,name:id}));
  const events=[
    {id:'e-late',type:'item-added',itemId:'late',date:'2025-04-01',order:1},
    {id:'e-b',type:'item-added',itemId:'sameB',date:'2025-02-01',order:2},
    {id:'e-a',type:'item-added',itemId:'sameA',date:'2025-02-01',order:1},
    {id:'e-early',type:'item-added',itemId:'early',date:'2025-01-01',order:9}
  ];
  const legacy={items,events};
  const migrated=applyItemNumbers(legacy);
  assert.deepEqual(migrated.itemNumberRegistry.map(r=>r.id),['early','sameA','sameB','late','undated']);
  assert.deepEqual(applyItemNumbers(JSON.parse(JSON.stringify(migrated))),migrated);
  const mixed={items:[{id:'late',name:'Late',number:7},...items.filter(i=>i.id!=='late')],events};
  const assigned=applyItemNumbers(mixed);
  assert.equal(assigned.items[0].number,7);
  assert.equal(assigned.items.find(i=>i.id==='early').number,8);
});
test('migration includes saved baseline-only records and prefers corrected current dates',()=>{
  const old={items:[{id:'gone'},{id:'current'}],events:[
    {id:'g',type:'item-added',itemId:'gone',date:'2025-02-01'},
    {id:'c',type:'item-added',itemId:'current',date:'2025-03-01'}]};
  const current={items:[{id:'current'}],events:[{id:'c',type:'item-added',itemId:'current',date:'2025-01-01'}]};
  assert.deepEqual(collectItemNumbers([old,current]),[{id:'current',number:1},{id:'gone',number:2}]);
});
