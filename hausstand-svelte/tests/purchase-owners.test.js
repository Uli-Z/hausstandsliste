import test from 'node:test';
import assert from 'node:assert/strict';
import { addPurchaseOwner, removePurchaseOwner } from '../ui-v3/purchase-owners.js';
test('explicit owner selection starts empty, adds one unit, excludes duplicates and inactive people',()=>{
  const people=[{id:'a'},{id:'b'},{id:'c',active:false}];
  let shares={};
  shares=addPurchaseOwner(shares,'a',people);
  assert.deepEqual(shares,{a:1});
  shares={a:2.5};
  assert.equal(addPurchaseOwner(shares,'a',people),shares);
  assert.equal(addPurchaseOwner(shares,'c',people),shares);
  shares=addPurchaseOwner(shares,'b',people);
  assert.deepEqual(shares,{a:2.5,b:1});
  shares=removePurchaseOwner(shares,'a');
  assert.deepEqual(shares,{b:1});
  shares=removePurchaseOwner(shares,'b');
  assert.deepEqual(shares,{});
  assert.deepEqual(addPurchaseOwner(shares,'a',people),{a:1});
});
