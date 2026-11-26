import test from 'node:test';
import assert from 'node:assert/strict';
import { validShareMap, validShareUnitDeltas, shareUnitDeltas, applyShareUnitDeltas, ShareUnitError } from '../src/lib/shareUnits.js';

test('Q30: historical insertion preserves later absolute changes and uninvolved owners', () => {
  const initial = {a:6,b:4};
  const later = shareUnitDeltas(initial,{a:5,b:5});
  const earlier = shareUnitDeltas(initial,{a:6,b:3,c:1});
  assert.deepEqual(later,{a:-1,b:1});
  assert.deepEqual(earlier,{b:-1,c:1});
  assert.deepEqual(applyShareUnitDeltas(applyShareUnitDeltas(initial,earlier),later),{a:5,b:4,c:1});
  assert.deepEqual(initial,{a:6,b:4});
});

test('Q30: units may be created or dissolved, with no proportional rescaling', () => {
  const before = {a:2,b:3,c:1};
  const change = shareUnitDeltas(before,{a:5,b:1,c:1,d:4});
  assert.deepEqual(change,{a:3,b:-2,d:4});
  assert.deepEqual(applyShareUnitDeltas(before,change),{a:5,b:1,c:1,d:4});
  assert.deepEqual(applyShareUnitDeltas(before,{b:-3}),{a:2,c:1});
  assert.deepEqual(shareUnitDeltas(before,before),{});
});

test('Q30: fractional units round-trip without binary arithmetic drift', () => {
  const before={a:0.3,b:0.1};
  const target={a:0.1,b:0.3};
  const change=shareUnitDeltas(before,target);
  assert.deepEqual(change,{a:-0.2,b:0.2});
  assert.deepEqual(applyShareUnitDeltas(before,JSON.parse(JSON.stringify(change))),target);
  assert.deepEqual(applyShareUnitDeltas({a:1e-7},{a:2e-7}),{a:3e-7});
});

test('Q30: conflict rejects the entire operation and identifies the negative owner', () => {
  const before={a:1,b:4};
  assert.throws(() => applyShareUnitDeltas(before,{b:3,a:-2}), e =>
    e instanceof ShareUnitError && e.code==='NEGATIVE_SHARE' &&
    e.personId==='a' && e.beforeUnits===1 && e.deltaUnits===-2);
  assert.deepEqual(before,{a:1,b:4});
  assert.throws(() => applyShareUnitDeltas({a:1},{a:-1}),{code:'OWNERLESS_ITEM'});
  assert.throws(() => shareUnitDeltas({a:1},{}),{code:'OWNERLESS_ITEM'});
});

test('Q30: invalid and unrepresentable numbers are rejected, never rounded', () => {
  for (const n of [NaN,Infinity,-Infinity,'1',null]) {
    assert.equal(validShareUnitDeltas({a:n}),false);
    assert.throws(() => applyShareUnitDeltas({a:2},{a:n}),{code:'INVALID_SHARES'});
  }
  assert.equal(validShareMap({a:-1}),false);
  assert.equal(validShareUnitDeltas({a:0}),false);
  assert.throws(() => applyShareUnitDeltas({a:1e20},{a:1}),{code:'SHARE_PRECISION'});
  assert.throws(() => shareUnitDeltas({a:0.1},{a:1e20}),{code:'SHARE_PRECISION'});
  assert.throws(() => applyShareUnitDeltas({a:Number.MAX_VALUE},{a:Number.MAX_VALUE}),{code:'SHARE_PRECISION'});
});

test('Q30: arbitrary person keys are treated as own map entries', () => {
  const before=JSON.parse('{"__proto__":2,"constructor":1}');
  const change=shareUnitDeltas(before,JSON.parse('{"constructor":2,"new":1}'));
  assert.deepEqual(change,JSON.parse('{"__proto__":-2,"constructor":1,"new":1}'));
  assert.deepEqual(applyShareUnitDeltas(before,change),{constructor:2,new:1});
});
