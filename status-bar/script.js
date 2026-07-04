function tick(){document.getElementById('time').textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});} tick(); setInterval(tick,1000);
