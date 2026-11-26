import test from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst, splitHistoryAt } from '../src/lib/eventHistory.js';
import { projectAt } from '../src/lib/projector.js';
import { ledgerAt } from '../src/lib/ledger.js';
const entries = [
 {id:'start',date:'2026-01-01',order:1},
 {id:'first-future',date:'2028-04-01',order:2},
 {id:'past',date:'2026-03-04',order:1},
 {id:'newest',date:'2029-01-01',order:1},
 {id:'same-1',date:'2028-04-01',order:2},
 {id:'cutoff',date:'2027-06-01',order:1},
 {id:'higher-order',date:'2028-04-01',order:3},
 {id:'same-2',date:'2028-04-01',order:2}
];
const ids=arr=>arr.map(e=>e.id);
test('Q14: future and past histories are both newest first, including equal days',()=>{
 const order=['newest','higher-order','same-2','same-1','first-future','cutoff','past','start'];
 assert.deepEqual(ids(newestFirst(entries)),order);
 const first=splitHistoryAt(entries,'2027-06-01');
 assert.deepEqual(ids(first.future),order.slice(0,5));
 assert.deepEqual(ids(first.past),order.slice(5));
 assert.deepEqual(ids(splitHistoryAt(entries,'2030-01-01').past),order);
 assert.deepEqual(ids(splitHistoryAt(entries,'2026-01-01').future),order.slice(0,-1));
 assert.equal(entries[0].id,'start','sorting must not mutate project events');
});
test('Q14: future settlement and ownership events remain outside historical calculations',()=>{
 const p={people:[{id:'a',name:'A'},{id:'b',name:'B'}],items:[{id:'item',name:'Item'}],events:[
 {id:'buy',type:'item-added',itemId:'item',date:'2026-01-01',order:1,initialValue:100,
 valuation:{type:'fixed',minimumValue:0},shares:{a:1,b:1},financialMode:'derived',purchaseContributionsCents:{a:10000}},
 {id:'payment',type:'claim-settlement-recorded',date:'2029-01-01',order:1,amountCents:5000,
 debtorPersonId:'b',creditorPersonId:'a',settlementKind:'paid'},
 {id:'transfer',type:'shares-set',itemId:'item',date:'2030-01-01',order:1,shareUnitDeltas:{a:-1},financialMode:'none'}
 ]};
 assert.deepEqual(projectAt(p,'2026-12-31').activeItems[0].shares,{a:1,b:1});
 assert.equal(ledgerAt(p,'2026-12-31').counterclaims.length,0);
 assert.equal(ledgerAt(p,'2029-01-01').counterclaims.length,1);
 assert.deepEqual(projectAt(p,'2030-01-01').activeItems[0].shares,{b:1});
});
