/* Pure rendering: all combat state and effect lifetimes belong to game.js. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const bloomBuffers = new WeakMap();
  const palette = {chaser:'#43baff',weaver:'#85ff58',splitter:'#fd4ac8',mini:'#ff96e6',blackhole:'#ffae45',shooter:'#ff765e',boss:'#ff4bb9'};
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function path(ctx, points, close=true) {
    ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); if(close)ctx.closePath();
  }
  function glow(ctx,color,width=1.8,blur=12) {
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.shadowColor=color;ctx.shadowBlur=0;
  }
  function polygon(ctx,n,r,rotation=0) {
    path(ctx,Array.from({length:n},(_,i)=>[Math.cos(i/n*TAU+rotation)*r,Math.sin(i/n*TAU+rotation)*r]));
  }
  function ship(ctx,x,y,angle,alpha=1,scale=1) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle||0);ctx.scale(scale,scale);ctx.globalAlpha=alpha;
    glow(ctx,'#79ffff',2,16);path(ctx,[[22,0],[-15,-13],[-7,0],[-15,13]]);ctx.fillStyle='#092c3b';ctx.fill();ctx.stroke();
    glow(ctx,'#f5ffff',1.5,4);path(ctx,[[11,0],[-9,-8],[-3,0],[-9,8]]);ctx.stroke();
    ctx.restore();
  }
  function draw(ctx,s,dt) {
    const {W=1200,H=700,player:p={x:600,y:350},time:gameTime=0,state='playing'}=s;
    const t=state==='title'?performance.now()/1000:gameTime;
    const enemies=s.enemies||[],waves=s.shockwaves||[];
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;
    ctx.fillStyle='#030711';ctx.fillRect(0,0,W,H);
    const sky=ctx.createRadialGradient(W*.5,H*.5,20,W*.5,H*.5,W*.65);
    sky.addColorStop(0,'#0b1830');sky.addColorStop(.55,'#070f22');sky.addColorStop(1,'#02050e');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const shake=clamp(s.shake||0,0,12);ctx.translate(Math.sin(t*113)*shake*.5,Math.cos(t*97)*shake*.5);
    // An elastic vector lattice: ship, implosions and blast rings bend nearby nodes.
    function warp(x,y) {
      let dx=0,dy=0;
      const px=x-p.x,py=y-p.y,d=Math.hypot(px,py),f=Math.exp(-d/125)*6;
      dx+=px/(d||1)*f;dy+=py/(d||1)*f;
      for(const e of enemies)if(e.type==='blackhole'){
        const ex=e.x-x,ey=e.y-y,ed=Math.hypot(ex,ey),pull=21*Math.exp(-ed/95);
        dx+=ex/(ed||1)*pull;dy+=ey/(ed||1)*pull;
      }
      for(const w of waves.slice(-5)){
        const wd=Math.hypot(x-w.x,y-w.y),life=clamp(w.life/(w.max||1),0,1),radius=(w.radius??360)*(1-life);
        const force=Math.exp(-Math.abs(wd-radius)/24)*life*16;
        dx+=(x-w.x)/(wd||1)*force;dy+=(y-w.y)/(wd||1)*force;
      }
      dy+=Math.sin(x*.008+t*.45)*1.8; return [x+dx,y+dy];
    }
    ctx.lineWidth=.8;ctx.strokeStyle='#163354';ctx.beginPath();
    for(let x=20;x<W;x+=40)for(let y=20;y<=H-20;y+=20){const q=warp(x,y);y===20?ctx.moveTo(...q):ctx.lineTo(...q);}
    for(let y=20;y<H;y+=40)for(let x=20;x<=W-20;x+=20){const q=warp(x,y);x===20?ctx.moveTo(...q):ctx.lineTo(...q);}
    ctx.stroke();
    ctx.fillStyle='#295274';for(let i=0;i<70;i++){const x=(i*173.7+31)%W,y=(i*91.3+73)%H;ctx.globalAlpha=.25+.2*Math.sin(t+i);ctx.fillRect(x,y,1.5,1.5);}ctx.globalAlpha=1;
    glow(ctx,'#2f87ab',1,8);ctx.strokeRect(19,19,W-38,H-38);
    glow(ctx,'#63fbff',2,10);for(const [x,y,sx,sy]of [[19,19,1,1],[W-19,19,-1,1],[19,H-19,1,-1],[W-19,H-19,-1,-1]]){path(ctx,[[x,y+sy*40],[x,y],[x+sx*40,y]],false);ctx.stroke();}
    ctx.shadowBlur=0;
    // Menu-only attract sculpture, explicitly separate from real combat entities.
    if(state==='title'){
      ctx.save();ctx.translate(890,350);ctx.globalCompositeOperation='lighter';
      for(let i=0;i<6;i++){glow(ctx,i%2?'#fd4ac8':'#43dfff',1.2,12);ctx.globalAlpha=.2+i*.05;polygon(ctx,4,80+i*30,t*.08*(i%2?-1:1)+i*.13);ctx.stroke();}
      for(let i=0;i<24;i++){const a=i/24*TAU+t*.1,r=200+35*Math.sin(i*3+t);glow(ctx,palette[['chaser','weaver','splitter'][i%3]],1.5,8);ctx.save();ctx.translate(Math.cos(a)*r,Math.sin(a)*r);polygon(ctx,4,6,t);ctx.stroke();ctx.restore();}
      ctx.restore();
    }
    ctx.globalCompositeOperation='lighter';
    for(const g of s.geoms||[]){const pulse=.8+.2*Math.sin(t*7+g.x);ctx.save();ctx.translate(g.x,g.y);glow(ctx,'#9cff67',1.4,10);polygon(ctx,4,4.5*pulse,t*.7);ctx.fillStyle='#327548';ctx.fill();ctx.stroke();ctx.restore();}
    for(const trail of s.trails||[])ship(ctx,trail.x,trail.y,trail.angle,clamp(trail.life/.4,0,1)*.4,.9);
    for(const e of enemies){
      const color=palette[e.type]||'#ff6385',r=e.r||16;ctx.save();ctx.translate(e.x,e.y);
      if(e.spawnIn>0){ctx.globalAlpha=.45;glow(ctx,color,1,8);ctx.setLineDash([4,6]);ctx.beginPath();ctx.arc(0,0,r+14+Math.sin(t*12)*3,0,TAU);ctx.stroke();ctx.setLineDash([]);}
      glow(ctx,color,2,12);
      if(e.type==='blackhole'){
        ctx.fillStyle='#010208';ctx.beginPath();ctx.arc(0,0,r*.72,0,TAU);ctx.fill();
        for(let ring=0;ring<4;ring++){ctx.save();ctx.rotate(t*(ring%2?-.7:.9)+ring);ctx.scale(1,.6+ring*.1);ctx.beginPath();ctx.arc(0,0,r+ring*6,ring*.5,Math.PI*1.6+ring*.5);ctx.globalAlpha=1-ring*.16;ctx.stroke();ctx.restore();}
        ctx.globalAlpha=1;glow(ctx,'#fff3af',1.5,5);ctx.beginPath();ctx.arc(0,0,r*.8,0,TAU);ctx.stroke();
      } else if(e.type==='weaver'){
        ctx.rotate(Math.atan2(p.y-e.y,p.x-e.x));path(ctx,[[r,0],[0,-r],[-r*.8,-r*.5],[-r*.2,0],[-r*.8,r*.5],[0,r]]);ctx.stroke();
        ctx.scale(.55,.55);path(ctx,[[r,0],[-r*.5,-r],[-r*.5,r]]);ctx.stroke();
      } else if(e.type==='splitter'||e.type==='boss'){
        ctx.rotate(t*.8+(e.age||0));polygon(ctx,4,r,Math.PI/4);ctx.stroke();polygon(ctx,4,r*.6,-t);ctx.stroke();
        glow(ctx,'#ffe5ff',1,3);path(ctx,[[-r*.35,0],[r*.35,0]],false);ctx.stroke();
      } else if(e.type==='mini'){
        ctx.rotate(Math.atan2(p.y-e.y,p.x-e.x));polygon(ctx,3,r);ctx.stroke();
      } else {
        ctx.rotate(Math.atan2(p.y-e.y,p.x-e.x));polygon(ctx,4,r);ctx.stroke();polygon(ctx,4,r*.55);ctx.stroke();
        ctx.fillStyle='#d2f5ff';ctx.fillRect(-2,-2,4,4);
      }
      ctx.restore();
    }
    for(const b of s.bullets||[]){glow(ctx,'#41eaff',4,13);path(ctx,[[b.x,b.y],[b.x-(b.vx||0)*.019,b.y-(b.vy||0)*.019]],false);ctx.stroke();glow(ctx,'#eaffff',1.5,2);ctx.stroke();}
    for(const b of s.enemyShots||[]){glow(ctx,'#ff684e',2,10);ctx.beginPath();ctx.arc(b.x,b.y,4,0,TAU);ctx.stroke();ctx.fillStyle='#fff0b7';ctx.fillRect(b.x-1,b.y-1,2,2);}
    for(const part of s.particles||[]){ctx.globalAlpha=clamp(part.life/(part.max||.8),0,1);glow(ctx,part.color||'#70ffff',1.5,5);path(ctx,[[part.x,part.y],[part.x-(part.vx||0)*.03,part.y-(part.vy||0)*.03]],false);ctx.stroke();}
    ctx.globalAlpha=1;
    for(const w of waves){const life=clamp(w.life/(w.max||1),0,1),r=(w.radius??360)*(1-life);glow(ctx,w.color||'#90faff',2,18);ctx.globalAlpha=life;ctx.beginPath();ctx.arc(w.x,w.y,Math.max(0,r),0,TAU);ctx.stroke();ctx.lineWidth=.7;ctx.beginPath();ctx.arc(w.x,w.y,Math.max(0,r-12),0,TAU);ctx.stroke();}
    ctx.globalAlpha=1;
    if(state!=='title'){
      const angle=p.angle||0;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);glow(ctx,'#389fff',1,10);path(ctx,[[-12,-6],[-27-7*Math.sin(t*44),0],[-12,6]]);ctx.fillStyle='#388aff80';ctx.fill();ctx.restore();
      ship(ctx,p.x,p.y,angle,p.invuln>0?.65+.35*Math.sin(t*25):1);
      if(p.invuln>0){glow(ctx,'#a8ffff',1,8);ctx.setLineDash([6,5]);ctx.beginPath();ctx.arc(p.x,p.y,29,0,TAU);ctx.stroke();ctx.setLineDash([]);}
      if(p.cooldown>0){glow(ctx,'#47d4d3',1.4,4);ctx.beginPath();ctx.arc(p.x,p.y,27,-Math.PI/2,-Math.PI/2+TAU*(1-clamp(p.cooldown/2.2,0,1)));ctx.stroke();}
    }
    ctx.restore();
    // One quarter-resolution bloom pass replaces hundreds of software shadow blurs.
    let bloom=bloomBuffers.get(ctx);
    if(!bloom){const canvas=document.createElement('canvas');canvas.width=Math.ceil(W/4);canvas.height=Math.ceil(H/4);bloom={canvas,ctx:canvas.getContext('2d')};bloomBuffers.set(ctx,bloom);}
    const b=bloom.ctx;b.clearRect(0,0,bloom.canvas.width,bloom.canvas.height);
    b.filter='blur(1.5px)';b.drawImage(ctx.canvas,0,0,bloom.canvas.width,bloom.canvas.height);b.filter='none';
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.48;ctx.drawImage(bloom.canvas,0,0,W,H);ctx.restore();
  }
  window.RiftRenderer=Object.freeze({draw,palette});
})();
