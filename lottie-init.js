// lottie-init-pass.js
(function(){
  const PATH = 'https://YOUR-HOST/animation.json';

  function ready(f){document.readyState!=='loading'?f():document.addEventListener('DOMContentLoaded',f);}

  ready(function(){
    const wrap = document.getElementById('lottie-wrap');
    if(!wrap || !window.lottie) return;

    wrap.style.position='relative';
    let fx = document.getElementById('fx');
    if(!fx){ fx=document.createElement('canvas'); fx.id='fx'; wrap.appendChild(fx); }
    fx.style.cssText='position:absolute;inset:0;z-index:2;pointer-events:none;';

    const DPR = Math.min(2, window.devicePixelRatio||1);
    function fit(){
      const w = Math.max(1, wrap.clientWidth||400), h = Math.max(1, wrap.clientHeight||400);
      fx.width = w*DPR; fx.height = h*DPR; fx.style.width='100%'; fx.style.height='100%';
    }
    fit(); window.addEventListener('resize', ()=>{ fit(); if(gl) gl.viewport(0,0,fx.width,fx.height); });

    // Lottie
    const anim = lottie.loadAnimation({ container: wrap, renderer:'canvas', loop:true, autoplay:true, path: PATH });

    // Wait for Lottie’s real canvas with nonzero size
    let src=null, tries=0;
    const poll = setInterval(()=>{
      const r = anim && anim.renderer;
      const c = r && (r.canvas || (r.canvasContext && r.canvasContext.canvas));
      if (c && c.width>0 && c.height>0){ src=c; clearInterval(poll); start(); }
      else if (++tries > 200){ console.log('timeout: no lottie canvas'); clearInterval(poll); }
    }, 25);

    let gl, prog, tex, uRes, uTex, a;
    function compile(type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }

    function start(){
      gl = fx.getContext('webgl'); if(!gl){ console.log('no webgl'); return; }

      // 1) SOLID COLOR test — proves canvas is on top & sized
      {
        const vs='attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
        const fs='precision mediump float;void main(){gl_FragColor=vec4(1.0,0.0,0.8,0.4);}';
        const p=gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER,vs));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER,fs));
        gl.linkProgram(p); gl.useProgram(p);
        const quad=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,quad);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        a=gl.getAttribLocation(p,'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
        gl.viewport(0,0,fx.width,fx.height);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }

      // 2) PASSTHROUGH — samples Lottie canvas
      const vs2='attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}';
      const fs2=`precision mediump float;varying vec2 v;uniform sampler2D u_tex0;uniform vec2 u_resolution;
                 void main(){ gl_FragColor = texture2D(u_tex0, v); }`;
      prog=gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER,vs2));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER,fs2));
      gl.linkProgram(prog);
      if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.log(gl.getProgramInfoLog(prog)); return; }
      gl.useProgram(prog);

      const quad2=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad2);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      a=gl.getAttribLocation(prog,'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);

      tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uTex=gl.getUniformLocation(prog,'u_tex0'); gl.uniform1i(uTex,0);
      uRes=gl.getUniformLocation(prog,'u_resolution');

      requestAnimationFrame(tick);
    }

    function tick(){
      gl.viewport(0,0,fx.width,fx.height);
      gl.useProgram(prog);
      gl.uniform2f(uRes, fx.width, fx.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      // Try update; catch taint or other errors explicitly
      try {
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, src);
      } catch(e){
        console.log('texImage2D exception (likely taint):', e);
        return;
      }
      const err = gl.getError();
      if (err) console.log('WebGL error code:', err);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(tick);
    }
  });
})();
