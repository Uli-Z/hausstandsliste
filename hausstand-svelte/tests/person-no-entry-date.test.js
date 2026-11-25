import test from 'node:test';
import assert from 'node:assert/strict';
import { addPerson } from '../src/lib/personMutations.js';
import { projectAt } from '../src/lib/projector.js';
import { projectMutationProblem } from '../src/lib/mutationValidation.js';
import { addItem } from '../src/lib/itemMutations.js';

test('Q27: a new person can participate in purchases before the creation audit date', () => {
  const p = {people:[],items:[],events:[],drafts:[]};
  const {person,event} = addPerson(p,{name:'Anna'});
  assert.equal(event.type,'person-added');
  assert.equal(projectAt(p,'1900-01-01').peopleById.get(person.id).active,true);
  const before = structuredClone(p);
  addItem(p,{name:'Table',date:'1900-01-02',initialValue:10,
    valuation:{type:'fixed',minimumValue:0},shares:{[person.id]:1},
    purchaseContributionsCents:{[person.id]:1000}});
  assert.equal(projectMutationProblem(before,p),null);
  assert.equal(projectAt(p,'1900-01-02').activeItems[0].shares[person.id],1);
});

test('Q27: an archive before person creation is not undone by the later audit record', () => {
  const p={people:[],items:[],events:[],drafts:[]};
  const {person,event}=addPerson(p,{name:'Anna'});
  const before=structuredClone(p);
  p.events.push({id:'archive',type:'person-deactivated',date:'1900-01-01',order:1,personId:person.id});
  assert.equal(projectMutationProblem(before,p),null);
  assert.equal(projectAt(p,event.date).peopleById.get(person.id).active,false);
});
