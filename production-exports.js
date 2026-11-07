(function(){
'use strict';
const H=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const X=v=>H(v).replace(/'/g,'&apos;');
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=n=>N(n).toLocaleString('en-GB',{maximumFractionDigits:4});
const slug=s=>String(s||'formula').replace(/[^a-z0-9_-]/gi,'-').slice(0,55);
function normal(item,kind,qty){
 const units=kind==='batch'?N(item.qty):Math.max(1,Number(qty)||1),fill=N(item.fill);
 return {kind,name:item.name||'Formula',number:kind==='batch'?item.number:'',date:(kind==='batch'?item.createdAt:Date.now())||Date.now(),version:item.version||'Experimental',unit:item.unit||'g',units,fill,total:fill*units,status:item.status|| (kind==='master'?'Approved':'Experimental'),actual:item.actual,notes:item.notes||'',list:(item.ingredients||[]).map(x=>({name:x.name,percent:N(x.percent),amount:kind==='batch'?N(x.amount):fill*units*N(x.percent)/100,lot:x.lot||'',checked:!!x.checked}))};
}
function page(p,notes=true,checks=true){
 const trs=p.list.map(x=>'<tr><td>'+ (checks?(x.checked?'☑':'☐'):'')+'</td><td>'+H(x.name)+'</td><td>'+fmt(x.percent)+'%</td><td><strong>'+fmt(x.amount)+' '+H(p.unit)+'</strong></td><td>'+H(x.lot)+'</td></tr>').join('');
 return '<!doctype html><html><head><meta charset="utf-8"><title>Kinder Naturals | '+H(p.number||p.name)+'</title><style>@page{size:A4;margin:15mm}body{font:12px Arial,sans-serif;color:#261837;margin:0}header{border-bottom:3px solid #6B35A8;display:flex;justify-content:space-between;align-items:end;padding-bottom:12px}h1{font-size:25px;margin:0;color:#6B35A8}h2{font-size:17px;color:#542085;margin:22px 0 8px}.muted{color:#7d6b8d;font-size:11px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}.meta div{padding:10px;background:#f3edfb}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #d9cde7;padding:9px;text-align:left;vertical-align:top}th{background:#eee5f7}tr{page-break-inside:avoid}.write{height:36px;border-bottom:1px solid #aca1b7}.foot{border-top:1px solid #d9cde7;margin-top:26px;padding-top:8px;color:#786a86;font-size:10px}.toolbar{padding:12px;background:#f1e9fa;margin-bottom:18px}.toolbar button{background:#6B35A8;color:white;border:0;padding:9px 14px;cursor:pointer}@media screen{body{max-width:900px;margin:auto;padding:20px}}@media print{.toolbar{display:none!important}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button> Choose “Save as PDF” in the print dialogue.</div><header><div><h1>Kinder Naturals</h1><div class="muted">PRODUCTION & FORMULATION RECORD</div></div><div class="muted">CONFIDENTIAL</div></header>'+
 '<h2>'+H(p.name)+'</h2><div class="meta"><div><b>Record type</b><br>'+H(p.kind==='batch'?'Production batch':p.kind==='master'?'Approved master formula':'Formula lab experiment')+'</div><div><b>Batch number</b><br>'+H(p.number||'Not assigned')+'</div><div><b>Formula version</b><br>'+H(p.version)+'</div><div><b>Date</b><br>'+new Date(p.date).toLocaleDateString('en-GB')+'</div><div><b>Units planned</b><br>'+fmt(p.units)+' × '+fmt(p.fill)+H(p.unit)+'</div><div><b>Total required</b><br><strong>'+fmt(p.total)+' '+H(p.unit)+'</strong></div></div>'+
 '<table><thead><tr><th>Weighed</th><th>Ingredient</th><th>%</th><th>Quantity</th><th>Supplier lot</th></tr></thead><tbody>'+trs+'<tr><th></th><th>TOTAL</th><th>'+fmt(p.list.reduce((a,x)=>a+x.percent,0))+'%</th><th>'+fmt(p.list.reduce((a,x)=>a+x.amount,0))+' '+H(p.unit)+'</th><th></th></tr></tbody></table>'+
 (notes?'<h2>Production notes</h2><div>'+H(p.notes)||''+'</div><div class="write"></div><h2>Manufacturing checks</h2><p>Actual units: '+(p.actual??'________')+' &nbsp;&nbsp; Prepared by: __________________ &nbsp;&nbsp; Checked by: __________________</p><p>Production date/time: __________________ &nbsp; Sign-off: __________________</p>':'')+
 '<div class="foot">Kinder Naturals · Controlled batch worksheet. Export is an independent snapshot. Changes made offline do not update the master formula.</div></body></html>';
}
function pdf(item,kind,options={}){
 const p=normal(item,kind,options.qty),w=window.open('','_blank');
 if(!w){alert('Allow pop-ups to open the printable PDF worksheet.');return;}
 w.document.open();w.document.write(page(p,options.notes!==false,options.checks!==false));w.document.close();w.focus();
}
function encode(s){return new TextEncoder().encode(s);}
function u16(a,n){a.push(n&255,(n>>>8)&255);}
function u32(a,n){a.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);}
const crcTable=(()=>{const t=[];for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xEDB88320:c>>>1;t.push(c>>>0);}return t;})();
function crc(arr){let c=0xffffffff;for(const b of arr)c=(c>>>8)^crcTable[(c^b)&255];return (c^0xffffffff)>>>0;}
function zip(files){
 let all=[],central=[],offset=0;
 for(const [name,bytes] of Object.entries(files)){
 const n=encode(name),b=typeof bytes==='string'?encode(bytes):bytes,ck=crc(b),local=[];
 u32(local,0x04034b50);u16(local,20);u16(local,0x0800);u16(local,0);u16(local,0);u16(local,0);u32(local,ck);u32(local,b.length);u32(local,b.length);u16(local,n.length);u16(local,0);
 all.push(new Uint8Array(local),n,b);
 const c=[];u32(c,0x02014b50);u16(c,20);u16(c,20);u16(c,0x0800);u16(c,0);u16(c,0);u16(c,0);u32(c,ck);u32(c,b.length);u32(c,b.length);u16(c,n.length);u16(c,0);u16(c,0);u16(c,0);u16(c,0);u32(c,0);u32(c,offset);central.push(new Uint8Array(c),n);
 offset+=local.length+n.length+b.length;
 }
 const size=central.reduce((s,a)=>s+a.length,0),end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,Object.keys(files).length);u16(end,Object.keys(files).length);u32(end,size);u32(end,offset);u16(end,0);
 return new Blob([...all,...central,new Uint8Array(end)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function cell(ref,value,formula){
 if(formula)return '<c r="'+ref+'"><f>'+X(formula)+'</f><v>'+N(value)+'</v></c>';
 return typeof value==='number'?'<c r="'+ref+'"><v>'+value+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t>'+X(value)+'</t></is></c>';
}
function spreadsheet(item,kind,options={}){
 const p=normal(item,kind,options.qty);
 const rows=[];
 const add=(n,vals)=>rows.push('<row r="'+n+'">'+vals.map((v,i)=>cell(String.fromCharCode(65+i)+n,v)).join('')+'</row>');
 add(1,['Kinder Naturals | Production worksheet']);
 add(2,['Product',p.name]);add(3,['Batch number',p.number||'Not assigned']);add(4,['Record type',kind]);add(5,['Formula version',String(p.version)]);add(6,['Unit',p.unit]);add(7,['Fill size',p.fill]);add(8,['Quantity of units',p.units]);add(9,['Total required',p.total]);add(11,['Ingredient','Percentage','Required ('+p.unit+')','Weighed','Supplier lot']);
 let r=12;
 for(const i of p.list){
 const formula='B'+r+'*$B$7*$B$8/100';
 rows.push('<row r="'+r+'">'+cell('A'+r,i.name)+cell('B'+r,i.percent)+cell('C'+r,i.amount,formula)+cell('D'+r,i.checked?'Yes':'No')+cell('E'+r,i.lot)+'</row>');
 r++;
 }
 rows.push('<row r="'+r+'">'+cell('A'+r,'TOTAL')+cell('B'+r,100,'SUM(B12:B'+(r-1)+')')+cell('C'+r,p.total,'SUM(C12:C'+(r-1)+')')+'</row>');
 add(r+2,['Actual units produced',p.actual??'']);add(r+3,['Production notes',options.notes===false?'':p.notes]);
 const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="36" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/><col min="4" max="4" width="15" customWidth="1"/><col min="5" max="5" width="28" customWidth="1"/></cols><sheetData>'+rows.join('')+'</sheetData></worksheet>';
 const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Production worksheet" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
 const rel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
 const root='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
 const blob=zip({'[Content_Types].xml':types,'_rels/.rels':root,'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':rel,'xl/worksheets/sheet1.xml':sheet});
 const a=document.createElement('a'),url=URL.createObjectURL(blob);
 a.href=url;a.download='KN-'+slug(p.number||p.name)+'-worksheet.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function email(item,kind,options={}){
 const p=normal(item,kind,options.qty),subject='KN Production | '+p.name+' | '+(p.number||'Formula '+p.version);
 const body='Kinder Naturals '+(kind==='batch'?'production batch':'formula')+'\n\nProduct: '+p.name+'\nBatch: '+(p.number||'Not assigned')+'\nVersion: '+p.version+'\nQuantity: '+p.units+' x '+p.fill+p.unit+'\nTotal: '+fmt(p.total)+' '+p.unit+'\n\n'+p.list.map(i=>i.name+': '+fmt(i.amount)+' '+p.unit+' ('+i.percent+'%)').join('\n')+'\n\nFor a formatted attachment, download the PDF or Excel file from Production and attach it to this email draft. This email draft does not automatically attach files.';
 const link='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 window.location.href=link;
}
window.KNProductionExport={pdf,spreadsheet,email};
})();