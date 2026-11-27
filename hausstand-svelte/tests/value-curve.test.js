import test from 'node:test';
import assert from 'node:assert/strict';
import { valueCurve } from '../src/lib/valueCurve.js';
import { valueAtCents } from '../src/lib/valuation.js';
const start='2025-01-01', selected='2027-06-01';
for(const valuation of [
 {type:'fixed',minimumValue:0},
 {type:'linear',durationYears:6,minimumValue:50},
 {type:'degressive',annualRate:.2,minimumValue:25},
 {type:'degressive',annualRate:0,minimumValue:0},
 {type:'degressive',annualRate:1,minimumValue:5}
]){
 test('Q61: model samples and selected value use the domain valuation '+JSON.stringify(valuation),()=>{
  const runtime={date:start,initialValue:600,valuation};
  const cents=valueAtCents(valuation,600,start,selected);
  const curve=valueCurve(runtime,selected,cents);
  assert.equal(curve.marker.cents,cents);
  assert.equal(curve.marker.date,selected);
  assert.ok(curve.pastPath && curve.futurePath);
  for(const point of curve.samples)assert.equal(point.cents,valueAtCents(valuation,600,start,point.date));
  assert.ok(curve.samples.every((s,i)=>!i||s.cents<=curve.samples[i-1].cents));
  assert.ok(curve.samples.every(s=>s.cents>=curve.minCents));
 });
}
test('Q61: end stops active samples; later time travel has zero marker and no continuation',()=>{
 const runtime={date:start,initialValue:600,valuation:{type:'fixed'},endedAt:'2026-01-01'};
 const curve=valueCurve(runtime,selected,0);
 assert.equal(curve.ending.date,'2026-01-01');
 assert.equal(curve.marker.cents,0);
 assert.equal(curve.futurePath,'');
 assert.ok(curve.samples.every(p=>p.date<runtime.endedAt));
 const before=valueCurve({...runtime,endedAt:null},start,60000,'2026-01-01');
 assert.equal(before.ending.date,'2026-01-01');
 assert.ok(before.samples.every(p=>p.date<'2026-01-01'));
});
test('Q61: same-day end and zero value remain finite',()=>{
 const curve=valueCurve({date:start,initialValue:0,valuation:{type:'fixed'},endedAt:start},start,0);
 assert.equal(curve.samples.length,0);
 assert.equal(curve.marker.cents,0);
 assert.ok(Number.isFinite(curve.marker.y));
});
