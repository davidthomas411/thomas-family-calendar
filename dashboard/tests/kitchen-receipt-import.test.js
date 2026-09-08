const {test}=require('node:test');
const assert=require('node:assert/strict');
const {importReceipt,items}=require('../lib/kitchen-receipt-import');
test('GIANT receipt imports 48 delivered lines with actual weights and no invented expiry dates',()=>{
  let sequence=0;const original={meals:[],stock:[{id:'existing',name:'Existing rice',quantity:1,unit:'pack',place:'Pantry'}],groceries:[]};
  const result=importReceipt(original,()=>`receipt-${++sequence}`);
  assert.equal(items.length,48);assert.equal(result.changed,true);assert.equal(result.data.stock.length,49);assert.equal(original.stock.length,1);
  assert.equal(result.data.stock.find(i=>i.name==='Chicken breasts').quantity,2.42);
  assert.equal(result.data.stock.find(i=>i.name==='Chicken thighs').quantity,3.43);
  assert.equal(result.data.stock.find(i=>i.name==='White American cheese').quantity,1.49);
  assert.equal(result.data.stock.find(i=>i.name==='Half & half').quantity,3);
  assert.equal(result.data.stock.find(i=>i.name==='Sour cream').place,'Fridge');
  assert.equal(result.data.stock.find(i=>i.name==='Frozen mango').place,'Freezer');
  assert.ok(!result.data.stock.some(i=>/bagel|gyro/i.test(i.name)));
  assert.ok(result.data.stock.slice(1).every(i=>i.bestBefore===''));
  const again=importReceipt(result.data,()=>{throw Error('Should not create another item');});assert.equal(again.changed,false);assert.equal(again.data.stock.length,49);
  result.data.stock.pop();assert.equal(importReceipt(result.data,()=>{}).data.stock.length,48,'Items removed by the family must not return on refresh');
});
