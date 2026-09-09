/* Shared kitchen rules: the server owns every change; quantities use exact units. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitchenCore = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  const clean = (v, max=200) => String(v || '').trim().slice(0,max);
  const key = v => clean(v).toLowerCase().replace(/\s+/g,' ');
  const units = ['each','g','kg','oz','lb','ml','l','cup','tbsp','tsp','pack'];
  const places = ['Pantry','Fridge','Freezer'];
  const categories = ['Meat & fish','Cheese','Dairy & eggs','Vegetables','Fruit','Bread','Staples','Breakfast & snacks','Frozen','Drinks','Other'];
  function pantryInfo(item) {
    const name=key(item.name);
    let label=clean(item.name),category='Other';
    if(/yogh?urt/.test(name)&&!/raisin|trail mix/.test(name)){label='Yoghurt';category='Dairy & eggs';}
    else if(/cheese|cheddar|feta/.test(name)){category='Cheese';if(/mexican/.test(name))label='Mexican cheese';else if(/cheddar/.test(name))label='Cheddar';else if(/cream cheese/.test(name))label='Cream cheese';else if(/feta/.test(name))label='Feta';}
    else if(/chicken|turkey|\bham\b|beef|pork|bacon|sausage|salmon|tuna|\bfish\b|shrimp/.test(name))category='Meat & fish';
    else if(/milk|cream|butter|half & half|\beggs?\b/.test(name)&&!/waffle/.test(name))category='Dairy & eggs';
    else if(item.place==='Freezer')category='Frozen';
    else if(/bread|tortilla|bagel|rolls/.test(name))category='Bread';
    else if(/canned|cans?\b|mayonnaise|rice|pasta|flour|sugar|salt|oil|vinegar|\bsauce|beans|lentils|spices/.test(name))category='Staples';
    else if(/tomato|kale|carrot|pepper|cucumber|lettuce|broccoli|spinach|potato|onion|mushroom|hummus/.test(name))category='Vegetables';
    else if(/berries|banana|apples|avocado|grapes|oranges|pears|melon|peach|mango/.test(name)&&!/juice|bar|pouch/.test(name))category='Fruit';
    else if(/bread|tortilla|bagel|rolls/.test(name))category='Bread';
    else if(/juice|tea\b|coffee|water|soda/.test(name))category='Drinks';
    else if(/bars|cheerios|cereal|pretzel|raisin|trail mix|applesauce|crackers|chips|oats/.test(name))category='Breakfast & snacks';
    if(/breakfast bars/.test(name))label='Breakfast bars';
    if(/honey oat cheerios/.test(name))label='Cheerios';
    if(/ginger.*tea/.test(name))label='Tea';
    if(/buttermilk.*waffles/.test(name))label='Waffles';
    if(/canned tomatoes/.test(name))label='Canned tomatoes';
    if(/vanilla yogurt raisins/.test(name))label='Yoghurt raisins';
    if(/2% milk/.test(name))label='Milk';
    if(/butter spread/.test(name))label='Butter';
    if(/swiss cheese/.test(name))label='Swiss';
    if(/white american cheese/.test(name))label='American cheese';
    if(/cherry tomatoes|campari tomatoes/.test(name))label='Tomatoes';
    if(/gala apples/.test(name))label='Apples';
    if(/red grapes/.test(name))label='Grapes';
    if(/english cucumbers/.test(name))label='Cucumbers';
    if(/baby carrots/.test(name))label='Carrots';
    if(/curly kale/.test(name))label='Kale';
    if(/bell peppers/.test(name))label='Peppers';
    if(/french bread|white bread/.test(name))label='Bread';
    if(/trail mix/.test(name))label='Trail mix';
    if(/sliced turkey/.test(name))label='Deli turkey';
    if(/sliced ham/.test(name))label='Ham';
    return {label:clean(item.label)||label,category:categories.includes(item.category)?item.category:category};
  }
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
      const meal=find(s.meals);if(meal.status==='cooked')throw Error('This meal is already marked as cooked.');
      if(data.useIngredients){
        for(const i of meal.ingredients){let left=i.quantity;const batches=s.stock.filter(x=>match(x,i)).sort((a,b)=>(a.bestBefore||'9999').localeCompare(b.bestBefore||'9999'));for(const batch of batches){const used=Math.min(left,batch.quantity);batch.quantity=rounded(batch.quantity-used);left=rounded(left-used);}}
      }
      meal.status='cooked';meal.cookedAt=now;
    }else if(action==='meal-delete'){find(s.meals);s.meals=s.meals.filter(x=>x.id!==data.id);
    }else if(action==='stock-save'){
      if(!places.includes(data.place))throw Error('Choose Pantry, Fridge or Freezer.');
      const existing=data.id?find(s.stock):null;
      const row={...food(data),place:data.place,bestBefore:date(data.bestBefore),notes:clean(data.notes,500),id:data.id||id(),label:clean(data.label===undefined?existing?.label:data.label),category:categories.includes(data.category)?data.category:(existing?.category||'')};
      if(data.id)Object.assign(find(s.stock),row);else s.stock.push(row);
    }else if(action==='stock-use'){
      const item=find(s.stock);const amount=quantity(data.quantity);if(amount>item.quantity)throw Error('That’s more than the amount in your pantry.');item.quantity=rounded(item.quantity-amount);
    }else if(action==='stock-toggle-group'){
      const ids=Array.isArray(data.ids)?[...new Set(data.ids.filter(id=>typeof id==='string'))]:[];
      if(!ids.length||ids.length>100)throw Error('Choose a pantry item.');
      const selected=ids.map(itemId=>{const item=s.stock.find(x=>x.id===itemId);if(!item)throw Error('That item is no longer in the pantry. Refresh and try again.');return item;});
      if(data.used){
        for(const item of selected){if(item.quantity>0){item.previousQuantity=item.quantity;item.quantity=0;}}
      }else{
        for(const item of selected){if(item.quantity===0)item.quantity=quantity(item.previousQuantity||1);delete item.previousQuantity;}
      }
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
      const purchased=s.groceries.filter(x=>x.checked);if(!purchased.length)throw Error('Check off the groceries you received first.');
      for(const g of purchased){const existing=s.stock.find(x=>match(x,g)&&x.place===g.place&&!x.bestBefore);if(existing)existing.quantity=rounded(existing.quantity+g.quantity);else s.stock.push({...food(g),id:id(),place:g.place,bestBefore:'',notes:''});}
      s.groceries=s.groceries.filter(x=>!x.checked);
    }else throw Error('Unknown kitchen action.');
    if(s.meals.length+s.stock.length+s.groceries.length>5000)throw Error('The kitchen is full. Remove old items before adding more.');
    return s;
  }
  return {apply,shortages,units,places,key,match,categories,pantryInfo};
});
