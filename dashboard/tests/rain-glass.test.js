const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const code=fs.readFileSync(require.resolve('../rain-glass.js'),'utf8');
function setup({reduced=false,webgl=true}={}) {
  const {window,document}=parseHTML('<html><body><div id="sky"><div id="dashboard-view"><div class="primary-header"><div class="primary-widgets"></div></div><button id="button">Calendar</button></div></div></body></html>');
  const sky=document.getElementById('sky');
  Object.defineProperties(sky,{clientWidth:{value:1180,configurable:true},clientHeight:{value:820,configurable:true}});
  sky.getBoundingClientRect=()=>({left:0,top:0,width:1180,height:820});
  document.querySelector('.primary-header').getBoundingClientRect=()=>({left:20,top:20,right:790,bottom:180});
  document.querySelector('.primary-widgets').getBoundingClientRect=()=>({left:320,top:30,right:780,bottom:170});
  const resources=new Set(),raf=new Map(),timers=new Map(),intervals=new Map();let seq=0,paints=0;
  const gl=new Proxy({}, {get:(_,name)=>{
    if(String(name).startsWith('create'))return()=>{const r={name};resources.add(r);return r;};
    if(String(name).startsWith('delete'))return resource=>resources.delete(resource);
    if(name==='getShaderParameter'||name==='getProgramParameter')return()=>true;
    if(name==='getAttribLocation')return()=>0;
    if(name==='getUniformLocation')return(_,n)=>n;
    if(/^[A-Z_0-9]+$/.test(String(name)))return 1;
    return()=>{};
  }});
  const create=document.createElement.bind(document);
  document.createElement=name=>{
    const element=create(name);
    if(name==='canvas'){
      const ctx={canvas:element,fillStyle:'',fillRect(){paints++;},clearRect(){},drawImage(){},setTransform(){},putImageData(){},getImageData(){return{data:new Uint8Array(4)};},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};}};
      element.getContext=kind=>kind==='webgl2'?(webgl?gl:null):ctx;
    }
    return element;
  };
  const media=new window.EventTarget();media.matches=reduced;
  window.RainGlassShaders={vertex:'vertex',fragment:'fragment'};
  window.html2canvas=async()=>document.createElement('canvas');
  const context={window,document,location:{hash:''},localStorage:{getItem:()=>null,setItem(){}},devicePixelRatio:3,matchMedia:()=>media,console,Uint8Array,Float32Array,Math,
    requestAnimationFrame:fn=>{const id=++seq;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),
    setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{const id=++seq;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
  };
  const run=()=>vm.runInNewContext(code,context);
  run();
  return {window,document,sky,context,run,media,resources,raf,timers,intervals,paints:()=>paints};
}
test('touch paints a persistent mask; buttons remain excluded and DPR is capped',async()=>{
  const env=setup();env.window.RainGlass.setMode('preview');
  const before=env.paints();
  const event=new env.window.Event('pointermove',{bubbles:true});Object.assign(event,{clientX:100,clientY:80,pointerId:2,pointerType:'touch'});env.sky.dispatchEvent(event);
  const canvas=env.document.getElementById('rain-glass');
  assert.equal(canvas.dataset.wipes,'1');assert.ok(env.paints()>before);
  const click=new env.window.Event('pointerdown',{bubbles:true});Object.assign(click,{clientX:100,clientY:80,pointerId:3,pointerType:'touch'});env.document.getElementById('button').dispatchEvent(click);
  assert.equal(canvas.dataset.wipes,'1');
  assert.equal(canvas.style.pointerEvents,'none');assert.ok(canvas.width*canvas.height<=1600100);
  env.window.RainGlass.destroy();assert.equal(env.resources.size,0);
});
test('reduced motion, hidden views, reinitialization and destroy release animation/resources',()=>{
  const env=setup({reduced:true});env.window.RainGlass.setMode('preview');assert.equal(env.raf.size,0);
  env.media.matches=false;env.media.dispatchEvent(new env.window.Event('change'));assert.equal(env.raf.size,1);
  env.document.hidden=true;env.document.dispatchEvent(new env.window.Event('visibilitychange'));assert.equal(env.raf.size,0);
  env.document.hidden=false;env.document.dispatchEvent(new env.window.Event('visibilitychange'));assert.equal(env.raf.size,1);
  env.context.location.hash='#calendar';env.window.dispatchEvent(new env.window.Event('hashchange'));assert.equal(env.raf.size,0);assert.equal(env.document.getElementById('rain-glass').hidden,true);
  env.run();assert.equal(env.document.querySelectorAll('#rain-glass').length,1);
  env.window.RainGlass.destroy();assert.equal(env.resources.size,0);assert.equal(env.raf.size,0);assert.equal(env.timers.size,0);assert.equal(env.intervals.size,0);assert.equal(env.document.querySelectorAll('#rain-glass').length,0);
});
test('unsupported WebGL falls back to static mist without starting an animation loop',()=>{
  const env=setup({webgl:false});env.window.RainGlass.setMode('preview');
  assert.equal(env.document.getElementById('rain-glass').dataset.renderer,'static');assert.equal(env.raf.size,0);
  env.window.RainGlass.setMode('off');assert.equal(env.document.getElementById('rain-glass').hidden,true);
  env.window.RainGlass.destroy();
});
