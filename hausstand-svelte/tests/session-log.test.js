import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSessionChange,sessionChangeText} from '../src/lib/sessionLog.js';
test('Q48 describes concrete names and actual payment details in both languages',()=>{
  const a={community:{name:'WG'},people:[],items:[],events:[],drafts:[]};
  const b={...a,people:[{id:'a',name:'Anna'},{id:'b',name:'Ben'}],events:[{id:'join',type:'person-added',personId:'a'}]};
  assert.equal(sessionChangeText(describeSessionChange(a,b),'de'),'Person Anna hinzugefügt · Person Ben hinzugefügt');
  const c={...b,items:[{id:'i',name:'Waschmaschine'}],events:[...b.events,{id:'purchase',type:'item-added',itemId:'i'},{id:'pay',type:'claim-settlement-recorded',debtorPersonId:'a',creditorPersonId:'b',amountCents:5000,settlementKind:'paid'}]};
  const description=describeSessionChange(b,c);
  assert.equal(description.length,2);
  assert.match(sessionChangeText(description,'de'),/Gegenstand Waschmaschine angelegt.*Ausgleichszahlung Anna → Ben \(50,00/);
  assert.match(sessionChangeText(description,'en'),/Item Waschmaschine added.*Payment Anna → Ben \(€50.00\) recorded/);
  const d={...c,events:c.events.slice(0,-1)};
  assert.match(sessionChangeText(describeSessionChange(c,d),'de'),/Ausgleichszahlung Anna → Ben.*gelöscht/);
});
