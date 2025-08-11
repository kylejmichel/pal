(function(){
  function ready(fn){document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn);}
  ready(function(){
    const wrap = document.getElementById('lottie-wrap');
    const fx   = document.getElementById('fx');
    if(!wrap || !fx || !window.lottie) return;

    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    const src = document.createElement('canvas');
    src.style.cssText='position:absolute;inset:0;opacity:0;pointer-events:none';
    wrap.appendChild(src);

    function fit(){
      const W = Math.max(1, wrap.clientWidth), H = Math.max(1, wrap.clientHeight);
      src.width=W*DPR; src.height=H*DPR; src.style.width='100%'; src.style.height='100%';
      fx.width =W*DPR; fx.height =H*DPR; fx.style.width ='100%'; fx.style.height ='100%';
    }
    fit(); window.addEventListener('resize', ()=>{ fit(); if(gl) gl.viewport(0,0,fx.width,fx.height); });

    const anim = lottie.loadAnimation({
      renderer:'canvas', loop:true, autoplay:true,
      rendererSettings:{ context: src.getContext('2d'), clearCanvas:true, imagePreserveAspectRatio:true },
      // Pin to a commit to avoid jsDelivr cache flakiness:
      // path:'https://cdn.jsdelivr.net/gh/kylejmichel/pal@<COMMIT>/wave-then-idle.json'
      path:'https://cdn.jsdelivr.net/gh/kylejmichel/pal/wave-then-idle.json'
    });

    const gl = fx.getContext('webgl', {preserveDrawingBuffer:false}) || fx.getContext('experimental-webgl');
    let prog, tex, aPos, uRes;

    const vs = `
      attribute vec2 aPos;
      void main(){ gl_Position = vec4(aPos,0.0,1.0); }
    `;
    const fs = `#ifdef GL_ES
precision mediump float;
#endif
uniform sampler2D u_tex0;
uniform vec2 u_resolution;

vec3 pal(int i){
  if(i==0) return vec3(0.0);      // OFF = pure black
  if(i==1) return vec3(1.0);
  if(i==2) return vec3(0.95,0.32,0.32);
  if(i==3) return vec3(0.0,1.0,1.0);
  if(i==4) return vec3(0.667,1.0,0.0);
  if(i==5) return vec3(1.0,0.0,0.851);
  return vec3(1.0,0.949,0.0);
}
vec3 quant(vec3 c){
  float best = 1e9; vec3 q = pal(0);
  for(int i=0;i<7;i++){ vec3 p=pal(i); float d=dot(c-p,c-p); if(d<best){best=d;q=p;} }
  return q;
}
float sdRounded(vec2 p,float b,float g,float r){
  vec2 h=vec2(b*0.5-g-r);
  vec2 q=abs(p-b*0.5)-h;
  return length(max(q,0.0))-r;
}
const float GAP=1.0, RAD=2.0;
const float REACH=100.0, GAIN=0.075, HALO_OPACITY=0.3;
const int   K=2;
const vec3  GAP_COL=vec3(0.0), OFF_COL=vec3(0.0);

void mainImage(out vec4 fragColor, in vec2 P){
  float cells = 28.0;
  float block = floor(min(u_resolution.x, u_resolution.y) / cells);
  vec2  gridSize = vec2(block * cells);
  vec2  offset   = 0.5 * (u_resolution - gridSize);

  vec2 Pg = P - offset;
  if (any(lessThan(Pg, vec2(0.0))) || any(greaterThanEqual(Pg, gridSize))) {
    fragColor = vec4(GAP_COL, 1.0);
    return;
  }

  vec2 gid   = floor(Pg / block);
  vec2 local = Pg - gid * block;
  float dPix = sdRounded(local, block, GAP, RAD);

  vec2 samplePx = offset + (gid + 0.5) * block;
  vec3 base = GAP_COL;
  if (dPix <= 0.0) {
    vec3 raw = texture2D(u_tex0, samplePx / u_resolution).rgb;
    vec3 q   = quant(raw);
    base = all(lessThan(abs(q - pal(0)), vec3(0.001))) ? OFF_COL : q;
  }

  vec3 halo = vec3(0.0);
  for (int dx=-K; dx<=K; ++dx)
  for (int dy=-K; dy<=K; ++dy){
    vec2 nid = gid + vec2(dx,dy);
    if (any(lessThan(nid, vec2(0.0))) || any(greaterThanEqual(nid, vec2(cells)))) continue;

    float sd = sdRounded(Pg - nid*block, block, GAP, RAD);
    if (sd <= 0.0 || sd > REACH) continue;

    vec2 nPx  = offset + (nid + 0.5) * block;
    vec3 nCol = quant(texture2D(u_tex0, nPx / u_resolution).rgb);
    if (all(lessThan(abs(nCol - pal(0)), vec3(0.001)))) continue;

    float w = GAIN * pow(1.0 - sd/REACH, 2.0);
    halo += nCol * w;
  }
  halo *= HALO_OPACITY;

  vec3 colour = base + halo;
  float mx = max(colour.r, max(colour.g, colour.b));
  if (mx > 1.0) colour /= mx;
  fragColor = vec4(colour, 1.0);
}
void main(){ vec4 c; mainImage(c, gl_FragCoord.xy); gl_FragColor=c; }`;

    function sh(t,src){ const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }

    function initGL(){
      const prog_ = gl.createProgram();
      gl.attachShader(prog_, sh(gl.VERTEX_SHADER,vs));
      gl.attachShader(prog_, sh(gl.FRAGMENT_SHADER,fs));
      gl.linkProgram(prog_);
      if(!gl.getProgramParameter(prog_,gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog_);
      gl.useProgram(prog_= (prog = prog_));
      const quad=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,quad);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),gl.STATIC_DRAW);
      aPos=gl.getAttribLocation(prog,'aPos'); gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,0,0);
      tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog,'u_tex0'),0);
      uRes=gl.getUniformLocation(prog,'u_resolution');
      gl.viewport(0,0,fx.width,fx.height);
    }
    initGL();

    // Draw exactly after Lottie paints each frame (cross-browser stable)
    function drawOnce(){
      if (fx.width===0 || fx.height===0) return;
      gl.uniform2f(uRes, fx.width, fx.height);
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }

    // Start only after JSON + images are ready, then bind per-frame draw
    let dataReady=false, imagesReady=false, bound=false;
    const tryBind = ()=>{
      if (bound || !dataReady || !imagesReady) return;
      bound = true;
      // Draw on every Lottie frame; schedule into RAF to come *after* Lottie’s paint.
      anim.addEventListener('enterFrame', ()=>{ requestAnimationFrame(drawOnce); });
      // Initial draw in case we’re paused on first frame:
      requestAnimationFrame(drawOnce);
    };
    anim.addEventListener('data_ready',   ()=>{ dataReady=true;   tryBind(); });
    anim.addEventListener('loaded_images',()=>{ imagesReady=true; tryBind(); });

    // Safety: if the tab was hidden on load (Safari/iOS), kick when visible
    document.addEventListener('visibilitychange', ()=>{ if(bound && !document.hidden) requestAnimationFrame(drawOnce); });

    // WebGL context loss/restore (Safari/Chromium intermittency)
    fx.addEventListener('webglcontextlost',  e=>{ e.preventDefault(); });
    fx.addEventListener('webglcontextrestored', ()=>{ initGL(); requestAnimationFrame(drawOnce); });
  });
})();
