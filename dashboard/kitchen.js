(() => {
  const $=id=>document.getElementById(id), core=window.KitchenCore;
  if(!$('meals-list')||!core)return;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>localDate(new Date());
  const monday=d=>{const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return localDate(x);};
  const shift=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return localDate(d);};
  const pretty=date=>date?new Date(date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):'';
  const amount=i=>i.unit==='each'?`${i.quantity}`:`${i.quantity} ${i.unit==='pack'&&i.quantity!==1?'packs':i.unit}`;
  let board=null,tab='meals',week=monday(new Date()),busy=false,loadSequence=0,search='';
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('dashboard-events'):null;
  const dialog=document.createElement('dialog');dialog.className='kitchen-dialog';document.body.appendChild(dialog);
  const status=(message,error=false)=>{$('meals-status').textContent=message;$('meals-status').classList.toggle('is-error',error);};
  const session=()=>{try{const s=JSON.parse(localStorage.getItem('dashboardSession'));return s?.token&&(!s.expires||s.expires>Date.now())?s:null;}catch{return null;}};
  function signIn(){const modal=$('login-modal');modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');$('login-username')?.focus();status('Sign in to make changes.');}
  async function refresh(){
    if(busy)return;const sequence=++loadSequence;
    try{const response=await fetch('/api/kitchen',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not load the kitchen.');if(sequence!==loadSequence)return;board=result;render();}
    catch(e){status(e.message,true);if(!board)$('meals-list').innerHTML='<p class="kitchen-empty">The kitchen could not load. Use Refresh to try again.</p>';}
  }
  async function change(action,data,message=''){
    if(busy||!board)return false;const auth=session();if(!auth){if(dialog.open)dialog.close();signIn();return false;}
    busy=true;++loadSequence;document.querySelectorAll('.kitchen-dialog button,#kitchen-add,#kitchen-quick-meal button').forEach(b=>b.disabled=true);
    try{
      const response=await fetch('/api/kitchen',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`},body:JSON.stringify({version:board.version,action,data})});
      const result=await response.json();if(!response.ok){if(response.status===409){busy=false;await refresh();}throw Error(result.error||'Could not save your change.');}
      board=result;render();status(message);channel?.postMessage({type:'events-updated'});window.dispatchEvent(new Event('kitchen-updated'));return true;
    }catch(e){status(e.message,true);const error=dialog.querySelector('[data-form-error]');if(error)error.textContent=e.message;return false;}
    finally{busy=false;document.querySelectorAll('.kitchen-dialog button,#kitchen-add,#kitchen-quick-meal button').forEach(b=>b.disabled=false);}
  }
  function openForm(title,body,onSubmit){
    if(!session()){signIn();return;}
    dialog.innerHTML=`<form><div class="kitchen-dialog-heading"><h2>${escape(title)}</h2><button type="button" data-dismiss aria-label="Close">×</button></div>${body}<p data-form-error role="alert"></p><div class="kitchen-form-actions"><button type="button" data-dismiss>Cancel</button><button class="action-button" type="submit">Save</button></div></form>`;
    dialog.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>dialog.close());
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();try{if(await onSubmit(new FormData(e.target)))dialog.close();}catch(error){dialog.querySelector('[data-form-error]').textContent=error.message;}};
    dialog.showModal();
  }
  const options=(values,current)=>values.map(v=>`<option ${v===current?'selected':''}>${escape(v)}</option>`).join('');
  const field=(label,name,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  function ingredientRow(i={name:'',quantity:1,unit:'each'}){
    const row=document.createElement('div');row.className='ingredient-row';
    row.innerHTML=`<input aria-label="Ingredient name" data-name list="kitchen-food-names" placeholder="Ingredient" value="${escape(i.name)}" required maxlength="200"><input aria-label="Ingredient quantity" data-quantity type="number" min="0.001" max="100000" step="any" value="${i.quantity}" required><select aria-label="Ingredient unit" data-unit>${options(core.units,i.unit)}</select><button type="button" aria-label="Remove ingredient">×</button>`;
    row.querySelector('button').onclick=()=>row.remove();dialog.querySelector('#ingredient-rows').appendChild(row);
  }
  function editMeal(id){
    const m=board.data.meals.find(x=>x.id===id)||{name:'',date:'',ingredients:[],notes:'',url:'',favorite:false};
    openForm(id?'Meal details':'Add a meal',`${field('Meal name','name',m.name,'text','required maxlength="200"')}
      ${field('Which day? (optional)','date',m.date,'date')}
      <fieldset><legend>Ingredients for this meal</legend><p class="kitchen-hint">Use the same ingredient names and units as the pantry. Add enough for everyone eating.</p><div id="ingredient-rows"></div><button type="button" id="ingredient-add">+ Ingredient</button></fieldset>
      ${field('Recipe link (optional)','url',m.url,'url')}
      <label>Recipe notes · did everyone like it?<textarea name="notes" rows="3" maxlength="4000">${escape(m.notes)}</textarea></label>
      <label class="kitchen-check"><input type="checkbox" name="favorite" ${m.favorite?'checked':''}>Family favorite</label>
      <datalist id="kitchen-food-names">${[...new Set(board.data.stock.map(x=>x.name))].map(n=>`<option value="${escape(n)}">`).join('')}</datalist>`,form=>change('meal-save',{id,...Object.fromEntries(form),favorite:form.has('favorite'),ingredients:[...dialog.querySelectorAll('.ingredient-row')].map(row=>({name:row.querySelector('[data-name]').value,quantity:Number(row.querySelector('[data-quantity]').value),unit:row.querySelector('[data-unit]').value}))},'Meal saved.'));
    if(!dialog.open)return;m.ingredients.forEach(ingredientRow);dialog.querySelector('#ingredient-add').onclick=()=>ingredientRow();
  }
  function editFood(kind,id,seed={}){
    const list=kind==='stock'?board.data.stock:board.data.groceries;
    const item=list.find(x=>x.id===id)||{name:'',quantity:1,unit:'each',place:'Pantry',bestBefore:'',notes:'',...seed};
    openForm(kind==='stock'?(id?'Edit item':'Add to pantry'):(id?'Edit shopping item':'Add to shopping list'),`${field('Item','name',item.name,'text','required maxlength="200"')}
      <div class="kitchen-form-row">${field('Quantity','quantity',item.quantity,'number',`min="${kind==='stock'?0:0.001}" max="100000" step="any" required`)}<label>Unit<select name="unit">${options(core.units,item.unit)}</select></label></div>
      <label>${kind==='stock'?'Stored in':'Put away in'}<select name="place">${options(core.places,item.place)}</select></label>
      ${kind==='stock'?`${field('Short name in the pantry','label',core.pantryInfo(item).label,'text','maxlength="200"')}<label>Group<select name="category">${options(core.categories,core.pantryInfo(item).category)}</select></label>`:''}
      ${kind==='stock'?field('Best-before date (optional)','bestBefore',item.bestBefore,'date'):''}
      <label>Notes (optional)<textarea name="notes" maxlength="500">${escape(item.notes)}</textarea></label>`,form=>change(kind==='stock'?'stock-save':'grocery-save',{id,...Object.fromEntries(form),checked:item.checked||false},kind==='stock'?'Pantry updated.':'Shopping list updated.'));
  }
  function plan(id){const m=board.data.meals.find(x=>x.id===id);openForm(m.status==='cooked'?'Make this again':'Plan this meal',field('Which day?','date',m.status==='planned'?m.date:(today()>=week&&today()<=shift(week,6)?today():week),'date','required'),form=>change('meal-plan',{id,date:form.get('date')},'Meal added to the calendar.'));}
  function cook(id){const m=board.data.meals.find(x=>x.id===id);const missing=core.shortages(board.data,[m]);openForm(`Cooked: ${m.name}`,`<p>Save this meal to Meals we’ve had.</p><label class="kitchen-check"><input type="checkbox" name="useIngredients" ${m.ingredients.length?'checked':''} ${m.ingredients.length?'':'disabled'}>Update what’s left in the pantry</label>${m.ingredients.length?`<ul class="kitchen-ingredients">${m.ingredients.map(i=>`<li>${escape(i.name)} · ${amount(i)}</li>`).join('')}</ul>`:'<p class="kitchen-hint">Add ingredients to this meal to update the pantry when you cook.</p>'}${missing.length?'<p class="kitchen-hint">A few ingredients aren’t in the pantry yet. We’ll update the ones you’ve added.</p>':''}`,form=>change('meal-cook',{id,useIngredients:form.has('useIngredients')},'Saved to Meals we’ve had.'));}
  function remove(kind,id){openForm('Remove this item?',`<p>This removes it from the kitchen${kind==='meal'?' and the calendar':''}.</p>`,()=>change(`${kind}-delete`,{id},'Item removed.'));}
  const button=(action,id,label)=>`<button type="button" data-action="${action}" data-id="${id}">${label}</button>`;
  function pantryList(items,filter) {
    const groups=new Map();
    for(const item of items){
      const info=core.pantryInfo(item);if(!filter({...item,name:`${item.name} ${info.label} ${info.category}`}))continue;
      const groupKey=`${info.category}|${info.label.toLowerCase()}`;
      if(!groups.has(groupKey))groups.set(groupKey,{...info,key:groupKey,items:[]});
      groups.get(groupKey).items.push(item);
    }
    const rows=[...groups.values()];
    if(!rows.length)return '<p class="kitchen-empty">'+(search?'No matches.':'Add what you have at home.')+'</p>';
    return `<div class="pantry-groups">${core.categories.map(category=>{
      const list=rows.filter(g=>g.category===category).sort((a,b)=>a.label.localeCompare(b.label));
      if(!list.length)return '';
      return `<section class="pantry-group"><h2>${escape(category)}</h2>${list.map(group=>{const used=group.items.every(item=>item.quantity===0),ids=group.items.map(item=>item.id);return `<div class="pantry-item ${used?'is-used':''}" data-pantry-key="${escape(group.key)}"><div class="pantry-row"><label><input type="checkbox" data-pantry-toggle="${escape(JSON.stringify(ids))}" ${used?'checked':''}><span>${escape(group.label)}</span></label><button type="button" class="pantry-expand" data-pantry-details aria-label="Details for ${escape(group.label)}" aria-expanded="false">+</button></div><div class="pantry-item-details" hidden>${group.items.map(item=>`<div class="pantry-package">${item.name!==group.label?`<strong>${escape(item.name)}</strong>`:''}<p>${amount(item)} · ${item.place}${item.quantity===0?' · Used up':''}</p>${item.bestBefore?`<p>Best before ${pretty(item.bestBefore)}</p>`:''}${item.notes?`<p class="kitchen-note">${escape(item.notes)}</p>`:''}<div class="kitchen-card-actions">${button('stock-edit',item.id,'Edit')}${button('stock-use',item.id,'Use some')}${button('stock-buy',item.id,'Buy more')}${button('stock-delete',item.id,'Remove')}</div></div>`).join('')}</div></div>`;}).join('')}</section>`;
    }).join('')}</div>`;
  }
  function mealCard(m){
    const missing=core.shortages(board.data,[m]);
    return `<article class="kitchen-meal" draggable="${m.status!=='cooked'}" data-meal-id="${m.id}">
      <div class="kitchen-card-top"><h3>${escape(m.name)}</h3>${m.favorite?'<span aria-label="Family favorite">★</span>':''}</div>
      <p class="kitchen-date">${m.status==='cooked'?`Cooked ${pretty(localDate(new Date(m.cookedAt)))}`:m.date?pretty(m.date):'Save for another night'}</p>
      ${m.ingredients.length?`<p class="kitchen-hint">${m.ingredients.length} ingredients · ${missing.length?`${missing.length} to buy`:'You have the ingredients'}</p>`:''}
      ${m.notes?`<p class="kitchen-note">${escape(m.notes)}</p>`:''}
      <div class="kitchen-card-actions">${button('meal-edit',m.id,'Details')}${button('meal-plan',m.id,m.status==='cooked'?'Make again':m.status==='planned'?'Move date':'Plan')}${m.status!=='cooked'?button('meal-cook',m.id,'Cooked'):''}${m.status==='planned'?button('meal-idea',m.id,'Back to ideas'):''}${button('meal-delete',m.id,'Remove')}${m.url?`<a href="${escape(m.url)}" target="_blank" rel="noopener noreferrer">Recipe ↗</a>`:''}</div>
    </article>`;
  }
  function render(){
    if(!board)return;const s=board.data;const end=shift(week,6);const filter=x=>core.key([x.name,x.notes,...(x.ingredients||[]).map(i=>i.name)].join(' ')).includes(core.key(search));
    const openPantry=new Set([...$('meals-list').querySelectorAll('[data-pantry-key] [data-pantry-details][aria-expanded="true"]')].map(el=>el.closest('[data-pantry-key]').dataset.pantryKey));
    $('meals-view').classList.toggle('pantry-active',tab==='stock');
    $('kitchen-overview').hidden=tab==='stock';
    document.querySelector('.meals-week').hidden=tab!=='meals';
    $('kitchen-quick-meal').hidden=tab!=='meals';
    $('kitchen-search').placeholder=tab==='stock'?'Find something in the pantry':'Find a meal or ingredient';
    $('meals-week-picker').value=week;$('meals-week-label').textContent=`${pretty(week)} – ${pretty(end)}`;
    $('meal-preview-title').textContent=s.meals.filter(m=>m.date===today()).map(m=>m.name).join(' + ')||'No dinner planned';
    const due=s.stock.filter(x=>x.quantity>0&&x.bestBefore&&x.bestBefore<=shift(today(),3)).sort((a,b)=>a.bestBefore.localeCompare(b.bestBefore));
    const tonight=s.meals.filter(m=>m.date===today()).map(m=>m.name).join(' + ');
    $('kitchen-overview').innerHTML=`<div><span>Tonight</span><strong>${escape(tonight||'Pick a meal for tonight')}</strong></div><button data-kitchen-tab="stock"><span>Use first</span><strong>${due.length?escape(due.slice(0,3).map(i=>i.name).join(', ')):(s.stock.some(i=>i.quantity>0&&i.bestBefore)?'Nothing to use up soon':'Add best-before dates')}</strong></button><button data-kitchen-tab="groceries"><span>To buy</span><strong>${s.groceries.filter(g=>!g.checked).length} items</strong></button>`;
    document.querySelectorAll('.kitchen-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kitchenTab===tab)));
    $('kitchen-add').textContent=tab==='meals'?'+ Add meal':tab==='stock'?'+ Add food':'+ Add item';
    let html='';
    if(tab==='meals'){
      const planned=s.meals.filter(m=>m.status==='planned'&&m.date>=week&&m.date<=end);
      html=`<div class="kitchen-week">${Array.from({length:7},(_,i)=>{const day=shift(week,i);return `<div class="kitchen-day ${day===today()?'is-today':''}" data-drop-date="${day}"><strong>${pretty(day)}</strong><span>${escape(planned.filter(m=>m.date===day).map(m=>m.name).join(' + ')||'—')}</span></div>`;}).join('')}</div><div class="kitchen-board">`;
      const lanes=[['Ideas',s.meals.filter(m=>m.status==='idea'),'Save dinners you want to try.','idea'],['This week',planned.sort((a,b)=>a.date.localeCompare(b.date)),'Plan a meal, or drag an idea onto a day.','planned'],['Meals we’ve had',s.meals.filter(m=>m.status==='cooked').sort((a,b)=>b.cookedAt.localeCompare(a.cookedAt)),'Meals you mark as cooked will appear here.','cooked']];
      for(const [title,items,empty,lane]of lanes){const matches=items.filter(filter);html+=`<section class="kitchen-lane" data-lane="${lane}"><h2>${title}<span>${items.length}</span></h2>${matches.map(mealCard).join('')||`<p class="kitchen-empty">${search?'No matches.':empty}</p>`}</section>`;}
      html+='</div>';
      const other=s.meals.filter(m=>m.status==='planned'&&(m.date<week||m.date>end)&&filter(m)).sort((a,b)=>b.date.localeCompare(a.date));
      if(other.length)html+=`<details class="kitchen-other"><summary>Meals on other dates (${other.length})</summary><div class="kitchen-board">${other.map(mealCard).join('')}</div></details>`;
      html+='<p class="kitchen-hint">Drag a meal onto a day, or tap Plan.</p>';
    }else if(tab==='stock'){
      html=pantryList(s.stock,filter);
    }else{
      html=`<div class="kitchen-shopping-actions"><button class="action-button" data-action="shop-meals">Add what we need this week</button><button data-action="copy-list">Copy list</button><a class="action-link" href="https://giantfoodstores.com/" target="_blank" rel="noopener noreferrer">Shop at GIANT ↗</a><button data-action="put-away">Put groceries away</button></div><p class="kitchen-hint">Tap Find at GIANT to choose a product and add it to your cart there. When the order arrives, check off what you received and tap Put groceries away.</p><div class="kitchen-groceries">`;
      for(const g of s.groceries.filter(filter).sort((a,b)=>Number(a.checked)-Number(b.checked)||a.name.localeCompare(b.name))){html+=`<article class="kitchen-grocery ${g.checked?'is-checked':''}"><label><input type="checkbox" data-grocery-check="${g.id}" ${g.checked?'checked':''}><span><strong>${escape(g.name)}</strong><small>${amount(g)} · ${g.place}${g.notes?' · '+escape(g.notes):''}</small></span></label><div class="kitchen-card-actions"><a href="https://giantfoodstores.com/product-search/${encodeURIComponent(g.name)}" target="_blank" rel="noopener noreferrer">Find at GIANT ↗</a>${button('grocery-edit',g.id,'Edit')}${button('grocery-delete',g.id,'Remove')}</div></article>`;}
      html+=(s.groceries.filter(filter).length?'':'<p class="kitchen-empty">Add the usual groceries, or make a list from this week’s meals.</p>')+'</div>';
    }
    $('meals-list').innerHTML=html;
    $('meals-list').querySelectorAll('[data-pantry-key]').forEach(el=>{if(openPantry.has(el.dataset.pantryKey)){el.querySelector('[data-pantry-details]').setAttribute('aria-expanded','true');el.querySelector('.pantry-item-details').hidden=false;}});
  }
  document.addEventListener('click',async e=>{
    const t=e.target.closest('[data-kitchen-tab]');if(t){tab=t.dataset.kitchenTab;render();return;}
    const b=e.target.closest('#meals-list [data-action]');if(!b||!board||busy)return;const id=b.dataset.id;
    const action=b.dataset.action;
    if(action==='meal-edit')editMeal(id);else if(action==='meal-plan')plan(id);else if(action==='meal-cook')cook(id);
    else if(action==='meal-idea')await change('meal-idea',{id});
    else if(action.endsWith('-delete'))remove(action.split('-')[0],id);
    else if(action==='stock-edit'||action==='grocery-edit')editFood(action==='stock-edit'?'stock':'grocery',id);
    else if(action==='stock-buy'){const item=board.data.stock.find(x=>x.id===id);editFood('grocery',null,{...item,id:undefined,quantity:1});}
    else if(action==='stock-use'){const item=board.data.stock.find(x=>x.id===id);openForm(`Use ${item.name}`,field(`Amount used (${item.unit})`,'quantity',Math.min(1,item.quantity),'number',`min="0" max="${item.quantity}" step="any" required`),f=>change('stock-use',{id,quantity:f.get('quantity')},'Pantry updated.'));}
    else if(action==='shop-meals')await change('shop-meals',{from:week,to:shift(week,6)},'Shopping list updated. Check the amounts before you order.');
    else if(action==='put-away')await change('groceries-put-away',{},'Groceries put away. You can add best-before dates in Pantry.');
    else if(action==='copy-list'){
      const text=board.data.groceries.filter(g=>!g.checked).map(g=>`${g.name} — ${amount(g)}${g.notes?' ('+g.notes+')':''}`).join('\n');
      if(!text){status('Everything on your list is checked off.');return;}
      try{await navigator.clipboard.writeText(text);status('Shopping list copied.');}catch{openForm('Copy your shopping list',`<textarea rows="12" readonly>${escape(text)}</textarea>`,async()=>true);dialog.querySelector('textarea')?.select();}
    }
  });
  $('meals-list').addEventListener('click',e=>{
    const details=e.target.closest('[data-pantry-details]');if(!details)return;
    const item=details.closest('[data-pantry-key]'),panel=item.querySelector('.pantry-item-details'),open=details.getAttribute('aria-expanded')==='true';
    details.setAttribute('aria-expanded',String(!open));panel.hidden=open;
  });
  $('meals-list').addEventListener('change',e=>{
    if(!e.target.matches('[data-pantry-toggle]'))return;
    let ids=[];try{ids=JSON.parse(e.target.dataset.pantryToggle);}catch{}
    e.target.closest('.pantry-item')?.classList.toggle('is-used',e.target.checked);
    change('stock-toggle-group',{ids,used:e.target.checked},e.target.checked?'Crossed off.':'Back in the pantry.').then(ok=>{if(!ok)render();});
  });
  $('meals-list').addEventListener('change',e=>{const id=e.target.dataset.groceryCheck;if(id)change('grocery-check',{id,checked:e.target.checked}).then(ok=>{if(!ok)render();});});
  $('meals-list').addEventListener('dragstart',e=>{const card=e.target.closest('[data-meal-id]');if(card)e.dataTransfer.setData('text/plain',card.dataset.mealId);});
  $('meals-list').addEventListener('dragover',e=>{if(e.target.closest('[data-drop-date],[data-lane="idea"]'))e.preventDefault();});
  $('meals-list').addEventListener('drop',e=>{const target=e.target.closest('[data-drop-date],[data-lane="idea"]');if(!target)return;e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(!board.data.meals.some(m=>m.id===id))return;if(target.dataset.dropDate)change('meal-plan',{id,date:target.dataset.dropDate});else change('meal-idea',{id});});
  $('kitchen-add').onclick=()=>{if(!board)return;if(tab==='meals')editMeal();else editFood(tab==='stock'?'stock':'grocery');};
  $('kitchen-quick-meal').onsubmit=async e=>{
    e.preventDefault();const input=$('kitchen-quick-meal-name'),name=input.value.trim();if(!name)return;
    if(await change('meal-save',{name,date:today(),ingredients:[],notes:'',url:'',favorite:false},`${name} added to today.`)){input.value='';input.focus();}
  };
  $('kitchen-search').oninput=e=>{search=e.target.value;render();};
  $('kitchen-refresh').onclick=()=>{status('');refresh();};
  $('kitchen-prev').onclick=()=>{week=shift(week,-7);render();};$('kitchen-next').onclick=()=>{week=shift(week,7);render();};$('kitchen-today').onclick=()=>{week=monday(new Date());render();};
  $('meals-week-picker').onchange=e=>{if(e.target.value){week=monday(new Date(e.target.value+'T12:00:00'));render();}};
  window.addEventListener('hashchange',()=>{if(location.hash==='#meals')refresh();});
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  channel?.addEventListener('message',refresh);
  refresh();setInterval(()=>{if(!document.hidden&&!dialog.open)refresh();},60000);
})();
