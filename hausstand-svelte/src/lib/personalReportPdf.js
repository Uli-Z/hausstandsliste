import { assetLines, paymentLines, reportCopy, reportMoney, dateText } from './personalReportPrint.js';
import { renderA4Pdf, downloadPdf } from './a4Pdf.js';

export function personalReportBlocks(report,lang,dirty=false){
  const t=reportCopy(lang);
  const blocks=[];
  const add=(kind,text,amount)=>blocks.push({kind,text,...(amount===undefined?{}:{amount})});
  const row=(key,cents,total=false)=>add(total?'total':'row',t[key],reportMoney(cents,lang));
  add('title',t.title);
  add('subheading',report.name);
  add('text',dateText(report.asOfDate,lang)+(report.active?'':' · '+t.inactive)+(report.exitDate?' · '+t.exit+': '+dateText(report.exitDate,lang):''));
  if(dirty)add('warning',t.dirty);
  if(report.incomplete)add('warning',t.incomplete);
  add('text',t.note);
  add('heading',t.assets);
  for(const [key,sign] of assetLines)row(key,sign*report.totals[key],key==='remaining');
  add('heading',t.payments);
  for(const [key,sign] of paymentLines)row(key,sign*report.finance[key]);
  for(const key of ['balance','receivables','liabilities'])row(key,report[key],true);
  add('heading',t.holdings);
  if(!report.items.length)add('text',t.empty);
  for(const item of report.items){
    add('subheading',item.name);
    for(const [key,sign] of assetLines)if(item[key]||key==='remaining')row(key,sign*item[key],key==='remaining');
  }
  add('heading',t.journal);
  if(!report.events.length)add('text',t.empty);
  for(const event of report.events)add('row',[dateText(event.date,lang),event.item,t[event.kind]].filter(Boolean).join(' · '),reportMoney(event.cents,lang));
  return blocks;
}
export function personalReportFilename(report,lang){
  const name=String(report.name||'').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').replace(/\s+/g,' ').trim().slice(0,80)||'Person';
  return (lang==='de'?'Abrechnung':'Statement')+'-'+name+'-'+report.asOfDate+'.pdf';
}
export async function downloadPersonalReport(report,lang,dirty=false){
  const t=reportCopy(lang);
  const blob=await renderA4Pdf(personalReportBlocks(report,lang,dirty),{header:t.title+' · '+report.name,pageLabel:t.page});
  downloadPdf(blob,personalReportFilename(report,lang));
}
