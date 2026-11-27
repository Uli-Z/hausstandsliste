import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAt } from '../src/lib/projector.js';
import { nameEntries, rankedItems, ownerNames, eventPeople, itemPeople, visibleNames, nameRoleGroups } from '../src/lib/overviewNames.js';

test('Q29: cap, stable ordering, no mutation and full list',()=>{
  for(const n of [0,1,10,11,100]){
    const entries=Array.from({length:n},(_,i)=>({id:String(i),name:'Person '+String(i).padStart(3,'0')})).reverse();
    const sorted=nameEntries(entries);
    assert.equal(visibleNames(sorted).visible.length,Math.min(n,10));
    assert.equal(visibleNames(sorted).remaining,Math.max(0,n-10));
    assert.deepEqual(visibleNames(sorted,true).visible,sorted);
    assert.deepEqual(entries.map(p=>p.id),Array.from({length:n},(_,i)=>String(n-1-i)));
  }
  assert.deepEqual(rankedItems([{id:'z',name:'Same',value:1},{id:'a',name:'Same',value:1},{id:'x',name:'X',value:2}]).map(x=>x.id),['x','a','z']);
});
test('Q29: ranking uses projected value, active status and dated ownership, historical funders retained',()=>{
 const buy={id:'buy',type:'item-added',itemId:'i',date:'2020-01-01',order:1,initialValue:1000,valuation:{type:'linear',durationYears:1,minimumValue:0},shares:{a:2,b:1},purchaseContributionsCents:{c:100000},financialMode:'derived'};
 const project={people:[{id:'a',name:'Anna'},{id:'b',name:'Ben'},{id:'c',name:'Chris'}],items:[{id:'i',name:'Old'},{id:'j',name:'New'}],events:[buy,
 {id:'new',type:'item-added',itemId:'j',date:'2021-01-01',order:1,initialValue:50,valuation:{type:'fixed'},shares:{a:1},financialMode:'none'},
 {id:'arch',type:'person-deactivated',personId:'c',date:'2021-01-01',order:2},
 {id:'end',type:'item-ended',itemId:'i',date:'2022-01-01',order:1}]};
 const first=projectAt(project,'2020-01-01'), later=projectAt(project,'2023-01-01');
 assert.deepEqual(rankedItems(first.activeItems).map(i=>i.id),['i']);
 assert.deepEqual(rankedItems(projectAt(project,'2021-06-01').activeItems).map(i=>i.id),['j','i']);
 assert.deepEqual(rankedItems(later.activeItems).map(i=>i.id),['j']);
 assert.equal(later.people.find(p=>p.id==='c').active,false);
 assert.deepEqual(ownerNames(first.activeItems[0]).map(p=>p.id),['a','b']);
 const participants=eventPeople(project,buy);
 assert.deepEqual(participants.map(p=>[p.id,p.roles]),[['a',['overview.owner']],['b',['overview.owner']],['c',['overview.funder']]]);
 assert.deepEqual(itemPeople(first.activeItems[0],[buy],project.people),participants);
 assert.deepEqual(eventPeople(project,project.events.at(-1)).map(p=>p.id),['a','b']);
});

test('Q57: simple owner and share-change lists have no role heading; mixed financing is grouped',()=>{
 const a={id:'a',name:'Anna',roles:['overview.owner','overview.funder']};
 const b={id:'b',name:'Ben',roles:['overview.owner']};
 const c={id:'c',name:'Chris',roles:['overview.funder']};
 assert.deepEqual(nameRoleGroups([b]),[{role:'overview.owner',label:null,entries:[b]}]);
 assert.deepEqual(nameRoleGroups([a,b,c]).map(g=>[g.label,g.entries.map(e=>e.id)]),[
   ['overview.ownersGroup',['a','b']],['overview.fundersGroup',['a','c']]
 ]);
 assert.equal(nameRoleGroups([b],[b,c])[0].label,'overview.ownersGroup');
 const delta={id:'a',name:'Anna',detail:'+2 units'};
 assert.deepEqual(nameRoleGroups([delta]),[{role:null,label:null,entries:[delta]}]);
 const former={id:'b',name:'Ben',roles:['overview.formerOwner']};
 assert.equal(nameRoleGroups([former])[0].label,null);
 assert.equal(nameRoleGroups([c])[0].label,'overview.fundersGroup');
});
