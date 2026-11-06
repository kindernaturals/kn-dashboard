(function(){
'use strict';
const KEY='production_v1';
let data={masters:[],labs:[],batches:[]}, loaded=false, view='batches', draft=null, chosen='', qty=5, batchId='', saveBusy=false;
const E=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const by=id=>document.getElementById(id);
const guid=()=> 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const nameKey=s=>String(s||'').trim().toLowerCase();
const fmt=n=>Number(n.toFixed(3)).toLocaleString('en-GB',{maximumFractionDigits:3});
const activeMasters=()=>data.masters.filter(m=>!data.masters.some(n=>n.name.toLowerCase()===m.name.toLowerCase()&&n.version>m.version));
function msg(t){const el=by('prodMessage');if(el)el.textContent=t;}
async function read(){
  if(loaded)return;
  const {data:rows,error}=await sbClient.from('nns_settings').select('value').eq('key',KEY).limit(1);
  if(error)throw error;
  const obj=rows&&rows[0]&&rows[0].value;
  if(obj&&typeof obj==='object')data={masters:Array.isArray(obj.masters)?obj.masters:[],labs:Array.isArray(obj.labs)?obj.labs:[],batches:Array.isArray(obj.batches)?obj.batches:[]};
  loaded=true;
}
async function save(){
  if(saveBusy)throw Error('Another production save is in progress.');
  if(currentUser!=='owner')throw Error('Only the account owner can save production records with the current permissions.');
  saveBusy=true;
  try {
    const {error}=await sbClient.from('nns_settings').upsert({key:KEY,value:data});
    if(error)throw error;
    setSS('ok','✓ Production saved');
  }finally{saveBusy=false;}
}
function tabs(){return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px">'+[['batches','Production Batches'],['masters','Master Formulas'],['lab','Formula Lab']].map(t=>'<button class="btn '+(view===t[0]?'btn-purple':'btn-outline')+'" onclick="productionSelect(\''+t[0]+'\')">'+t[1]+'</button>').join('')+'</div>';}
function title(t,desc){return '<div class="section-head"><span class="section-title">'+t+'</span></div><p class="hint" style="margin:0 0 16px">'+desc+'</p>';}
function home(){
 const el=by('prodContent');if(!el)return;
 let html=title('Production','Independent formulation, experiments and manufacturing records. No prices or product records are changed.')+tabs()+'<div id="prodMessage" aria-live="polite" style="color:var(--purple);font-size:13px;margin-bottom:8px"></div>';
 if(view==='masters')html+=mastersHtml();
 if(view==='lab')html+=labHtml();
 if(view==='batches')html+=batchesHtml();
 el.innerHTML=html;
}
function formulaRows(x){return (x.ingredients||[]).map(i=>'<tr><td>'+E(i.name)+'</td><td style="text-align:right">'+fmt(Number(i.percent))+'%</td></tr>').join('');}
function mastersHtml(){
 return '<div class="card"><div class="card-head"><span class="card-title">Approved master formulas</span><button class="btn btn-purple btn-sm" onclick="productionNew(\'master\')">+ New approved formula</button></div>'+
 (data.masters.length?'<table class="tbl"><thead><tr><th>Product</th><th>Fill</th><th>Version</th><th>Approved</th><th></th></tr></thead><tbody>'+
 [...data.masters].reverse().map(m=>'<tr><td>'+E(m.name)+'</td><td>'+fmt(m.fill)+' '+E(m.unit)+'</td><td>v'+m.version+'</td><td>'+E(m.approvedAt?.slice(0,10)||'')+'</td><td><button class="btn btn-outline btn-sm" onclick="productionInspect(\''+m.id+'\')">View</button> <button class="btn btn-outline btn-sm" onclick="productionCopyLab(\''+m.id+'\')">Revise in lab</button></td></tr>').join('')+'</tbody></table>':'<p class="hint">No master formulas yet. Add an approved recipe to begin.</p>')+'</div>'+editorHtml();
}
function labHtml(){
 return '<div class="card"><div class="card-head"><span class="card-title">Formula Lab</span><button class="btn btn-purple btn-sm" onclick="productionNew(\'lab\')">+ New experiment</button></div>'+
 (data.labs.length?'<table class="tbl"><thead><tr><th>Experiment</th><th>Size</th><th>Status</th><th></th></tr></thead><tbody>'+data.labs.map(l=>'<tr><td>'+E(l.name)+'</td><td>'+fmt(l.fill)+' '+E(l.unit)+'</td><td>Test / unapproved</td><td><button class="btn btn-outline btn-sm" onclick="productionEditLab(\''+l.id+'\')">Edit</button> <button class="btn btn-outline btn-sm" onclick="productionApprove(\''+l.id+'\')">Approve as master</button></td></tr>').join('')+'</tbody></table>':'<p class="hint">Develop a formula here without changing an approved recipe.</p>')+'</div>'+editorHtml();
}
function editorHtml(){
 if(!draft)return '';
 const lines=(draft.ingredients||[]).map(i=>i.name+' | '+i.percent).join('\n');
 return '<div class="card" style="margin-top:16px"><div class="card-head"><span class="card-title">'+(draft.kind==='lab'?'Formula experiment':'New approved formula')+'</span><button class="btn btn-outline btn-sm" onclick="productionCancel()">Cancel</button></div>'+
 '<div class="grid-2"><div class="field"><label>Product name</label><input id="pName" value="'+E(draft.name)+'" placeholder="Rose Body Butter"></div>'+
 '<div class="field"><label>Fill size per unit</label><input type="number" id="pFill" value="'+E(draft.fill)+'" min="0.001" step="any"></div></div>'+
 '<div class="field"><label>Measurement unit</label><select id="pUnit"><option value="g" '+(draft.unit==='g'?'selected':'')+'>g</option><option value="ml" '+(draft.unit==='ml'?'selected':'')+'>ml</option></select></div>'+
 '<div class="field"><label>Ingredients and percentages, one per line: Ingredient | Percentage</label><textarea id="pLines" rows="8" placeholder="Shea butter | 50\nMango butter | 30">'+E(lines)+'</textarea></div>'+
 '<p class="hint">Percentages must add to 100%. For an oil or butter blend use weight (g); do not interchange grams and millilitres without a validated density conversion. Save only a verified formula.</p>'+
 '<button class="btn btn-purple" onclick="productionSaveFormula()">Save '+(draft.kind==='lab'?'experiment':'approved formula')+'</button></div>';
}
function parseInput(){
 const name=by('pName').value.trim(),fill=Number(by('pFill').value),unit=by('pUnit').value;
 if(!name||!(fill>0)||!Number.isFinite(fill))throw Error('Enter a product name and a positive fill size.');
 const lines=by('pLines').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const ing=lines.map(s=>{const pos=s.lastIndexOf('|');if(pos<1)throw Error('Use Ingredient | Percentage on every line.');return {name:s.slice(0,pos).trim(),percent:Number(s.slice(pos+1).trim())};});
 if(!ing.length||ing.some(i=>!i.name||!Number.isFinite(i.percent)||i.percent<=0))throw Error('Provide valid ingredients and positive percentages.');
 const total=ing.reduce((a,b)=>a+b.percent,0);
 if(Math.abs(total-100)>0.00001)throw Error('Percentages add to '+fmt(total)+'%, not 100%.');
 return {name,fill,unit,ingredients:ing};
}
window.productionSelect=type=>{view=type;draft=null;home();};
window.productionNew=kind=>{view=kind==='master'?'masters':'lab';draft={kind,name:'',fill:200,unit:'g',ingredients:[]};home();};
window.productionCancel=()=>{draft=null;home();};
window.productionSaveFormula=async()=>{
 try{
  const f=parseInput(),now=new Date().toISOString();
  if(draft.kind==='master'){
   const old=data.masters.filter(m=>nameKey(m.name)===nameKey(f.name));
   const next={...f,id:guid(),version:Math.max(0,...old.map(m=>m.version))+1,approvedAt:now};
   data.masters.push(next);
  }else{
   const id=draft.id||guid(),next={...f,id,createdAt:draft.createdAt||now,updatedAt:now,kind:'lab'};
   data.labs=data.labs.filter(x=>x.id!==id).concat(next);
  }
  await save();draft=null;home();msg('Formula saved.');
 }catch(e){msg(e.message);}
};
window.productionEditLab=id=>{const l=data.labs.find(x=>x.id===id);if(l){draft={...l,kind:'lab'};view='lab';home();}};
window.productionCopyLab=id=>{const m=data.masters.find(x=>x.id===id);if(m){draft={...m,id:null,kind:'lab',name:m.name,createdAt:null};view='lab';home();}};
window.productionApprove=async id=>{
 const l=data.labs.find(x=>x.id===id);if(!l)return;
 if(!confirm('Approve this tested formula as a new master version? This will not edit earlier versions or pricing.'))return;
 const old=data.masters.filter(m=>nameKey(m.name)===nameKey(l.name));
 data.masters.push({name:l.name,fill:l.fill,unit:l.unit,ingredients:l.ingredients.map(i=>({...i})),id:guid(),version:Math.max(0,...old.map(m=>m.version))+1,approvedAt:new Date().toISOString()});
 try{await save();view='masters';home();msg('New master formula version approved.');}catch(e){data.masters.pop();msg(e.message);}
};
window.productionInspect=id=>{
 const m=data.masters.find(x=>x.id===id);if(!m)return;
 draft=null;home();
 const el=by('prodMessage');el.innerHTML='<div class="card"><strong>'+E(m.name)+' v'+m.version+'</strong> ('+fmt(m.fill)+' '+E(m.unit)+')<table class="tbl"><tbody>'+formulaRows(m)+'</tbody></table><p class="hint">Approved '+E(m.approvedAt||'')+'</p></div>';
};
function chooseOptions(){return activeMasters().map(m=>'<option value="'+E(m.id)+'" '+(chosen===m.id?'selected':'')+'>'+E(m.name)+' · '+fmt(m.fill)+E(m.unit)+' · v'+m.version+'</option>').join('');}
function calculation(m){return m.ingredients.map(i=>({name:i.name,percent:i.percent,amount:m.fill*qty*i.percent/100}));}
function batchesHtml(){
 const m=activeMasters().find(x=>x.id===chosen)||activeMasters()[0];if(m)chosen=m.id;
 let s='<div class="card"><div class="card-head"><span class="card-title">Create production batch</span></div>';
 if(!m)s+='<p class="hint">Add an approved master formula first, then return here to generate a production worksheet.</p><button class="btn btn-purple" onclick="productionNew(\'master\')">+ Add master formula</button>';
 else{
  s+='<div class="field"><label>Approved product</label><select id="batchFormula" onchange="productionChoose(this.value)">'+chooseOptions()+'</select></div>'+
  '<div class="grid-2"><div class="field"><label>Quantity of units</label><input id="batchQty" type="number" min="1" step="1" value="'+qty+'" onchange="productionQty(this.value)"></div><div class="field"><label>Batch number (editable)</label><input id="batchNo" value="'+E(batchId||defaultBatch())+'" oninput="productionBatchNo(this.value)"></div></div>'+
  '<p><strong>Total: '+fmt(m.fill*qty)+' '+E(m.unit)+'</strong> for '+qty+' × '+fmt(m.fill)+E(m.unit)+' units</p>'+
  '<table class="tbl"><thead><tr><th>Ingredient</th><th>%</th><th>Required ('+E(m.unit)+')</th></tr></thead><tbody>'+
  calculation(m).map(i=>'<tr><td>'+E(i.name)+'</td><td>'+fmt(i.percent)+'%</td><td><strong>'+fmt(i.amount)+'</strong></td></tr>').join('')+
  '</tbody></table><p class="hint">All quantities derive from a frozen copy of the approved version. No pricing or stock movement occurs.</p>'+
  '<button class="btn btn-purple" onclick="productionCreateBatch()">Save batch worksheet</button>';
 }
 s+='</div><div class="card" style="margin-top:16px"><div class="card-head"><span class="card-title">Production history</span></div>';
 s+=data.batches.length?'<table class="tbl"><thead><tr><th>Batch</th><th>Product</th><th>Units</th><th>Status</th><th></th></tr></thead><tbody>'+[...data.batches].reverse().map(b=>'<tr><td>'+E(b.number)+'</td><td>'+E(b.name)+'</td><td>'+b.qty+'</td><td>'+E(b.status)+'</td><td><button class="btn btn-outline btn-sm" onclick="productionViewBatch(\''+b.id+'\')">Open</button></td></tr>').join('')+'</tbody></table>':'<p class="hint">No saved batches yet.</p>';
 return s+'</div><div id="batchDetail"></div>';
}
function defaultBatch(){const d=new Date(),date=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');return 'KN-'+date+'-'+String(Math.floor(Math.random()*9000)+1000);}
window.productionChoose=id=>{chosen=id;batchId=by('batchNo')?.value||'';home();};
window.productionQty=n=>{if(!Number.isSafeInteger(Number(n))||Number(n)<1||Number(n)>100000){msg('Enter a whole number between 1 and 100,000.');return;}qty=Number(n);batchId=by('batchNo')?.value||'';home();};
window.productionBatchNo=n=>{batchId=n;};
window.productionCreateBatch=async()=>{
 const m=activeMasters().find(x=>x.id===chosen);if(!m)return;
 const number=(by('batchNo')?.value||'').trim();
 if(!number||number.length>80){msg('Enter a batch number (80 characters maximum).');return;}
 if(data.batches.some(b=>b.number.toLowerCase()===number.toLowerCase())){msg('Batch number already exists. Choose another.');return;}
 const b={id:guid(),number,formulaId:m.id,version:m.version,name:m.name,fill:m.fill,unit:m.unit,ingredients:calculation(m).map(i=>({...i,checked:false,lot:''})),qty,actual:null,status:'Planned',notes:'',createdAt:new Date().toISOString()};
 data.batches.push(b);
 try{await save();batchId='';home();productionViewBatch(b.id);msg('Batch saved.');}catch(e){data.batches.pop();msg(e.message);}
};
window.productionViewBatch=id=>{
 const b=data.batches.find(x=>x.id===id),el=by('batchDetail');if(!b||!el)return;
 el.innerHTML='<div class="card" id="prodPrint"><div class="card-head"><span class="card-title">Batch '+E(b.number)+'</span><button class="btn btn-outline btn-sm" onclick="window.print()">Print</button></div>'+
 '<p><strong>'+E(b.name)+'</strong> · Formula v'+b.version+' · '+b.qty+' × '+fmt(b.fill)+E(b.unit)+' · '+E(b.createdAt.slice(0,10))+'</p>'+
 '<table class="tbl"><thead><tr><th>Weighed</th><th>Ingredient</th><th>Required</th><th>Ingredient lot / supplier batch</th></tr></thead><tbody>'+
 b.ingredients.map((i,j)=>'<tr><td><input type="checkbox" '+(i.checked?'checked':'')+' onchange="productionCheck(\''+b.id+'\','+j+',this.checked)"></td><td>'+E(i.name)+'</td><td>'+fmt(i.amount)+' '+E(b.unit)+'</td><td><input style="max-width:190px" value="'+E(i.lot||'')+'" onchange="productionLot(\''+b.id+'\','+j+',this.value)"></td></tr>').join('')+'</tbody></table>'+
 '<div class="grid-2"><div class="field"><label>Actual units filled</label><input type="number" min="0" step="1" id="actualBatch" value="'+(b.actual??'')+'" placeholder="Units filled"></div>'+
 '<div class="field"><label>Production status</label><select id="statusBatch">'+['Planned','In progress','Completed','Cancelled'].map(s=>'<option '+(s===b.status?'selected':'')+'>'+s+'</option>').join('')+'</select></div></div>'+
 '<div class="field"><label>Production notes / observations</label><textarea id="notesBatch" rows="3">'+E(b.notes||'')+'</textarea></div>'+
 '<button class="btn btn-purple" onclick="productionSaveBatch(\''+b.id+'\')">Save batch record</button></div>';
};
window.productionCheck=(id,j,v)=>{const b=data.batches.find(x=>x.id===id);if(b)b.ingredients[j].checked=v;};
window.productionLot=(id,j,v)=>{const b=data.batches.find(x=>x.id===id);if(b)b.ingredients[j].lot=v;};
window.productionSaveBatch=async id=>{
 const b=data.batches.find(x=>x.id===id);if(!b)return;
 const raw=by('actualBatch').value.trim(),actual=raw===''?null:Number(raw);
 if(actual!==null&&(!Number.isSafeInteger(actual)||actual<0)){msg('Actual yield must be a whole number of units.');return;}
 const prev={...b,ingredients:b.ingredients.map(i=>({...i}))};
 b.actual=actual;b.status=by('statusBatch').value;b.notes=by('notesBatch').value;b.updatedAt=new Date().toISOString();
 try{await save();home();productionViewBatch(id);msg('Batch record saved.');}catch(e){Object.assign(b,prev);msg(e.message);}
};
window.renderProduction=async()=>{
 const el=by('prodContent');if(!el)return;
 el.innerHTML='<p class="hint">Loading production data...</p>';
 try{await read();home();}catch(e){el.innerHTML='<p style="color:var(--danger)">Production data could not load: '+E(e.message)+'</p>';}
};
})();