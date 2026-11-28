import test from 'node:test';
import assert from 'node:assert/strict';
import { a4ImagePdf, wrapReportText } from '../src/lib/a4Pdf.js';
import { personalReportBlocks, personalReportFilename } from '../src/lib/personalReportPdf.js';
import { personalReport } from '../src/lib/personalReport.js';

test('PDF object offsets and page tree point to correct byte positions',async()=>{
  // Structural test: real browser tests supply genuine JPEGs.
  const image={width:1654,height:2339,jpeg:Uint8Array.of(255,216,255,217)};
  const blob=a4ImagePdf([image,image,image]);
  assert.equal(blob.type,'application/pdf');
  const data=Buffer.from(await blob.arrayBuffer());
  const content=data.toString('latin1');
  assert.match(content,/^%PDF-1.4/);
  assert.match(content,/\/Count 3 \/Kids \[3 0 R 6 0 R 9 0 R\]/);
  assert.equal((content.match(/\/MediaBox \[0 0 595.28 841.89\]/g)||[]).length,3);
  const offset=Number(content.match(/startxref\n(\d+)/)[1]);
  assert.equal(content.slice(offset,offset+4),'xref');
  const entries=content.slice(offset).split('\n').slice(3,14);
  for(let i=0;i<entries.length;i++){
    const at=Number(entries[i].slice(0,10));
    assert.equal(content.slice(at,at+String(i+1).length+6),(i+1)+' 0 obj');
  }
  assert.throws(()=>a4ImagePdf([]));
});
test('wrap preserves Unicode, long words and explicit line breaks',()=>{
  const measure=s=>Array.from(s).length;
  assert.deepEqual(wrapReportText('ÄÖÜ langeWörter\n東京',5,measure),['ÄÖÜ','lange','Wörte','r','東京']);
  assert.deepEqual(wrapReportText('a b c',3,measure),['a b','c']);
});
test('direct report shares ownership and payment lines, locale, and warnings',()=>{
  const project={people:[{id:'a',name:'A/東京'},{id:'b',name:'Other private name'}],items:[],events:[]};
  const report=personalReport(project,'a','2025-01-01');
  const blocks=personalReportBlocks(report,'de',true);
  assert.ok(blocks.some(b=>b.text==='Verbleibender Eigentumswert'&&b.amount.includes('0,00')));
  assert.ok(blocks.some(b=>b.kind==='warning'&&b.text.includes('ungespeicherten')));
  assert.ok(!JSON.stringify(blocks).includes('Other private name'));
  assert.match(personalReportFilename(report,'de'),/^Abrechnung-A-東京-2025-01-01\.pdf$/);
  assert.ok(personalReportBlocks(report,'en').some(b=>b.text==='Payment and balance bridge'));
});
