import { reportMoney, dateText, reportCopy } from './personalReportPrint.js';
import { renderA4Pdf, downloadPdf } from './a4Pdf.js';
const copy={
  de:{title:'Hausstandsreport',download:'Bericht als PDF',created:'Erstellt am',asOf:'Stichtag',stock:'Aktiver Bestand',initial:'Anschaffungswert / Startwert',loss:'Kumulierter Wertverlust',value:'Aktueller Wert',ended:'Abgegangene Gegenstände (separat)',endValue:'Wert beim Abgang',people:'Personenübersicht',inactive:'Inaktiv / historisch',count:'Gegenstände',acquired:'Erworben',depreciation:'Wertverlust',relinquished:'Abgänge',other:'Sonstige Wertänderung',remaining:'Restwert',balance:'Ausgleich',matrix:'Eigentumsanteilsmatrix',item:'Gegenstand',total:'Summe Geldspalten',units:'Anteilseinheiten',legend:'Personenschlüssel',part:'Spaltenblock',none:'Keine Einträge zum Stichtag.',rules:'Erläuterungen',note:'Die Matrix zeigt den aktiven Bestand. Startwert ist der im Bewertungsmodell hinterlegte Wert (auch bei einer Nachfolge), nicht zwingend ein tatsächlich gezahlter Kaufbetrag. Abgegangene Gegenstände sind separat bilanziert. Wertverlust ist Startwert minus Stichtagswert bzw. Wert beim Abgang; ein negativer Wert bedeutet Wertsteigerung. Die Bewertung folgt je Gegenstand dem hinterlegten konstanten, linearen oder degressiven Modell einschließlich Mindestwert. Personenwerte beruhen auf den beim Erwerb und bei der Abgabe gültigen Anteilswerten und der Wertentwicklung während der Besitzdauer. Erwerb und Abgang umfassen auch unentgeltliche Übertragungen; sonstige Wertänderungen werden separat ausgewiesen. Der Ausgleichssaldo ist unabhängig vom Eigentum: positiv = Forderung, negativ = Verbindlichkeit. Einheiten sind relative Eigentumsanteile (nicht Prozent); ein Strich bedeutet kein Anteil. Bei mehreren Spaltenblöcken sind die Geldspalten und ihre Summen identisch wiederholt und dürfen nicht addiert werden.'},
  en:{title:'Household report',download:'Report as PDF',created:'Created on',asOf:'As of',stock:'Active inventory',initial:'Acquisition / initial value',loss:'Cumulative value loss',value:'Current value',ended:'Disposed items (separate)',endValue:'Value at disposal',people:'People summary',inactive:'Inactive / historical',count:'Items',acquired:'Acquired',depreciation:'Value loss',relinquished:'Disposed',other:'Other value change',remaining:'Remaining',balance:'Settlement',matrix:'Ownership share matrix',item:'Item',total:'Money column totals',units:'Share units',legend:'Person key',part:'Column block',none:'No entries at this date.',rules:'Explanations',note:'The matrix covers active inventory. Initial value is the value recorded in the valuation model (including successor items), not necessarily the actual cash purchase amount. Disposed items are shown separately. Value loss is initial value minus value at the reporting date or disposal; a negative loss means appreciation. Each item uses its recorded fixed, linear or declining-balance model, including minimum value. Personal values reflect shares at acquisition and disposal and value changes during ownership. Acquisitions and disposals include uncompensated transfers; other value changes are shown separately. Settlement balances are independent of ownership: positive = receivable, negative = payable. Units represent relative ownership, not percentages; a dash means no share. Money columns and totals are repeated unchanged across column blocks and must not be added.'}
};
export const householdReportCopy=lang=>copy[lang==='de'?'de':'en'];
// A4 portrait: reserve about 60% of the width for the item and money
// columns, use the rest for up to four owner columns. Always include one
// matrix even for an empty household. Person keys avoid truncation.
export function matrixGroups(people,size=4){
  const result=[];
  for(let i=0;i<people.length;i+=size)result.push(people.slice(i,i+size));
  return result.length?result:[[]];
}
export function householdReportBlocks(report,lang,dirty=false){
  const t=householdReportCopy(lang), p=reportCopy(lang);
  const blocks=[];
  const add=(kind,text,amount)=>blocks.push({kind,text,...(amount===undefined?{}:{amount})});
  const money=c=>reportMoney(c,lang);
  const unit=new Intl.NumberFormat(lang==='de'?'de-DE':'en-GB',{maximumSignificantDigits:21,useGrouping:false});
  const col=(label,weight,align='left')=>({label,weight,align});
  const numeric=(label,weight)=>col(label,weight,'right');
  const table=(columns,rows,fontSize=9)=>blocks.push({kind:'table',columns,rows,fontSize});
  const row=(key,value,total=false)=>add(total?'total':'row',t[key],money(value));
  add('title',t.title);add('subheading',report.name);
  add('text',t.asOf+': '+dateText(report.asOfDate,lang)+' · '+t.created+': '+dateText(report.createdDate,lang));
  if(dirty)add('warning',p.dirty);
  if(report.incomplete)add('warning',p.incomplete);
  add('heading',t.stock);
  row('initial',report.activeTotals.initial);
  row('loss',report.activeTotals.depreciation);
  row('value',report.activeTotals.remaining,true);
  if(report.ended.length){
    add('heading',t.ended+' ('+report.ended.length+')');
    row('initial',report.endedTotals.initial);row('loss',report.endedTotals.depreciation);row('endValue',report.endedTotals.endValue,true);
  }
  add('heading',t.people);
  const keyed=report.people.map((person,i)=>({...person,key:'P'+(i+1)}));
  const personCols=[col(t.legend,1.9),numeric(t.count,.65),numeric(t.acquired,1.1),numeric(t.depreciation,1.1),
    numeric(t.relinquished,1.1),numeric(t.other,1.1),numeric(t.remaining,1.1),numeric(t.balance,1.1)];
  for(const [active,group] of [[true,keyed.filter(p=>p.active)],[false,keyed.filter(p=>!p.active)]]){
    if(!group.length)continue;
    if(!active)add('subheading',t.inactive);
    table(personCols,group.map(p=>({cells:[p.key+' · '+p.name,String(p.count),money(p.acquired),money(p.depreciation),
      money(p.relinquished),money(p.other),money(p.remaining),money(p.balance)]})),8);
  }
  if(!keyed.length)add('text',t.none);
  const groups=matrixGroups(keyed);
  for(let i=0;i<groups.length;i++){
    const group=groups[i];
    add('pageBreak','');
    add('heading',t.matrix+(groups.length>1?' · '+t.part+' '+(i+1)+' / '+groups.length:''));
    add('text',t.units);
    // Full untruncated names are repeated in the column block legend and
    // in the preceding people table. Ordinary names also appear in the headers; very long names use the key alone.
    if(group.length)for(const person of group)add('text',person.key+' · '+person.name+(!person.active?' ('+t.inactive+')':''));
    const columns=[col(t.item,2.2),numeric(t.initial,1.25),numeric(t.loss,1.25),numeric(t.value,1.25),
      ...group.map(p=>numeric(p.key+(Array.from(p.name).length<=32?' · '+p.name:''),.9))];
    const rows=report.items.map(item=>({cells:[item.name,money(item.initial),money(item.depreciation),money(item.remaining),
      ...group.map(p=>item.shares[p.id]>0?unit.format(item.shares[p.id]):'–')]}));
    rows.push({total:true,cells:[t.total,money(report.activeTotals.initial),money(report.activeTotals.depreciation),
      money(report.activeTotals.remaining),...group.map(()=>'')]});
    if(!report.items.length)add('text',t.none);
    table(columns,rows,8.5);
  }
  add('heading',t.rules);add('text',t.note);
  return blocks;
}
export function householdReportFilename(report){
  const name=String(report.name).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').trim().slice(0,80)||'Hausstand';
  return name+'-'+report.asOfDate+'.pdf';
}
export async function downloadHouseholdReport(report,lang,dirty=false){
  const t=householdReportCopy(lang);
  const blob=await renderA4Pdf(householdReportBlocks(report,lang,dirty),{header:t.title+' · '+dateText(report.asOfDate,lang),pageLabel:reportCopy(lang).page});
  downloadPdf(blob,householdReportFilename(report));
}
