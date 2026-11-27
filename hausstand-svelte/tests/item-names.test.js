import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateItemNames, duplicateItemStatus, itemDisplayName } from '../src/lib/itemNames.js';

const project = {items:[
  {id:'a',name:'Sofa',number:1},
  {id:'b',name:' sofa ',number:2},
  {id:'c',name:'Sofatisch'},
  {id:'d',name:'KÜCHE'}
]};

test('item name warning finds all exact trimmed case-insensitive matches across project',()=>{
  assert.deepEqual(duplicateItemNames(project,'  SOFA  ').map(i=>i.id),['a','b']);
  assert.deepEqual(duplicateItemNames(project,'sofa','a').map(i=>i.id),['b']);
  assert.deepEqual(duplicateItemNames(project,'Sofatisch','c'),[]);
  assert.deepEqual(duplicateItemNames(project,'  '),[]);
  assert.deepEqual(duplicateItemNames(project,'Sof'),[]);
  assert.deepEqual(duplicateItemNames(project,'ku\u0308che').map(i=>i.id),['d']);
  assert.equal(project.items[0].name,'Sofa');
});

test('warning distinguishes archived and outside-date matches without filtering them',()=>{
  const projection={items:[{id:'a',status:'active'},{id:'b',status:'ended'}]};
  assert.equal(duplicateItemStatus(project.items[0],projection),'active');
  assert.equal(duplicateItemStatus(project.items[1],projection),'archived');
  assert.equal(duplicateItemStatus(project.items[2],projection),'outsideDate');
  assert.equal(itemDisplayName(project.items[0]),'#1 Sofa');
  assert.equal(itemDisplayName(project.items[2]),'Sofatisch');
  assert.deepEqual(duplicateItemNames(project,'sofa').map(i=>i.id),['a','b']);
});
