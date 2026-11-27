import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHistoryEvents, groupedHistoryAt } from '../src/lib/eventHistory.js';
const paid=(i,date='2025-01-02',kind='paid')=>({id:'p'+i,date,order:i,type:'claim-settlement-recorded',settlementKind:kind,amountCents:8500});
test('group by effective date and kind across interleaved events, not net balance',()=>{
  const events=Array.from({length:10},(_,i)=>paid(i));
  events.push(paid(20,'2025-01-02','external'),paid(21,'2025-01-02','waived'),paid(30,'2025-01-03'));
  events.push({id:'buy',type:'item-added',date:'2025-01-02',order:4,initialValue:100});
  const original=JSON.stringify(events);
  const groups=groupHistoryEvents(events);
  assert.deepEqual(groups.map(g=>[g.kind,g.count,g.totalCents]),[
    ['settlement:paid',1,8500],['settlement:waived',1,8500],['settlement:external',1,8500],
    ['settlement:paid',10,85000],['item-added',1,10000]]);
  assert.deepEqual(groups[3].events.map(e=>e.id),Array.from({length:10},(_,i)=>'p'+(9-i)));
  assert.equal(JSON.stringify(events),original);
});
test('preview limit counts whole groups, future marker never splits a day, parent events remain atomic',()=>{
  const events=Array.from({length:12},(_,i)=>({id:'buy'+i,date:'2025-01-'+String(i+1).padStart(2,'0'),order:1,type:'item-added',initialValue:50}));
  for(let i=0;i<20;i++)events.push(paid(i,'2025-01-12'));
  events.push({id:'group',date:'2025-01-11',type:'redistribution-executed',order:2,events:[{id:'child',type:'shares-set'}]});
  const h=groupedHistoryAt(events,'2025-01-12');
  assert.equal(h.recent.length,10);
  assert.equal(h.recent.find(g=>g.kind==='settlement:paid').count,20);
  assert.equal(h.pastEventCount,33);
  assert.equal(h.past.find(g=>g.kind==='redistribution-executed').count,1);
  const earlier=groupedHistoryAt(events,'2025-01-11');
  assert.equal(earlier.future.length,2);
  assert.equal(earlier.futureEventCount,21);
});
test('purchase group sums acquisition amounts and invalid monetary rows are not represented as zero',()=>{
  const groups=groupHistoryEvents([{id:'a',date:'2025-01-01',type:'item-added',initialValue:12.48},{id:'b',date:'2025-01-01',type:'item-added',initialValue:3.02}]);
  assert.equal(groups[0].totalCents,1550);
  assert.equal(groupHistoryEvents([{...paid(1),amountCents:undefined}])[0].totalCents,null);
});
