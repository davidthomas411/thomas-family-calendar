/* SASASA-inspired wet window across the app. The DOM stays interactive.
 * Snapshot texture -> refractive droplets/fog -> persistent painted wipe mask.
 * Public API remains setWeather(code) / setMode(auto|off|preview).
 */
(() => {
  window.RainGlass?.destroy?.();
  const sky = document.getElementById('sky');
  if (!sky) return;
  let canvas = document.createElement('canvas');
  canvas.id = 'rain-glass';
  canvas.setAttribute('aria-hidden','true');
  canvas.setAttribute('data-html2canvas-ignore','true');
  Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'10'});
  sky.appendChild(canvas);
  const mask = document.createElement('canvas');
  const maskCtx = mask.getContext('2d');
  const eraseCanvas=document.createElement('canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const removers = [];
  let gl, program, buffer, background, erased, uniforms, fallback;
  let destroyed=false, lost=false, mode='auto', wet=false, visible=true, frame=0;
  let last=0, elapsed=0, decay=0, captureTimer=0, capturing=false, captureAgain=false,recoveryTimer=0,recoveryAttempts=0;
  const safari=typeof navigator!=='undefined' && /Apple/.test(navigator.vendor || '');
  let width=1,height=1,scale=1,maskScale=1,region=[0,0,1,1],controls=[0,0,0,0],snapshot=null,signature='';
  let strength=0, lastPointer=null, dirtyMask=true, resizeObserver, intersectionObserver;
  try { mode=localStorage.getItem('rain-glass-mode')==='off'?'off':'auto'; } catch {}
  const active = () => !destroyed && !lost && visible && !document.hidden
    && (mode==='preview'||(mode==='auto'&&wet));
  function on(target,type,listener,options) {
    target.addEventListener(type,listener,options);
    removers.push(()=>target.removeEventListener(type,listener,options));
  }
  function releaseGL() {
    if (!gl) return;
    if (background) gl.deleteTexture(background);
    if (erased) gl.deleteTexture(erased);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    background=erased=buffer=program=null;
  }
  function initGL(type=safari?'webgl':'webgl2') {
    const attributes={alpha:true,antialias:false,premultipliedAlpha:false,depth:false,stencil:false,preserveDrawingBuffer:false};
    gl=canvas.getContext(type,attributes);
    if(!gl&&type==='webgl2'){type='webgl';gl=canvas.getContext(type,attributes);}
    if (!gl || !window.RainGlassShaders) return false;
    const compile=(type,source)=>{
      const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
        const message=gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw Error(message);
      }
      return shader;
    };
    let vertex,fragment;
    try {
      const shaders=window.RainGlassShaders;
      const derivatives=type==='webgl2'||Boolean(gl.getExtension('OES_standard_derivatives'));
      vertex=compile(gl.VERTEX_SHADER,type==='webgl2'?shaders.vertex:shaders.vertexWebGL1);
      fragment=compile(gl.FRAGMENT_SHADER,type==='webgl2'?shaders.fragment:derivatives?shaders.fragmentWebGL1:shaders.fragmentPortable);
      program=gl.createProgram(); gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'aPosition'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      const texture=(unit)=>{
        const tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
        return tex;
      };
      background=texture(0); erased=texture(1);
      uniforms=Object.fromEntries(['uBackground','uErasedMask','uSize','uRegion','uControls','uTime','uMotion','uStrength','uFogStrength'].map(name=>[name,gl.getUniformLocation(program,name)]));
      gl.uniform1i(uniforms.uBackground,0); gl.uniform1i(uniforms.uErasedMask,1);
      canvas.dataset.renderer=type; return true;
    } catch(error) {
      console.warn('Rain glass renderer could not start.',error.message); releaseGL(); return false;
    } finally { if(vertex)gl.deleteShader(vertex); if(fragment)gl.deleteShader(fragment); }
  }
  function upload(texture,unit,source) {
    gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  }
  function seedBackground(){
    if(!program||snapshot)return;
    // Keep the real shader visible while the DOM texture loads or retries.
    const base=document.createElement('canvas');base.width=64;base.height=64;
    const ctx=base.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,64);
    const styles=typeof getComputedStyle==='function'?getComputedStyle(document.documentElement):null;
    gradient.addColorStop(0,styles?.getPropertyValue('--sky-top').trim()||'#8ec5f7');
    gradient.addColorStop(1,styles?.getPropertyValue('--sky-bottom').trim()||'#eaf5ff');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);snapshot=base;upload(background,0,base);
    canvas.dataset.snapshot='sky';
  }
  function fallbackPaint() {
    if (!fallback) return;
    fallback.clearRect(0,0,width,height);
    const mist=fallback.createLinearGradient(0,0,0,region[3]);
    mist.addColorStop(0,'rgba(190,210,225,.08)'); mist.addColorStop(.8,'rgba(190,210,225,.04)'); mist.addColorStop(1,'rgba(190,210,225,.07)');
    fallback.fillStyle=mist; fallback.fillRect(region[0],0,region[2]-region[0],region[3]);
    // Deterministic beads and moving rivulets, with no external image dependency.
    const seed=n=>{const x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x);};
    const count=Math.min(420,Math.floor(width*height/2400));
    for(let i=0;i<count;i++){
      const running=i%5===0, x=seed(i+1)*width;
      const y=(seed(i+701)*height+(running?elapsed*(24+seed(i+22)*50):0))%(height+40)-20;
      const r=running?3+seed(i+31)*3:1+seed(i+81)*2.5;
      if(running){const trail=fallback.createLinearGradient(x,y-55,x,y);trail.addColorStop(0,'rgba(235,248,255,0)');trail.addColorStop(1,'rgba(225,244,255,.27)');fallback.fillStyle=trail;fallback.fillRect(x-r*.3,y-55,r*.6,55);}
      const bead=fallback.createRadialGradient(x-r*.35,y-r*.45,.2,x,y,r*1.45);
      bead.addColorStop(0,'rgba(255,255,255,.75)');bead.addColorStop(.22,'rgba(230,247,255,.28)');bead.addColorStop(.65,'rgba(30,65,95,.13)');bead.addColorStop(.85,'rgba(230,247,255,.4)');bead.addColorStop(1,'rgba(230,247,255,0)');
      fallback.fillStyle=bead;fallback.fillRect(x-r*1.5,y-r*1.5,r*3,r*3);
    }
    // Mask is opaque grayscale. Convert luminance to alpha only for this fallback.
    if(dirtyMask){
      const image=maskCtx.getImageData(0,0,mask.width,mask.height);
      for(let i=0;i<image.data.length;i+=4)image.data[i+3]=image.data[i];
      eraseCanvas.width=mask.width; eraseCanvas.height=mask.height;
      eraseCanvas.getContext('2d').putImageData(image,0,0);dirtyMask=false;
    }
    fallback.globalCompositeOperation='destination-out'; fallback.drawImage(eraseCanvas,0,0,width,height); fallback.globalCompositeOperation='source-over';
  }
  function draw() {
    if (!active()) return;
    if (!gl || !program) {fallbackPaint();return;}
    if (!snapshot) return;
    gl.useProgram(program); gl.viewport(0,0,canvas.width,canvas.height);
    if(dirtyMask){upload(erased,1,mask);dirtyMask=false;}
    gl.uniform2f(uniforms.uSize,width,height); gl.uniform4fv(uniforms.uRegion,region);
    gl.uniform4fv(uniforms.uControls,controls);
    gl.uniform1f(uniforms.uTime,elapsed); gl.uniform1f(uniforms.uMotion,reduced.matches?0:1);
    gl.uniform1f(uniforms.uStrength,strength);gl.uniform1f(uniforms.uFogStrength,safari?.035:.075);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function tick(now) {
    frame=0;
    if(!active())return;
    if(now-last>=1000/30){
      const dt=last?Math.min((now-last)/1000,.12):0; last=now; elapsed+=dt;
      strength=Math.min(1,strength+dt*1.5); decay+=dt;
      if(decay>=.4){maskCtx.fillStyle=`rgba(0,0,0,${1-Math.exp(-decay/24)})`;maskCtx.fillRect(0,0,mask.width,mask.height);decay=0;dirtyMask=true;}
      draw();
    }
    if(!reduced.matches)frame=requestAnimationFrame(tick);
  }
  function start() {
    cancelAnimationFrame(frame);frame=0;last=0;lastPointer=null;
    canvas.hidden=!active();
    sky.classList.toggle('rain-glass-active',active());
    if(!active())return;
    if(reduced.matches || !program)strength=1;
    draw();
    if(canvas.dataset.snapshot!=='ready')queueCapture();
    if(!reduced.matches)frame=requestAnimationFrame(tick);
  }
  async function capture() {
    captureTimer=0;
    if(!active()||!program||!window.html2canvas)return;
    if(capturing){captureAgain=true;return;}
    capturing=true;
    const generation=`${width}:${height}`;
    try {
      const result=await window.html2canvas(sky,{
        backgroundColor:null,scale:Math.min(safari ? 0.75 : 1,scale),width,height,logging:false,
        allowTaint:false,useCORS:false,removeContainer:true,
        ignoreElements:el=>el.id==='rain-glass'||el.classList?.contains('modal'),
      });
      if(destroyed||lost||!program||!gl||generation!==`${width}:${height}`)return;
      snapshot=result; upload(background,0,snapshot); draw();
      canvas.dataset.snapshot='ready';
    } catch(error){console.warn('Rain glass will retry its background capture.',error.message);seedBackground();draw();}
    finally{capturing=false;if(captureAgain&&!destroyed){captureAgain=false;queueCapture();}}
  }
  function queueCapture() {
    if(destroyed||!active())return;
    clearTimeout(captureTimer);captureTimer=setTimeout(capture,180);
  }
  function resize() {
    if(destroyed)return;
    const old=document.createElement('canvas');old.width=mask.width;old.height=mask.height;
    if(old.width&&old.height)old.getContext('2d').drawImage(mask,0,0);
    width=Math.max(1,sky.clientWidth);height=Math.max(1,sky.clientHeight);
    scale=Math.min(devicePixelRatio||1,1.25,Math.sqrt(1600000/(width*height)));
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    maskScale=Math.min(.5,640/Math.max(width,height));mask.width=Math.max(1,Math.round(width*maskScale));mask.height=Math.max(1,Math.round(height*maskScale));
    maskCtx.fillStyle='black';maskCtx.fillRect(0,0,mask.width,mask.height);
    if(old.width&&old.height)maskCtx.drawImage(old,0,0,mask.width,mask.height);
    region=[-32,-32,width+32,height+45];
    controls=[-100,-100,-90,-90];
    dirtyMask=true;
    seedBackground();
    if(fallback)fallback.setTransform(scale,0,0,scale,0,0);
    queueCapture();start();
  }
  function wipe(event) {
    if(!active()||event.target.closest?.('button,a,input,select,textarea,[role="dialog"]')){lastPointer=null;return;}
    const bounds=sky.getBoundingClientRect();const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
    if(x<region[0]||x>region[2]||y<0||y>region[3]){lastPointer=null;return;}
    const point={x:x*maskScale,y:y*maskScale,id:event.pointerId};
    const prev=lastPointer?.id===point.id?lastPointer:point;
    const radius=(event.pointerType==='touch'?32:26)*maskScale;
    const steps=Math.min(80,Math.max(1,Math.ceil(Math.hypot(point.x-prev.x,point.y-prev.y)/(radius*.4))));
    for(let i=0;i<=steps;i++){
      const px=prev.x+(point.x-prev.x)*i/steps,py=prev.y+(point.y-prev.y)*i/steps;
      const brush=maskCtx.createRadialGradient(px,py,0,px,py,radius);
      brush.addColorStop(0,'rgba(255,255,255,.96)');brush.addColorStop(.65,'rgba(255,255,255,.84)');brush.addColorStop(1,'rgba(255,255,255,0)');
      maskCtx.fillStyle=brush;maskCtx.fillRect(px-radius,py-radius,radius*2,radius*2);
    }
    lastPointer=point;dirtyMask=true;canvas.dataset.wipes=String(Number(canvas.dataset.wipes||0)+1);
    if(reduced.matches||!program)draw();
  }
  function replaceCanvas(){
    const old=canvas;const replacement=document.createElement('canvas');
    replacement.id='rain-glass';replacement.setAttribute('aria-hidden','true');replacement.setAttribute('data-html2canvas-ignore','true');replacement.style.cssText=old.style.cssText;
    old.remove();sky.appendChild(replacement);canvas=replacement;
  }
  function useFallback(){
    releaseGL();
    if(gl){replaceCanvas();gl=null;}
    fallback=canvas.getContext('2d');
    canvas.dataset.renderer='canvas2d';
  }
  function initialize(){
    if(initGL())return;
    if(gl){releaseGL();replaceCanvas();gl=null;}
    if(!initGL('webgl'))useFallback();
  }
  function bindContext(){
    on(canvas,'webglcontextlost',event=>{
      event.preventDefault();lost=true;start();clearTimeout(recoveryTimer);
      recoveryTimer=setTimeout(()=>{
        recoveryTimer=0;if(destroyed||!lost)return;
        releaseGL();replaceCanvas();gl=null;snapshot=null;lost=false;
        if(recoveryAttempts++<2){initialize();bindContext();}else useFallback();
        resize();
      },1500);
    });
    on(canvas,'webglcontextrestored',event=>{
      if(destroyed)return;clearTimeout(recoveryTimer);recoveryTimer=0;
      lost=false;releaseGL();snapshot=null;initialize();if(canvas!==event.target)bindContext();resize();
    });
  }
  initialize();bindContext();
  window.RainGlass={
    setWeather(code){wet=Number.isFinite(code)&&code>=200&&code<600;queueCapture();start();},
    setMode(value){if(!['auto','off','preview'].includes(value))return;mode=value;try{localStorage.setItem('rain-glass-mode',mode==='preview'?'auto':mode);}catch{}queueCapture();start();},
    destroy(){
      if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);clearTimeout(captureTimer);clearTimeout(recoveryTimer);clearInterval(refreshTimer);
      resizeObserver?.disconnect();intersectionObserver?.disconnect();removers.forEach(remove=>remove());releaseGL();canvas.remove();fallback?.canvas.remove();snapshot=null;
      sky.classList.remove('rain-glass-active');
      if(window.RainGlass===this)delete window.RainGlass;
    },
  };
  on(sky,'pointermove',wipe,{passive:true});on(sky,'pointerdown',wipe,{passive:true});
  on(sky,'pointerleave',()=>{lastPointer=null;},{passive:true});on(sky,'pointercancel',()=>{lastPointer=null;},{passive:true});
  on(document,'visibilitychange',start);on(window,'hashchange',()=>{queueCapture();start();});
  on(window,'pagehide',event=>{if(!event.persisted)window.RainGlass?.destroy();else{visible=false;start();}});
  on(window,'pageshow',()=>{visible=true;start();});
  if(reduced.addEventListener)on(reduced,'change',start);else{reduced.addListener(start);removers.push(()=>reduced.removeListener(start));}
  if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(sky);}else on(window,'resize',resize);
  on(sky,'scroll',queueCapture,{passive:true,capture:true});
  on(sky,'click',queueCapture,{passive:true});on(sky,'change',queueCapture,{passive:true});
  on(window,'kitchen-updated',queueCapture);
  const refreshTimer=setInterval(()=>{
    const next=[document.getElementById('time')?.textContent,document.getElementById('condition')?.textContent,document.documentElement.style.cssText].join('|');
    if(next!==signature||canvas.dataset.snapshot!=='ready'){signature=next;queueCapture();}
  },5000);
  resize();
})();
