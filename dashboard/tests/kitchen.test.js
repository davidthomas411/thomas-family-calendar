const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../kitchen-core');
let sequence=0;
const change=(s,action,data)=>core.apply(s,{action,data},()=>`id-${++sequence}`,'2026-09-08T20:00:00Z');
const empty=()=>({meals:[],stock:[],groceries:[]});
test('planned meals combine shortages, subtract stock, and do not duplicate grocery items',()=>{
  let s=empty();s=change(s,'stock-save',{name:'Rice',quantity:1,unit:'cup',place:'Pantry'});
  for(let i=0;i<2;i++)s=change(s,'meal-save',{name:'Rice bowl',date:'2026-09-09',ingredients:[{name:'rice',quantity:2,unit:'cup'}]});
  const cmd={from:'2026-09-07',to:'2026-09-13'};s=change(s,'shop-meals',cmd);
  assert.equal(s.groceries.length,1);assert.equal(s.groceries[0].quantity,3);
  s=change(s,'shop-meals',cmd);assert.equal(s.groceries[0].quantity,3);
  s=change(s,'grocery-check',{id:s.groceries[0].id,checked:true});s=change(s,'shop-meals',cmd);assert.equal(s.groceries.length,1);
});
test('received groceries move to the selected storage and can be consumed only once',()=>{
  let s=change(empty(),'grocery-save',{name:'Milk',quantity:2,unit:'l',place:'Fridge'});
  s=change(s,'grocery-check',{id:s.groceries[0].id,checked:true});s=change(s,'groceries-put-away',{});
  assert.equal(s.groceries.length,0);assert.equal(s.stock[0].place,'Fridge');assert.equal(s.stock[0].quantity,2);
  assert.throws(()=>change(s,'groceries-put-away',{}));
  s=change(s,'meal-save',{name:'Porridge',date:'2026-09-08',ingredients:[{name:'milk',quantity:0.5,unit:'l'}]});
  const id=s.meals[0].id;s=change(s,'meal-cook',{id,useIngredients:true});assert.equal(s.stock[0].quantity,1.5);
  assert.throws(()=>change(s,'meal-cook',{id,useIngredients:true}));
  s=change(s,'meal-plan',{id,date:'2026-09-15'});assert.equal(s.meals.length,2);assert.equal(s.meals[0].status,'cooked');assert.equal(s.meals[1].status,'planned');
});
test('cooking uses the earliest dated batch first and never invents stock or converts incompatible units',()=>{
  let s=empty();for(const [q,d]of[[1,'2026-09-12'],[2,'2026-09-09']])s=change(s,'stock-save',{name:'Tomatoes',quantity:q,unit:'each',place:'Fridge',bestBefore:d});
  s=change(s,'meal-save',{name:'Salad',ingredients:[{name:'Tomatoes',quantity:2.5,unit:'each'}]});
  s=change(s,'meal-cook',{id:s.meals[0].id,useIngredients:true});assert.deepEqual(s.stock.map(x=>x.quantity),[0.5,0]);
  assert.equal(core.shortages(s,[{ingredients:[{name:'Tomatoes',quantity:1,unit:'lb'}]}])[0].quantity,1);
});
test('bad quantities, invalid dates and executable recipe links are rejected without modifying input',()=>{
  const s=empty();for(const quantity of[-1,NaN,Infinity])assert.throws(()=>change(s,'stock-save',{name:'Rice',quantity,unit:'cup',place:'Pantry'}));
  assert.throws(()=>change(s,'meal-save',{name:'Bad date',date:'2026-02-30'}));
  assert.throws(()=>change(s,'meal-save',{name:'Bad link',url:'javascript:alert(1)'}));
  assert.deepEqual(s,empty());
});
