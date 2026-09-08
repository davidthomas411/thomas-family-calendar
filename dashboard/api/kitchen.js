const crypto=require('crypto');
const {pool}=require('../lib/db');
const {verifyToken}=require('../lib/auth');
const core=require('../kitchen-core');
const {saveJsonCache}=require('../lib/blob-cache');
let schema;
function ensureSchema(){
  if(!schema)schema=pool.query(`CREATE TABLE IF NOT EXISTS kitchen_board (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(e=>{schema=null;throw e;});
  return schema;
}
function send(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(payload));}
async function body(req){
  if(req.body){const v=Buffer.isBuffer(req.body)?req.body.toString():req.body;if(JSON.stringify(v).length>200000)throw Error('Request too large.');return typeof v==='string'?JSON.parse(v):v;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>200000)throw Error('Request too large.');}return JSON.parse(raw);
}
module.exports=async(req,res)=>{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(res,405,{error:'Method not allowed'});}
  let command,session;
  if(req.method==='POST'){
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    session=process.env.AUTH_SECRET&&verifyToken(token,process.env.AUTH_SECRET);
    if(!session)return send(res,401,{error:'Sign in to update the kitchen.'});
    try{command=await body(req);if(!Number.isInteger(command.version))throw Error('Refresh the kitchen and try again.');}catch(e){return send(res,400,{error:e.message});}
  }
  let client;
  try{
    await ensureSchema();client=await pool.connect();await client.query('BEGIN');
    // Import the old meal planner once, without assuming that past plans were cooked.
    await client.query(`INSERT INTO kitchen_board(id,data) SELECT 'family', jsonb_build_object('meals',COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',details,'date',to_char(date,'YYYY-MM-DD'),'status','planned','ingredients','[]'::jsonb,'notes','','url','','favorite',false,'cookedAt','')),'[]'::jsonb),'stock','[]'::jsonb,'groceries','[]'::jsonb) FROM events WHERE lower(calendar)='meals' ON CONFLICT (id) DO NOTHING`);
    const {rows}=await client.query("SELECT version,data FROM kitchen_board WHERE id='family' FOR UPDATE");
    const current=rows[0];
    const calendar=await client.query("SELECT id,details AS name,to_char(date,'YYYY-MM-DD') AS date FROM events WHERE lower(calendar)='meals'");
    let reconciled=false;
    for(const event of calendar.rows){
      const meal=current.data.meals.find(m=>m.id===event.id);
      if(!meal){current.data.meals.push({...event,status:'planned',ingredients:[],notes:'',url:'',favorite:false,cookedAt:''});reconciled=true;}
      else if(meal.status!=='cooked'&&(meal.name!==event.name||meal.date!==event.date)){
        Object.assign(meal,{name:event.name,date:event.date,status:'planned'});reconciled=true;
      }
    }
    for(const meal of current.data.meals){if(meal.status==='planned'&&!calendar.rows.some(e=>e.id===meal.id)){meal.status='idea';meal.date='';reconciled=true;}}
    if(reconciled){await client.query("UPDATE kitchen_board SET data=$1,version=version+1,updated_at=NOW() WHERE id='family'",[JSON.stringify(current.data)]);current.version++;}
    if(req.method==='GET'){await client.query('COMMIT');return send(res,200,current);}
    if(current.version!==command.version){await client.query('COMMIT');return send(res,409,{error:'Someone else updated the kitchen. The board has refreshed; please try your change again.'});}
    let next;try{next=core.apply(current.data,command,()=>crypto.randomUUID(),new Date().toISOString());}catch(e){await client.query('ROLLBACK');return send(res,400,{error:e.message});}
    // Keep scheduled dinners in the existing family calendar in the same transaction.
    for(const old of current.data.meals){const meal=next.meals.find(m=>m.id===old.id);if(old.date&&(!meal||!meal.date))await client.query("DELETE FROM events WHERE id=$1 AND lower(calendar)='meals'",[old.id]);}
    for(const meal of next.meals){
      const old=current.data.meals.find(m=>m.id===meal.id);
      if(meal.date&&(!old||old.date!==meal.date||old.name!==meal.name))await client.query(`INSERT INTO events(id,calendar,details,date,all_day,created_by) VALUES($1,'meals',$2,$3,true,$4) ON CONFLICT(id) DO UPDATE SET details=EXCLUDED.details,date=EXCLUDED.date,updated_at=NOW()`,[meal.id,meal.name,meal.date,session.user]);
    }
    await client.query("UPDATE kitchen_board SET data=$1,version=version+1,updated_at=NOW() WHERE id='family'",[JSON.stringify(next)]);
    await client.query('COMMIT');
    // Expire the legacy event cache so calendar readers see newly planned dinners.
    await saveJsonCache('db-cache/events-v1.json',{cachedAt:0,events:[]}).catch(()=>{});
    return send(res,200,{version:current.version+1,data:next});
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('[kitchen]',e.message);return send(res,500,{error:'The kitchen could not be saved or loaded. Please try again.'});}
  finally{client?.release();}
};
