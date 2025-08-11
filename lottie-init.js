(function(){
  function ready(fn){ document.readyState!=='loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  ready(function(){
    const el = document.getElementById('lottie-wrap');
    if(!el){ console.log('no #lottie-wrap found'); return; }
    console.log('init lottie');
    lottie.loadAnimation({
      container: el,
      renderer: 'canvas',
      loop: true,
      autoplay: true,
      path: 'https://cdn.jsdelivr.net/gh/kylejmichel/pal/wave-then-idle.json'
    });
  });
})();
