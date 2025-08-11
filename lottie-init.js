// lottie-init-with-shader-diag.js
(function(){
  function ready(f){document.readyState!=='loading'?f():document.addEventListener('DOMContentLoaded',f);}
  ready(function(){
    const wrap = document.getElementById('lottie-wrap');
    if(!wrap || !window.lottie){ console.log('no wrap or lottie'); return; }

    // Ensure size
    if(!wrap.style.width) wrap.style.width = '400px';
    if(!wrap.style.height) wrap.style.height = '400px';
    wrap.style.position = 'relative';

    // Make/ensure FX canvas
    let fx = document.getElementById('fx');
    if(!fx){ fx = document.createElement('canvas'); fx.id='fx'; wrap.appendChild(fx); }
    fx.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';

    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    function fit(){
      const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
      fx.width = w*DPR; fx.height = h*DPR;
      fx.style.width = '100%'; fx.style.height = '100%';
    }
    fit(); window.addEventListener('resize', ()=>{ fit(); if(gl) gl.viewport(0,0,fx.width,fx.height); });

    // Lottie
    const anim = lottie.loadAnimation({
      container: wrap,
      renderer: 'canvas',
      loop: true, autoplay: true,
      path: 'https://YOUR-HOST/animation.json'
    });

    anim.addEventListener('DOMLoaded', () => {
      // Robustly get Lottie’s canvas
      const r = anim.renderer;
      const src = (r && (r.canvas || (r.canvasContext && r.canvasContext.canvas)));
      if(!src){ console.log('no lottie canvas'); return; }

      // WebGL setup
      const gl = fx.getContext('webgl') || fx.getContext('experimental-webgl');
      if(!gl){ console.log('no webgl'); return; }

      function sh(t,src){ const s=gl.createShader(t); gl.shaderSource(s,src); gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ console.log(gl.getShaderInfoLog(s)); }
        return s; }
      const vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

      // START with passthrough (just show Lottie texture). If you see this, your pipe works.
      let fs = `
        precision mediump float;
        varying vec2 v;
        uniform sampler2D u_tex0;
        uniform vec2 u_resolution;
        void main(){
          vec2 uv = gl_FragCoord.xy / u_resolution;
          gl_FragColor = texture2D(u_tex0, uv);
        }`;

      // Build program
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      // minimal varying to keep drivers happy
      const vs2 = `
        attribute vec2 a; varying vec2 v;
        void main(){ v = a*0.5+0.5; gl_Position=vec4(a,0.,1.); }`;
      gl.detachShader(prog, gl.getAttachedShaders(prog)[0]); // in case
      const prog2 = gl.createProgram();
      gl.attachShader(prog2, sh(gl.VERTEX_SHADER, vs2));
      gl.attachShader(prog2, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog2);
      if(!gl.getProgramParameter(prog2, gl.LINK_STATUS)){ console.log(gl.getProgramInfoLog(prog2)); return; }
      gl.useProgram(prog2);

      const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog2,'a'); gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);

      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const uTex = gl.getUniformLocation(prog2,'u_tex0');
      const uRes = gl.getUniformLocation(prog2,'u_resolution');
      gl.uniform1i(uTex, 0);

      function draw(){
        // size + uniforms
        if (fx.width === 0 || fx.height === 0) fit();
        gl.viewport(0,0,fx.width,fx.height);
        gl.uniform2f(uRes, fx.width, fx.height);

        // Upload Lottie canvas to texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        try {
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE, src);
        } catch(e){
          console.log('texImage2D error (CORS/taint?)', e);
          return;
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(draw);
      }
      draw();

      // After you see the passthrough working, swap in YOUR shader string:
      // 1) Replace fs with your big fragment (adapt uniforms: u_tex0, u_resolution)
      // 2) Recompile/link the fragment program (or build it upfront).
    });
  });
})();
