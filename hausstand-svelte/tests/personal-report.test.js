import test from 'node:test';
import assert from 'node:assert/strict';
import { personalReport } from '../src/lib/personalReport.js';
import { personalReportHtml } from '../src/lib/personalReportPrint.js';
const purchase = { id:'purchase', type:'item-added', itemId:'i', date:'2024-01-01', order:1, initialValue:300,
  valuation:{type:'linear', durationYears:2, minimumValue:50}, shares:{a:1,b:1,c:1}, financialMode:'derived', purchaseContributionsCents:{a:20000,b:10000} };
const transfer = (id,date,deltas,mode='derived')=>({id,type:'shares-set',itemId:'i',date,order:1,shareUnitDeltas:deltas,financialMode:mode});
const payment = (id,kind,amount,from,to)=>({id,type:'claim-settlement-recorded',date:'2025-02-01',order:1,settlementKind:kind,amountCents:amount,debtorPersonId:from,creditorPersonId:to});
const p = events=>({people:[{id:'a',name:'A <script>'},{id:'b',name:'Private B'},{id:'c',name:'Private C'}],items:[{id:'i',name:'Table & chair',number:1}],events});
test('gross financing independent of shares, including zero balance',()=>{
  const report=personalReport(p([purchase]),'b','2024-01-01');
  assert.equal(report.finance.funded,10000);
  assert.equal(report.totals.acquired,10000);
  assert.equal(report.balance,0);
  assert.equal(report.totals.remaining,10000);
  assert.equal(report.incomplete,false);
});
test('ownership bridge reconciles depreciation, transfers, gift, minimum, end and exit',()=>{
  const project=p([purchase,transfer('take','2025-01-01',{a:1,b:-1}),transfer('gift','2025-03-01',{a:-1,c:1},'none'),
    {id:'exit',type:'person-deactivated',personId:'a',date:'2025-04-01',order:1},
    {id:'end',type:'item-ended',itemId:'i',date:'2027-01-01',order:1}]);
  const before=personalReport(project,'a','2025-05-01');
  assert.equal(before.active,false);
  assert.ok(before.totals.depreciation>0 && before.totals.giftOut>0 && before.totals.remaining>0);
  assert.equal(before.incomplete,false);
  const after=personalReport(project,'a','2027-01-01');
  assert.equal(after.totals.remaining,0);
  assert.ok(after.totals.ended>0);
  assert.equal(after.incomplete,false);
});
test('cash, overpayment and noncash adjustments independently reconcile; future excluded',()=>{
  const project=p([purchase,payment('paid','paid',12000,'c','a'),payment('external','external',200,'a','b'),payment('waived','waived',300,'b','a')]);
  const r=personalReport(project,'a','2025-03-01');
  assert.equal(r.finance.received,12000);
  assert.equal(r.finance.externalPlus,200);
  assert.equal(r.finance.waivedMinus,300);
  assert.equal(r.balance,-2100);
  assert.equal(r.incomplete,false);
  assert.equal(personalReport(project,'a','2024-01-01').balance,10000);
});
test('print is localized, marks unsaved data and excludes names of counterparties',()=>{
  const project=p([purchase,payment('paid','paid',500,'c','a')]);
  const r=personalReport(project,'a','2025-03-01');
  const html=personalReportHtml(r,'de',true);
  assert.match(html,/Vermögens- und Zahlungsabrechnung/);
  assert.match(html,/ungespeicherten Änderungen/);
  assert.match(html,/A &lt;script&gt;/);
  assert.doesNotMatch(html,/Private B|Private C|<script>/);
  assert.match(personalReportHtml(r,'en'),/Payment and balance bridge/);
});
