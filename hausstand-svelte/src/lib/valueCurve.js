import { valueAtCents } from './valuation.js';

const DAY=86400000;
const day=iso=>Date.parse(iso+'T00:00:00Z')/DAY;
const iso=n=>new Date(n*DAY).toISOString().slice(0,10);

// Chart presentation only. The same domain valuation supplies every sample.
// End events are exclusive: no active model line after the ending day.
export function valueCurve(runtime, asOfDate, currentCents, knownEnd = null) {
  const start=day(runtime.date), selected=day(asOfDate);
  if (!Number.isFinite(start)||!Number.isFinite(selected)||selected<start) return null;
  const rule=runtime.valuation||{};
  const end=day(runtime.endedAt||knownEnd||'');
  const hasEnd=Number.isFinite(end)&&end>=start;
  const horizonYears=rule.type==='linear' ? Math.min(100,Math.max(1,Number(rule.durationYears)||1)) : rule.type==='degressive' ? 10 : 6;
  const modelHorizon=start+Math.ceil(horizonYears*365.2425);
  const horizon=Math.max(start+1,selected,hasEnd?Math.min(modelHorizon,end):modelHorizon);
  const stop=hasEnd?Math.min(horizon,end):horizon;
  const value=n=>valueAtCents(rule,runtime.initialValue,runtime.date,iso(n));
  const activeStop=hasEnd&&stop===end?stop-1:stop;
  const dates=new Set();
  if(activeStop>=start){
    for(let i=0;i<=64;i++) dates.add(start+Math.round((activeStop-start)*i/64));
    if(selected<=activeStop)dates.add(selected);
  }
  const samples=[...dates].sort((a,b)=>a-b).map(n=>({day:n,cents:value(n)}));
  const ending=hasEnd&&end<=horizon?{day:end,cents:0}:null;
  const marker={day:selected,cents:currentCents};
  const minCents=Math.round((Number(rule.minimumValue)||0)*100);
  const maxCents=Math.max(1,minCents,Math.round(runtime.initialValue*100),currentCents,...samples.map(s=>s.cents));
  const x=n=>38+(n-start)/(horizon-start)*414;
  const y=c=>132-c/maxCents*110;
  const point=s=>({x:x(s.day),y:y(s.cents),cents:s.cents,date:iso(s.day)});
  const path=rows=>rows.map((s,i)=>(i?'L':'M')+x(s.day).toFixed(2)+','+y(s.cents).toFixed(2)).join(' ');
  return {
    startDate:runtime.date,endDate:iso(horizon),maxCents,minCents,minimumY:y(minCents),
    pastPath:path(samples.filter(s=>s.day<=selected)),
    futurePath:path(samples.filter(s=>s.day>=selected)),
    marker:point(marker),ending:ending?point(ending):null,
    samples:samples.map(point)
  };
}
