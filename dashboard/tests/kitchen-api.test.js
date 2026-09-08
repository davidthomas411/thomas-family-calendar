const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createToken,verifyToken}=require('../lib/auth');
const core=require('../kitchen-core');
function setup(calendar=[]){
  const queries=[];const current={version:3,data:{meals:[],stock:[],groceries:[]}};
  const client={query:async(sql,params)=>{queries.push({sql,params});return{rows:sql.startsWith('SELECT version')?[current]:sql.startsWith('SELECT id,details')?calendar:[]};},release(){}};
  const context={module:{exports:{}},require:name=>name==='crypto'?require('node:crypto'):name==='../lib/db'?{pool:{query:async()=>{},connect:async()=>client}}:name==='../lib/auth'?{verifyToken}:name==='../kitchen-core'?core:{saveJsonCache:async()=>{}},process:{env:{AUTH_SECRET:'test-only'}},Buffer,console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/kitchen'),'utf8'),context);
  const token=createToken({user:'test',exp:Date.now()+10000},'test-only');
  const call=async(body,auth=true)=>{const res={setHeader(){},end(value){this.body=JSON.parse(value);}};await context.module.exports({method:'POST',headers:auth?{authorization:`Bearer ${token}`}:{},body},res);return res;};
  return{call,queries};
}
test('kitchen rejects unauthenticated writes and stale device revisions',async()=>{
  const env=setup();let res=await env.call({version:3,action:'meal-save',data:{name:'Dinner'}},false);assert.equal(res.statusCode,401);assert.equal(env.queries.length,0);
  res=await env.call({version:2,action:'meal-save',data:{name:'Dinner'}});assert.equal(res.statusCode,409);assert.equal(env.queries.at(-1).sql,'COMMIT');assert.ok(!env.queries.some(x=>x.sql.startsWith('UPDATE kitchen_board')));
});
test('new calendar meals reconcile before accepting edits from a stale kitchen',async()=>{
  const env=setup([{id:'calendar-meal',name:'Pizza night',date:'2026-09-10'}]);
  const res=await env.call({version:3,action:'grocery-save',data:{name:'Milk',quantity:1,unit:'l'}});
  assert.equal(res.statusCode,409);
  const save=env.queries.find(x=>x.sql.startsWith('UPDATE kitchen_board'));
  assert.equal(JSON.parse(save.params[0]).meals[0].name,'Pizza night');
  assert.equal(env.queries.at(-1).sql,'COMMIT');
});
test('a scheduled meal and the shared kitchen commit together',async()=>{
  const env=setup();const res=await env.call({version:3,action:'meal-save',data:{name:'Soup',date:'2026-09-09',ingredients:[]}});
  assert.equal(res.statusCode,200);assert.equal(res.body.version,4);assert.equal(res.body.data.meals[0].name,'Soup');
  assert.ok(env.queries.some(x=>x.sql.startsWith('INSERT INTO events')&&x.params[1]==='Soup'));
  assert.ok(env.queries.some(x=>x.sql.startsWith('UPDATE kitchen_board')));assert.equal(env.queries.at(-1).sql,'COMMIT');
});
test('invalid data rolls back without changing inventory',async()=>{
  const env=setup();const res=await env.call({version:3,action:'stock-save',data:{name:'Milk',quantity:-1,unit:'l',place:'Fridge'}});
  assert.equal(res.statusCode,400);assert.equal(env.queries.at(-1).sql,'ROLLBACK');
  assert.ok(!env.queries.some(x=>x.sql.startsWith('UPDATE kitchen_board')));
});
