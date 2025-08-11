(function(){
  function ready(fn){document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn);}

  ready(function(){
    const wrap = document.getElementById('lottie-wrap');
    const fx   = document.getElementById('fx');
    if(!wrap || !fx || !window.lottie) return;

    // Ensure proper layering
    wrap.style.position = 'relative';
    fx.style.position = 'absolute';
    fx.style.inset = '0';
    fx.style.zIndex = '2';           // shader on top
    fx.style.pointerEvents = 'none'; // let clicks pass through

    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    function fit(w,h){
      fx.width = w*DPR; fx.height = h*DPR;
      fx.style.width = '100%'; fx.style.height = '100%';
    }

    // 1) Let Lottie create its own canvas in wrap
    const anim = lottie.loadAnimation({
      container: wrap,
      renderer: 'canvas',
      loop: true,
      autoplay: true,
      path: 'https://YOUR-HOST/animation.json'
    });

    anim.addEventListener('DOMLoaded', () => {
      const src = anim.renderer && anim.renderer.canvas;
      if(!src){ console.warn('No Lottie canvas found'); return; }

      // Size shader canvas to Lottie’s canvas
      const W = () => src.clientWidth || wrap.clientWidth || src.width;
      const H = () => src.clientHeight|| wrap.clientHeight|| src.height;
      fit(W(), H());
      window.addEventListener('resize', () => fit(W(), H()));

      // 2) WebGL setup (samples src each frame)
      const gl = fx.getContext('webgl') || fx.getContext('experimental-webgl');
      const vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
      const fs = `#ifdef GL_ES
precision mediump float;
#endif
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
/* ——— your shader from .frag ——— */
vec3 pal(int i){
  if(i==0) return vec3(0.06);
  if(i==1) return vec3(1.0);
  if(i==2) return vec3(0.95,0.32,0.32);
  if(i==3) return vec3(0.0,1.0,1.0);
  if(i==4) return vec3(0.667,1.0,0.0);
  if(i==5) return vec3(1.0,0.0,0.851);
  return vec3(1.0,0.949,0.0);
}
vec3 quant(vec3 c){ float best=1e9; vec3 q=pal(0);
  for(int i=0;i<7;i++){ vec3 p=pal(i); float d=dot(c-p,c-p); if(d<best){best=d;q=p;} } return q; }
float sdRounded(vec2 p,float b,float g,float r){
  vec2 h=vec2(b*0.5-g-r); vec2 q=abs(p-b*0.5)-h; return length(max(q,0.0))-r;
}
const float BLOCK=16.0, GAP=1.0, RAD=2.0;
const float REACH=100.0, GAIN=0.075, HALO_OPACITY=0.3;
const int   K=2;
const vec3  GAP_COL=vec3(0.0), OFF_COL=vec3(0.08);
void mainImage(out vec4 fragColor, in vec2 P){
  vec2 gid=floor(P/BLOCK);
  vec2 local=P-gid*BLOCK;
  float dPix=sdRounded(local,BLOCK,GAP,RAD);
  vec3 base=GAP_COL;
  if(dPix<=0.0){
    vec3 raw=texture2D(u_tex0,(gid+0.5)*BLOCK/u_resolution).rgb;
    vec3 q=quant(raw);
    base=all(lessThan(abs(q-pal(0)),vec3(0.001)))?OFF_COL:q;
  }
  vec3 halo=vec3(0.0);
  for(int dx=-K; dx<=K; ++dx)
  for(int dy=-K; dy<=K; ++dy){
    vec2 nid=gid+vec2(dx,dy);
    float sd=sdRounded(P-nid*BLOCK,BLOCK,GAP,RAD);
    if(sd<=0.0 || sd>REACH) continue;
    vec3 nCol=quant(texture2D(u_tex0,(nid+0.5)*BLOCK/u_resolution).rgb);
    if(all(lessThan(abs(nCol-pal(0)),vec3(0.001)))) continue;
    float w=GAIN*pow(1.0 - sd/REACH, 2.0);
    halo+=nCol*w;
  }
  halo*=HALO_OPACITY;
  vec3 colour=base+halo;
  float mx=max(colour.r,max(colour.g,colour.b));
  if(mx>1.0) colour/=mx;
  fragColor=vec4(colour,1.0);
}
void main(){ vec4 c; mainImage(c, gl_FragCoord.xy); gl_FragColor=c; }`;

      function sh(t,src){ const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
      const prog=gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs.replace('a','a')));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
      gl.useProgram(prog);

      const quad=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const a=gl.getAttribLocation(prog,'a'); gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);

      const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog,'u_tex0'), 0);
      const uRes = gl.getUniformLocation(prog,'u_resolution');

      function draw(){
        const w = W()*DPR, h = H()*DPR;
        if(fx.width!==w || fx.height!==h){ fit(W(),H()); gl.viewport(0,0,fx.width,fx.height); }
        gl.uniform2f(uRes, fx.width, fx.height);

        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        // Upload the *Lottie-created* canvas as texture source
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, src);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(draw);
      }
      gl.viewport(0,0,fx.width,fx.height);
      draw();
    });
  });
})();
