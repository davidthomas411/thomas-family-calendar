/* Shared kitchen rules: the server owns every change; quantities use exact units. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitchenCore = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  const clean = (v, max=200) => String(v || '').trim().slice(0,max);
  const key = v => clean(v).toLowerCase().replace(/\s+/g,' ');
  const units = ['each','g','kg','oz','lb','ml','l','cup','tbsp','tsp','pack'];
  const places = ['Pantry','Fridge','Freezer'];
  function quantity(v) { const n=Number(v); if(!Number.isFinite(n)||n<0||n>100000) throw Error('Enter a quantity from 0 to 100,000.'); return Math.round(n*1000)/1000; }
  function date(v) { if(!v)return ''; if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Choose a valid date.');return v; }
  function food(v) {
    const name=clean(v.name); if(!name)throw Error('Enter an ingredient name.');
    if(!units.includes(v.unit))throw Error('Choose a unit.');
    return {name,quantity:quantity(v.quantity),unit:v.unit};
  }
  function url(v) { if(!v)return ''; const u=new URL(v); if(!['https:','http:'].includes(u.protocol))throw Error('Use a website link.');return u.href.slice(0,2000); }
  const match=(a,b)=>key(a.name)===key(b.name)&&a.unit===b.unit;
  const rounded=n=>Math.round(n*1000)/1000;
  function shortages(state, meals) {
    const needed=[];
    for(const meal of meals)for(const ingredient of meal.ingredients){const row=needed.find(x=>match(x,ingredient));if(row)row.quantity=rounded(row.quantity+ingredient.quantity);else needed.push({...ingredient});}
    return needed.map(i=>({...i,quantity:rounded(Math.max(0,i.quantity-state.stock.filter(s=>match(s,i)).reduce((n,s)=>n+s.quantity,0)))})).filter(i=>i.quantity>0);
  }
  function apply(input, command, id, now) {
    const s=JSON.parse(JSON.stringify(input));
    const {action,data={}}=command;
    const find=(list)=>{const row=list.find(x=>x.id===data.id);if(!row)throw Error('That item no longer exists. Refresh and try again.');return row;};
    if(action==='meal-save'){
      const name=clean(data.name);if(!name)throw Error('Give the meal a name.');
      const existing=data.id?find(s.meals):null;
      const ingredients=(data.ingredients||[]).map(food);if(ingredients.length>100)throw Error('Use fewer than 100 ingredients.');
      const meal={id:existing?.id||id(),name,ingredients,date:date(data.date),status:existing?.status==='cooked'?'cooked':(data.date?'planned':'idea'),notes:clean(data.notes,4000),url:url(data.url),favorite:Boolean(data.favorite),cookedAt:existing?.cookedAt||''};
      if(existing)Object.assign(existing,meal);else s.meals.push(meal);
    }else if(action==='meal-plan'){
      const meal=find(s.meals);const chosen=date(data.date);if(!chosen)throw Error('Choose a meal date.');
      if(meal.status==='cooked')s.meals.push({...meal,id:id(),date:chosen,status:'planned',cookedAt:''});
      else Object.assign(meal,{date:chosen,status:'planned'});
    }else if(action==='meal-idea'){
      const meal=find(s.meals);if(meal.status==='cooked')s.meals.push({...meal,id:id(),date:'',status:'idea',cookedAt:''});else Object.assign(meal,{date:'',status:'idea'});
    }else if(action==='meal-cook'){
      const meal=find(s.meals);if(meal.status==='cooked')throw Error('This meal is already in your history.');
      if(data.useIngredients){
        for(const i of meal.ingredients){let left=i.quantity;const batches=s.stock.filter(x=>match(x,i)).sort((a,b)=>(a.bestBefore||'9999').localeCompare(b.bestBefore||'9999'));for(const batch of batches){const used=Math.min(left,batch.quantity);batch.quantity=rounded(batch.quantity-used);left=rounded(left-used);}}
      }
      meal.status='cooked';meal.cookedAt=now;
    }else if(action==='meal-delete'){find(s.meals);s.meals=s.meals.filter(x=>x.id!==data.id);
    }else if(action==='stock-save'){
      if(!places.includes(data.place))throw Error('Choose Pantry, Fridge or Freezer.');
      const row={...food(data),place:data.place,bestBefore:date(data.bestBefore),notes:clean(data.notes,500),id:data.id||id()};
      if(data.id)Object.assign(find(s.stock),row);else s.stock.push(row);
    }else if(action==='stock-use'){
      const item=find(s.stock);const amount=quantity(data.quantity);if(amount>item.quantity)throw Error('That is more than you have recorded.');item.quantity=rounded(item.quantity-amount);
    }else if(action==='stock-delete'){find(s.stock);s.stock=s.stock.filter(x=>x.id!==data.id);
    }else if(action==='grocery-save'){
      const row={...food(data),id:data.id||id(),place:places.includes(data.place)?data.place:'Pantry',checked:Boolean(data.checked),notes:clean(data.notes,500)};
      if(row.quantity<=0)throw Error('Enter a grocery quantity greater than zero.');
      if(data.id)Object.assign(find(s.groceries),row);else{const same=s.groceries.find(x=>!x.checked&&match(x,row)&&x.place===row.place);if(same)same.quantity=rounded(same.quantity+row.quantity);else s.groceries.push(row);}
    }else if(action==='grocery-check'){find(s.groceries).checked=Boolean(data.checked);
    }else if(action==='grocery-delete'){find(s.groceries);s.groceries=s.groceries.filter(x=>x.id!==data.id);
    }else if(action==='shop-meals'){
      const from=date(data.from),to=date(data.to);if(!from||!to||from>to)throw Error('Choose a valid week.');
      const missing=shortages(s,s.meals.filter(m=>m.status==='planned'&&m.date>=from&&m.date<=to));
      for(const row of missing){const listed=s.groceries.filter(g=>match(g,row)).reduce((n,g)=>n+g.quantity,0);const additional=rounded(Math.max(0,row.quantity-listed));if(additional){const existing=s.groceries.find(g=>match(g,row)&&!g.checked);if(existing)existing.quantity=rounded(existing.quantity+additional);else s.groceries.push({...row,quantity:additional,id:id(),place:'Pantry',checked:false,notes:'For planned meals'});}}
    }else if(action==='groceries-put-away'){
      const purchased=s.groceries.filter(x=>x.checked);if(!purchased.length)throw Error('Check off the groceries that have arrived first.');
      for(const g of purchased){const existing=s.stock.find(x=>match(x,g)&&x.place===g.place&&!x.bestBefore);if(existing)existing.quantity=rounded(existing.quantity+g.quantity);else s.stock.push({...food(g),id:id(),place:g.place,bestBefore:'',notes:''});}
      s.groceries=s.groceries.filter(x=>!x.checked);
    }else throw Error('Unknown kitchen action.');
    if(s.meals.length+s.stock.length+s.groceries.length>5000)throw Error('The kitchen is full. Remove old items before adding more.');
    return s;
  }
  return {apply,shortages,units,places,key,match};
});
