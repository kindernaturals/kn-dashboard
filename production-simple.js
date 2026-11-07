(function(){
'use strict';
// Simpler two-mode production interface. Preserves production_v1 history and existing formulas.
const KEY='production_v1';
let store={masters:[],labs:[],batches:[]},ready=false,mode='original',sourceId='',draft=null,batchNo='',qty=5,working=false,openBatch='';
const el=id=>document.getElementById(id),esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),num=x=>Number(x),fmt=x=>Number(x).toLocaleString('en-GB',{maximumFractionDigits:3}),uid=()=> 'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function message(s){const x=el('simpleNotice');if(x)x.textContent=s;}
function makeNo(){
 const d=new Date(),day=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
 const used=new Set(store.batches.map(x=>String(x.number||'').toUpperCase()));
 let n=1,v;do{v='KN-'+day+'-'+String(n++).padStart(3,'0')}while(used.has(v)&&n<100000);
 return v;
}
async function load(){
 if(ready)return;
 const {data,error}=await sbClient.from('nns_settings').select('value').eq('key',KEY).maybeSingle();
 if(error)throw error;
 const v=data?.value||{};
 store={...v,masters:Array.isArray(v.masters)?v.masters:[],labs:Array.isArray(v.labs)?v.labs:[],batches:Array.isArray(v.batches)?v.batches:[]};
 batchNo=makeNo();ready=true;
}
async function save(){
 if(currentUser!=='owner')throw Error('Only the account owner can save production batches with the current access settings.');
 if(working)throw Error('A save is already in progress.');
 working=true;
 try{
 const {error}=await sbClient.from('nns_settings').upsert({key:KEY,value:store});
 if(error)throw error;
 }finally{working=false;}
}
function sources(){
 const items=[];
 for(const p of products||[]){
 if(!Array.isArray(p.formula)||!p.formula.length)continue;
 const missing=p.formula.filter(r=>!ingredients.some(i=>String(i.id)===String(r.ingId)));
 const unit=p.formulaBatchUnit==='kg'?'g':p.formulaBatchUnit==='L'?'ml':p.formulaBatchUnit;
 const lines=p.formula.map(r=>({name:ingredients.find(i=>String(i.id)===String(r.ingId))?.name||'Missing ingredient',percent:num(r.pct)}));
 items.push({id:'product:'+p.id,name:p.name||'Unnamed product',fill:num(p.formulaFillSize),unit,ingredients:lines,valid:!missing.length&&['g','ml'].includes(unit)&&num(p.formulaFillSize)>0,sourceType:'product',version:'Original product formula'});
 }
 for(const m of store.masters){
 if(store.masters.some(x=>x.name.toLowerCase()===m.name.toLowerCase()&&x.version>m.version))continue;
 items.push({id:'master:'+m.id,name:m.name,fill:num(m.fill),unit:m.unit,ingredients:m.ingredients.map(i=>({...i})),valid:true,sourceType:'master',version:m.version});
 }
 return items.sort((a,b)=>a.name.localeCompare(b.name,'en-GB',{sensitivity:'base'}));
}
function selected(){return sources().find(s=>s.id===sourceId)||null;}
function pickDefault(){const list=sources();if(!list.some(x=>x.id===sourceId))sourceId=list[0]?.id||'';if(!batchNo)batchNo=makeNo();if(!draft&&selected())copySelected();}
function copySelected(){const s=selected();draft=s?{name:s.name,fill:s.fill,unit:s.unit,ingredients:s.ingredients.map(i=>({...i}))}:null;}
function validFormula(){
 if(!draft)throw Error('Select a product formula.');
 if(!Number.isFinite(num(draft.fill))||num(draft.fill)<=0)throw Error('Enter a positive size per unit.');
 if(!['g','ml'].includes(draft.unit))throw Error('Confirm the measurement unit (g or ml).');
 if(!Number.isSafeInteger(qty)||qty<1||qty>100000)throw Error('Enter a whole-number quantity between 1 and 100,000.');
 if(!draft.ingredients.length||draft.ingredients.some(i=>!i.name?.trim()||!Number.isFinite(num(i.percent))||num(i.percent)<=0))throw Error('Enter valid ingredient names and percentages.');
 const total=draft.ingredients.reduce((t,i)=>t+num(i.percent),0);
 if(Math.abs(total-100)>0.00001)throw Error('Formula must total 100%. Currently '+fmt(total)+'%.');
 const number=String(batchNo).trim();
 if(!number||number.length>80)throw Error('Enter a batch number up to 80 characters.');
 if(store.batches.some(b=>String(b.number).toLowerCase()===number.toLowerCase()))throw Error('This batch number already exists in history.');
 return number;
}
function inputRows(){
 if(!draft)return '';
 return draft.ingredients.map((i,j)=>{
 const p=num(i.percent),amount=num(draft.fill)*qty*p/100;
 return '<tr><td>'+(mode==='editable'?'<input style="width:100%;min-width:140px" aria-label="Ingredient name" value="'+esc(i.name)+'" oninput="simpleEditIngredient('+j+',\'name\',this.value)">':esc(i.name))+'</td>'+
 '<td>'+(mode==='editable'?'<input style="max-width:95px" aria-label="Ingredient percentage" type="number" step="any" min="0" value="'+esc(i.percent)+'" oninput="simpleEditIngredient('+j+',\'percent\',this.value)">':fmt(p)+'%')+'</td>'+
 '<td style="text-align:right"><strong id="simpleAmount'+j+'">'+(Number.isFinite(amount)?fmt(amount):'—')+' '+esc(draft.unit)+'</strong></td>'+
 (mode==='editable'?'<td><button class="btn btn-outline btn-xs" onclick="simpleRemoveIngredient('+j+')">Remove</button></td>':'')+'</tr>';
 }).join('');
}
function history(){
 let s='<div class="card" style="margin-top:16px"><div class="card-head"><span class="card-title">Saved production batches</span></div>';
 s+=store.batches.length?'<table class="tbl"><thead><tr><th>Batch number</th><th>Product</th><th>Units</th><th></th></tr></thead><tbody>'+
 [...store.batches].reverse().map(b=>'<tr><td>'+esc(b.number)+'</td><td>'+esc(b.name)+'</td><td>'+esc(b.qty)+'</td><td><button class="btn btn-outline btn-sm" onclick="simpleOpenBatch(\''+esc(b.id)+'\')">Open</button></td></tr>').join('')+'</tbody></table>':'<p class="hint">No saved batches yet.</p>';
 return s+'</div><div id="simpleHistoryDetail"></div>';
}
function render(){
 const panel=el('prodContent');if(!panel)return;
 pickDefault();const list=sources(),s=selected();
 let html='<div class="section-head"><span class="section-title">Production</span></div><p class="hint">Select your original recipe or make an editable copy for this batch. Your product details, pricing and original formulas remain unchanged.</p>'+
 '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><button class="btn '+(mode==='original'?'btn-purple':'btn-outline')+'" onclick="simpleMode(\'original\')">Original Formula</button><button class="btn '+(mode==='editable'?'btn-purple':'btn-outline')+'" onclick="simpleMode(\'editable\')">Editable Formula</button></div>'+
 '<div id="simpleNotice" style="font-size:13px;color:var(--purple);margin-bottom:10px" role="status"></div>'+
 '<div class="card"><div class="card-head"><span class="card-title">'+(mode==='original'?'Create batch from original formula':'Create batch from editable copy')+'</span></div>'+
 '<div class="field"><label for="simpleSource">Product formula</label><select id="simpleSource" onchange="simpleSourceChange(this.value)"><option value="">Select a formula</option>'+
 list.map(x=>'<option value="'+esc(x.id)+'" '+(sourceId===x.id?'selected':'')+'>'+esc(x.name)+' ('+esc(String(x.version))+')</option>').join('')+'</select></div>';
 if(!s)html+='<p class="hint">No saved product formulas are available. Add the original formula in Products first; it will appear here automatically.</p>';
 else{
 html+='<div class="grid-2"><div class="field"><label for="simpleBatchNo">Batch number (automatically filled, editable)</label><input id="simpleBatchNo" value="'+esc(batchNo)+'" oninput="simpleBatchChange(this.value)"></div>'+
 '<div class="field"><label for="simpleQty">Number of units to make</label><input id="simpleQty" type="number" min="1" max="100000" step="1" value="'+qty+'" oninput="simpleQtyChange(this.value)"></div></div>'+
 '<div class="grid-2"><div class="field"><label for="simpleFill">Size per unit</label><input id="simpleFill" type="number" min="0.001" step="any" value="'+esc(draft?.fill||'')+'" '+(mode==='original'?'readonly':'oninput="simpleFillChange(this.value)"')+'></div>'+
 '<div class="field"><label>Measurement unit</label>'+(mode==='original'?'<input readonly value="'+esc(draft?.unit||'')+'">':'<select onchange="simpleUnitChange(this.value)"><option value="g" '+(draft?.unit==='g'?'selected':'')+'>g</option><option value="ml" '+(draft?.unit==='ml'?'selected':'')+'>ml</option></select>')+'</div></div>'+
 '<p id="simpleTotal" style="margin:12px 0;font-weight:600;color:var(--purple)"></p>'+
 (!s.valid?'<p style="color:var(--danger)">The original product has missing ingredients or an incomplete fill size/unit. Complete that formula in Products before saving a batch.</p>':'')+
 '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Ingredient</th><th>Formula %</th><th>Amount to weigh</th>'+(mode==='editable'?'<th></th>':'')+'</tr></thead><tbody id="simpleIngredients">'+inputRows()+'</tbody><tfoot><tr><th>Total</th><th id="simplePercent"></th><th id="simpleWeight"></th>'+(mode==='editable'?'<th></th>':'')+'</tr></tfoot></table></div>'+
 (mode==='editable'?'<button class="btn btn-outline btn-sm" style="margin:12px 0" onclick="simpleAddIngredient()">+ Add ingredient</button><p class="hint">Changes apply to this batch only. The original recipe is not altered.</p>':'<p class="hint" style="margin-top:12px">This is your original saved formula, read-only. Adjust only the quantity and batch number.</p>')+
 '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-purple" onclick="simpleSaveBatch()">Save batch</button><button class="btn btn-outline" onclick="simpleExport(\'pdf\')">Print / PDF</button><button class="btn btn-outline" onclick="simpleExport(\'spreadsheet\')">Excel</button><button class="btn btn-outline" onclick="simpleExport(\'email\')">Email draft</button></div>';
 }
 html+='</div>'+history();panel.innerHTML=html;updateTotals();
 if(openBatch)openHistory(openBatch);
}
function updateTotals(){
 if(!draft)return;
 const total=draft.ingredients.reduce((a,i)=>a+(num(i.percent)||0),0),t=num(draft.fill)*qty;
 const p=el('simplePercent'),w=el('simpleWeight'),v=el('simpleTotal');
 if(p)p.textContent=fmt(total)+'%';
 if(w)w.textContent=fmt(t*total/100)+' '+draft.unit;
 if(v)v.textContent=Number.isFinite(t)?qty+' × '+fmt(num(draft.fill))+' '+draft.unit+' = '+fmt(t)+' '+draft.unit+' total':'Check unit size and quantity.';
 draft.ingredients.forEach((i,j)=>{const x=el('simpleAmount'+j);if(x)x.textContent=fmt(t*num(i.percent)/100)+' '+draft.unit;});
}
window.simpleMode=m=>{mode=m;copySelected();render();};
window.simpleSourceChange=id=>{sourceId=id;copySelected();render();};
window.simpleBatchChange=n=>{batchNo=n;};
window.simpleQtyChange=n=>{qty=num(n);updateTotals();};
window.simpleFillChange=n=>{if(draft){draft.fill=n;updateTotals();}};
window.simpleUnitChange=n=>{if(draft){draft.unit=n;render();}};
window.simpleEditIngredient=(j,k,v)=>{if(draft?.ingredients[j]){draft.ingredients[j][k]=v;updateTotals();}};
window.simpleAddIngredient=()=>{draft?.ingredients.push({name:'',percent:''});render();};
window.simpleRemoveIngredient=j=>{draft?.ingredients.splice(j,1);render();};
function snapshot(){
 const number=validFormula(),s=selected();
 if(mode==='original'&&!s.valid)throw Error('Original formula is incomplete; correct it in Products first.');
 const b={id:uid(),number,name:draft.name,formulaId:s.id,version:s.version,sourceType:mode==='editable'?'Edited batch copy':'Original formula',fill:num(draft.fill),unit:draft.unit,qty,ingredients:draft.ingredients.map(i=>({name:i.name.trim(),percent:num(i.percent),amount:num(draft.fill)*qty*num(i.percent)/100,checked:false,lot:''})),status:'Planned',actual:null,notes:'',createdAt:new Date().toISOString()};
 return b;
}
window.simpleSaveBatch=async()=>{
 let b;try{b=snapshot();}catch(e){message(e.message);return;}
 store.batches.push(b);
 try{await save();batchNo=makeNo();openBatch=b.id;render();message('Batch '+b.number+' saved. Your original formula was not changed.');}
 catch(e){store.batches.pop();message(e.message);}
};
window.simpleExport=format=>{
 let b;try{b=snapshot();}catch(e){message(e.message);return;}
 if(!window.KNProductionExport){message('Export tools unavailable. Refresh and try again.');return;}
 try{window.KNProductionExport[format](b,'batch',{qty:b.qty});}catch(e){message(e.message);}
};
function openHistory(id){
 const b=store.batches.find(x=>x.id===id),target=el('simpleHistoryDetail');if(!b||!target)return;
 target.innerHTML='<div class="card" style="margin-top:14px"><div class="card-head"><span class="card-title">Batch '+esc(b.number)+'</span></div>'+
 '<p>'+esc(b.name)+' · '+b.qty+' × '+fmt(b.fill)+' '+esc(b.unit)+' · '+esc(b.status||'Planned')+'</p>'+
 '<table class="tbl"><thead><tr><th>Done</th><th>Ingredient</th><th>Amount</th><th>Supplier lot</th></tr></thead><tbody>'+
 b.ingredients.map((i,j)=>'<tr><td><input type="checkbox" '+(i.checked?'checked':'')+' onchange="simpleCheck('+j+',this.checked)"></td><td>'+esc(i.name)+'</td><td>'+fmt(i.amount)+' '+esc(b.unit)+'</td><td><input value="'+esc(i.lot||'')+'" onchange="simpleLot('+j+',this.value)"></td></tr>').join('')+'</tbody></table>'+
 '<div class="grid-2"><div class="field"><label>Actual units filled</label><input id="simpleActual" type="number" min="0" step="1" value="'+(b.actual??'')+'"></div>'+
 '<div class="field"><label>Status</label><select id="simpleStatus">'+['Planned','In progress','Completed','Cancelled'].map(v=>'<option '+(v===b.status?'selected':'')+'>'+v+'</option>').join('')+'</select></div></div>'+
 '<div class="field"><label>Notes</label><textarea id="simpleNotes">'+esc(b.notes||'')+'</textarea></div>'+
 '<button class="btn btn-purple" onclick="simpleUpdateBatch()">Save record</button> <button class="btn btn-outline" onclick="simpleHistoryExport(\'pdf\')">PDF</button> <button class="btn btn-outline" onclick="simpleHistoryExport(\'spreadsheet\')">Excel</button> <button class="btn btn-outline" onclick="simpleHistoryExport(\'email\')">Email</button></div>';
}
window.simpleOpenBatch=id=>{openBatch=id;openHistory(id);};
window.simpleCheck=(j,x)=>{const b=store.batches.find(x=>x.id===openBatch);if(b)b.ingredients[j].checked=x;};
window.simpleLot=(j,x)=>{const b=store.batches.find(x=>x.id===openBatch);if(b)b.ingredients[j].lot=x;};
window.simpleHistoryExport=type=>{const b=store.batches.find(x=>x.id===openBatch);if(b&&window.KNProductionExport)window.KNProductionExport[type](b,'batch',{qty:b.qty});};
window.simpleUpdateBatch=async()=>{
 const b=store.batches.find(x=>x.id===openBatch);if(!b)return;
 const val=el('simpleActual').value;
 if(val!==''&&(!Number.isSafeInteger(num(val))||num(val)<0)){message('Actual units must be a non-negative whole number.');return;}
 const old={actual:b.actual,status:b.status,notes:b.notes};
 b.actual=val===''?null:num(val);b.status=el('simpleStatus').value;b.notes=el('simpleNotes').value;
 try{await save();render();message('Batch record updated.');}catch(e){Object.assign(b,old);message(e.message);}
};
window.renderProduction=async()=>{
 const panel=el('prodContent');if(!panel)return;
 panel.innerHTML='<p class="hint">Loading production...</p>';
 try{await load();render();}catch(e){panel.textContent='Production could not load: '+e.message;}
};
})();