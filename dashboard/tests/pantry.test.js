const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../kitchen-core');
test('pantry groups familiar names without changing stored ingredients or quantities',()=>{
  const coconut={name:'Coconut Greek yogurt',quantity:4,unit:'each',place:'Fridge'};
  const lime={name:'Key lime Greek yogurt',quantity:4,unit:'each',place:'Fridge'};
  assert.deepEqual(core.pantryInfo(coconut),{label:'Yoghurt',category:'Dairy & eggs'});
  assert.deepEqual(core.pantryInfo(lime),{label:'Yoghurt',category:'Dairy & eggs'});
  assert.equal(coconut.name,'Coconut Greek yogurt');assert.equal(coconut.quantity,4);
  for(const [name,category]of [['Chicken breasts','Meat & fish'],['White American cheese','Cheese'],['Half & half','Dairy & eggs'],['Flour tortillas','Bread'],['Canned tomatoes with basil','Staples'],['Yogurt trail mix','Breakfast & snacks']])assert.equal(core.pantryInfo({name,place:'Fridge'}).category,category,name);
});
test('family can correct short names and categories without losing the original details',()=>{
  let s={meals:[],groceries:[],stock:[{id:'one',name:'Frozen mango',quantity:1,unit:'pack',place:'Freezer',notes:'48 oz'}]};
  s=core.apply(s,{action:'stock-save',data:{...s.stock[0],label:'Mango',category:'Fruit'}},()=>'',new Date().toISOString());
  assert.deepEqual(core.pantryInfo(s.stock[0]),{label:'Mango',category:'Fruit'});assert.equal(s.stock[0].name,'Frozen mango');assert.equal(s.stock[0].notes,'48 oz');
});
