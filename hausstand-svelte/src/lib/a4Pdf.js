// Minimal local PDF container for browser-rendered, Unicode-capable pages.
// The PDF uses A4 media boxes and embeds one JPEG per page. No remote fonts,
// dependencies, network calls or project data writes are needed.
const encoder = new TextEncoder();
const bytes = value => typeof value === 'string' ? encoder.encode(value) : value;
export function a4ImagePdf(pages) {
  if (!pages.length) throw new Error('PDF needs at least one page');
  const parts = [];
  const offsets = [0];
  let length = 0;
  const append = value => { const b = bytes(value); parts.push(b); length += b.length; };
  const object = (id, ...contents) => {
    offsets[id] = length;
    append(id + ' 0 obj\n');
    for (const content of contents) append(content);
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');
  append(Uint8Array.of(37,226,227,207,211,10));
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
  pages.forEach(({width,height,jpeg},i)=>{
    const page = 3+i*3, image = page+1, stream = page+2;
    if (!Number.isSafeInteger(width) || width<=0 || !Number.isSafeInteger(height) || height<=0 ||
        !(jpeg instanceof Uint8Array) || jpeg.length<4 || jpeg[0]!==255 || jpeg[1]!==216) throw new Error('Invalid JPEG page');
    object(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+image+' 0 R >> >> /Contents '+stream+' 0 R >>');
    object(image,'<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n',jpeg,'\nendstream');
    const commands='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    object(stream,'<< /Length '+bytes(commands).length+' >>\nstream\n',commands,'endstream');
  });
  const xref=length;
  append('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
  for(let i=1;i<offsets.length;i++) append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  append('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return new Blob(parts,{type:'application/pdf'});
}

// Layout uses measured browser glyphs, including names outside Latin-1.
// Split even long unbroken names by grapheme where available.
export function wrapReportText(value,maxWidth,measure) {
  const text=String(value ?? '');
  const result=[];
  const segmenter=typeof Intl.Segmenter==='function' ? new Intl.Segmenter(undefined,{granularity:'grapheme'}) : null;
  for(const paragraph of text.split(/\r?\n/)){
    let line='';
    for(const word of paragraph.trim().split(/\s+/)){
      if(!word) continue;
      const next=line ? line+' '+word : word;
      if(measure(next)<=maxWidth){ line=next; continue; }
      if(line){result.push(line);line='';}
      if(measure(word)<=maxWidth){line=word;continue;}
      const chars=segmenter ? Array.from(segmenter.segment(word),x=>x.segment) : Array.from(word);
      for(const char of chars){
        if(line && measure(line+char)>maxWidth){result.push(line);line='';}
        line+=char;
      }
    }
    result.push(line);
  }
  return result;
}

const WIDTH=595.28, HEIGHT=841.89, MARGIN=40, BOTTOM=HEIGHT-52, SCALE=200/72;

// Blocks are presentation-only, with an optional right-aligned amount.
// Paginate line by line so even a very long name cannot overflow the page.
export async function renderA4Pdf(blocks,{header='',pageLabel='Page'}={}) {
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(WIDTH*SCALE);canvas.height=Math.round(HEIGHT*SCALE);
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx) throw new Error('Canvas unavailable');
  const pages=[];
  let y, pageNo=0;
  const font=(size,bold=false)=>{ctx.font=(bold?'600 ':'400 ')+size+'px system-ui, sans-serif';};
  const begin=()=>{
    pageNo++;
    ctx.setTransform(canvas.width/WIDTH,0,0,canvas.height/HEIGHT,0,0);
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.textBaseline='top';ctx.fillStyle='#243444';
    font(9,true);
    const head=wrapReportText(header,WIDTH-2*MARGIN,s=>ctx.measureText(s).width)[0];
    ctx.fillText(head,MARGIN,20);
    ctx.strokeStyle='#c7d0da';ctx.beginPath();ctx.moveTo(MARGIN,35);ctx.lineTo(WIDTH-MARGIN,35);ctx.stroke();
    ctx.fillStyle='#4e5a66';font(9);
    const footer=pageLabel+' '+pageNo;
    ctx.fillText(footer,WIDTH-MARGIN-ctx.measureText(footer).width,HEIGHT-28);
    y=50;
  };
  const finish=async()=>{
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG encoding failed')),'image/jpeg',0.94));
    pages.push({width:canvas.width,height:canvas.height,jpeg:new Uint8Array(await blob.arrayBuffer())});
  };
  begin();
  try {
    for(const block of blocks){
      const size=block.kind==='title'?19:block.kind==='heading'?14:block.kind==='subheading'?12:10.5;
      const bold=['title','heading','subheading','total','warning'].includes(block.kind);
      const leading=size*1.4, before=block.kind==='heading'?12:block.kind==='subheading'?8:0;
      const after=block.kind==='title'?8:block.kind==='row'||block.kind==='total'?4:6;
      font(size,bold);
      const right=String(block.amount ?? '');
      const available=WIDTH-2*MARGIN-(right?Math.max(88,ctx.measureText(right).width+18):0);
      const lines=wrapReportText(block.text,Math.max(30,available),s=>ctx.measureText(s).width);
      // Keep headings with at least one subsequent line where possible.
      const reserve=block.kind==='heading'||block.kind==='subheading'?16:0;
      if(y+before+Math.min(lines.length,2)*leading+after+reserve>BOTTOM){await finish();begin();}
      y+=before;
      for(let i=0;i<lines.length;i++){
        if(y+leading>BOTTOM){await finish();begin();}
        font(size,bold);
        ctx.fillStyle=block.kind==='warning'?'#8a321d':bold?'#182c40':'#202a32';
        ctx.fillText(lines[i],MARGIN,y);
        if(i===0&&right)ctx.fillText(right,WIDTH-MARGIN-ctx.measureText(right).width,y);
        y+=leading;
      }
      if(block.kind==='row'||block.kind==='total'){
        ctx.strokeStyle='#e0e5e9';ctx.beginPath();ctx.moveTo(MARGIN,y+1);ctx.lineTo(WIDTH-MARGIN,y+1);ctx.stroke();
      }
      y+=after;
    }
    await finish();
    return a4ImagePdf(pages);
  } finally {canvas.width=0;canvas.height=0;}
}

export function downloadPdf(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  // Some mobile browsers need the URL to remain valid after click.
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
