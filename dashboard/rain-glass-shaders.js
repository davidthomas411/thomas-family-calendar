/* Wet-glass shader. Hash / procedural bead approach adapted from Binix (MIT).
 * Integration, persistent mask and rendering lifecycle are specific to this app.
 * See vendor/Binix.LICENSE. No demo UI, media, audio or lightning is included. */
(() => {
  const vertex = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }`;
  const fragment = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 color;
  uniform sampler2D uBackground;
  uniform sampler2D uErasedMask;
  uniform vec2 uSize;
  uniform vec4 uRegion;
  uniform vec4 uControls;
  uniform float uTime;
  uniform float uMotion;
  uniform float uStrength;
  vec3 N13(float p) {
    vec3 p3 = fract(vec3(p) * vec3(.1031,.11369,.13787));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract(vec3((p3.x+p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
  }
  float beads(vec2 p) {
    vec2 cell = floor(p / 24.);
    vec2 local = mod(p, 24.);
    vec3 n = N13(cell.x * 107.45 + cell.y * 3543.654);
    vec2 center = 3. + n.xy * 18.;
    float radius = .65 + n.z * n.z * 2.8;
    float d = length((local - center) / vec2(1.,1.15)) / radius;
    return (1. - smoothstep(.05, 1., d)) * step(.40, n.z);
  }
  vec2 runners(vec2 p) {
    float column = floor(p.x / 65.);
    vec3 n = N13(column * 75.13 + 23.);
    float speed = (25. + n.y * 45.) * uMotion;
    float y = mod(p.y + n.z * 420. - uTime * speed, 420.);
    float x = mod(p.x,65.) - (10. + n.x * 45.);
    x += sin(p.y * .015 + n.z * 7.) * 1.2;
    float d = length(vec2(x / 4.3, (y - 365.) / 7.5));
    float drop = 1. - smoothstep(.0,1.,d);
    float trail = (1.-smoothstep(.5,2.1,abs(x))) * smoothstep(265.,345.,y) * (1.-smoothstep(358.,368.,y));
    return vec2(drop,trail);
  }
  void main() {
    vec2 p = vec2(vUv.x, 1.-vUv.y) * uSize;
    float region = smoothstep(uRegion.x,uRegion.x+22.,p.x)
      * (1.-smoothstep(uRegion.z-32.,uRegion.z,p.x))
      * (1.-smoothstep(uRegion.w-45.,uRegion.w,p.y));
    // Keep the weather/meal controls optically clear as well as clickable.
    float controls = smoothstep(uControls.x-6.,uControls.x,p.x)
      * (1.-smoothstep(uControls.z,uControls.z+6.,p.x))
      * smoothstep(uControls.y-6.,uControls.y,p.y)
      * (1.-smoothstep(uControls.w,uControls.w+6.,p.y));
    region *= 1.-controls;
    if (region < .001) { color=vec4(0.); return; }
    float wipe = texture(uErasedMask, vUv).r;
    vec2 running = runners(p);
    float height = max(beads(p),running.x) * (1.-wipe);
    vec2 normal = vec2(dFdx(height),-dFdy(height)) * 4.;
    normal = clamp(normal,vec2(-.9),vec2(.9));
    vec2 uv = clamp(vUv + normal * vec2(7.) / uSize,vec2(.001),vec2(.999));
    vec3 clear = texture(uBackground,uv).rgb;
    vec2 blur = vec2(3.6)/uSize;
    vec3 soft = texture(uBackground,uv + vec2(blur.x,0)).rgb
      + texture(uBackground,uv - vec2(blur.x,0)).rgb
      + texture(uBackground,uv + vec2(0,blur.y)).rgb
      + texture(uBackground,uv - vec2(0,blur.y)).rgb;
    soft = soft * .20 + clear * .20;
    float fog = (1.-wipe) * (1.-running.y*.6) * (1.-height*.85);
    vec3 glass = mix(clear,soft,fog*.8);
    glass = mix(glass,vec3(.78,.84,.86),fog*.10);
    float specular = max(0.,dot(normal,normalize(vec2(-.6,.8))));
    float shadow = max(0.,dot(normal,normalize(vec2(.6,-.8))));
    glass += vec3(specular*.20-shadow*.10) * (1.-wipe);
    float alpha = max(fog*.12, max(height*.85,running.y*.22)) * region * uStrength;
    color = vec4(glass,alpha);
  }`;
  // GLSL ES 1.00 renders the same glass on WebGL 1, including Safari.
  const vertexWebGL1=vertex.replace('#version 300 es','').replace('in vec2 aPosition','attribute vec2 aPosition').replace('out vec2 vUv','varying vec2 vUv');
  const fragmentWebGL1=fragment.replace('#version 300 es','').replace('in vec2 vUv','varying vec2 vUv').replace('out vec4 color;','').replace(/\bcolor\b/g,'gl_FragColor').replace(/\btexture\(/g,'texture2D(');
  const fragmentPortable=fragmentWebGL1.replace('vec2 normal = vec2(dFdx(height),-dFdy(height)) * 4.;',`vec2 delta = vec2(.75,0.);
    float right = max(beads(p+delta),runners(p+delta).x);
    float left = max(beads(p-delta),runners(p-delta).x);
    float below = max(beads(p+delta.yx),runners(p+delta.yx).x);
    float above = max(beads(p-delta.yx),runners(p-delta.yx).x);
    vec2 normal = vec2(right-left,below-above) * (1.-wipe) * 2.667;`);
  window.RainGlassShaders = { vertex, fragment, vertexWebGL1,
    fragmentWebGL1:'#extension GL_OES_standard_derivatives : enable\n'+fragmentWebGL1,
    fragmentPortable };
})();
