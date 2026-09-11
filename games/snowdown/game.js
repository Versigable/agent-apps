import * as THREE from 'three';

const $ = s => document.querySelector(s);
const root = $('#game-root'), testMode = new URLSearchParams(location.search).has('test');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bed4df'); scene.fog = new THREE.Fog('#bed4df', 48, 95);
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas: $('#arena'), antialias:true}); } catch { $('#error').classList.remove('hidden'); $('#error').textContent = 'This snow day needs WebGL. Try a desktop browser with hardware acceleration enabled.'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.22;
const camera = new THREE.OrthographicCamera(-24,24,18,-18,.1,150); camera.position.set(22,34,32); camera.lookAt(0,0,0);
// Camera-derived ground basis: positive input Y means screen down.
camera.updateMatrixWorld(true);
const screenRight=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);screenRight.y=0;screenRight.normalize();
const screenDown=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);screenDown.y=0;screenDown.normalize().negate();
scene.add(new THREE.HemisphereLight('#d8f2ff','#6482aa',2.4));
const sun = new THREE.DirectionalLight('#ffe1a1',3.7); sun.position.set(-16,28,-8); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,far:90}); sun.shadow.normalBias=.035; scene.add(sun);
// Matte, faceted snow and timber do not need per-fragment PBR specular work.
const mat = (color, extra={}) => new THREE.MeshLambertMaterial({color,...extra});
const materials = {snow:mat('#ecf5f4'), wood:mat('#805843'), trim:mat('#e8c591'), dark:mat('#344254'), rust:mat('#cc6449'), teal:mat('#329e9c'), gold:mat('#f4c25e'), ice:mat('#a4d5e0'), green:mat('#427e78')};
const boxG = new THREE.BoxGeometry(1,1,1), ballG = new THREE.IcosahedronGeometry(1,1);
function mesh(g,m,x,y,z,sx=1,sy=sx,sz=sx,parent=scene){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
const box=(m,x,y,z,sx,sy,sz,p)=>mesh(boxG,m,x,y,z,sx,sy,sz,p);
const ball=(m,x,y,z,r,p)=>mesh(ballG,m,x,y,z,r,r,r,p);
const cylinder=(m,x,y,z,rt,rb,h,p=scene)=>mesh(new THREE.CylinderGeometry(rt,rb,h,10),m,x,y,z,1,1,1,p);
function label(text,x,y,z,w=5,color='#64432c',bg='#e7cf9c',parent=scene){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.strokeStyle=color;ctx.lineWidth=8;ctx.strokeRect(8,8,496,112);ctx.fillStyle=color;ctx.font='bold 58px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,66,476);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const o=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));o.position.set(x,y,z);parent.add(o);return o;}
box(materials.snow,0,-.35,0,46,.7,37);box(mat('#91b3c4'),0,-1.05,0,46,1.1,37);
box(mat('#dfebec'),0,.005,0,12,.02,32);
const obstacles=[];
function building(x,z,w,d,h,name,color){const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);box(mat(color),0,h/2,0,w,h,d,g);for(let y=.5;y<h;y+=.6)box(materials.wood,0,y,d/2+.02,w,.06,.05,g);box(materials.trim,0,h+.35,.05,w+.6,.5,d+.6,g);box(materials.snow,0,h+.69,0,w+.85,.3,d+.8,g);box(materials.wood,0,.22,d/2+1,w+1,.44,2,g);for(const xx of [-w/2+.35,w/2-.35]){box(materials.trim,xx,1.8,d/2+1.6,.18,3.6,.18,g);box(materials.snow,xx,3.8,d/2+.7,1,.2,2.7,g);}box(materials.wood,0,3.6,d/2+1,w+1,.18,2.6,g);box(materials.snow,0,3.76,d/2+1,w+1.2,.22,2.8,g);box(materials.dark,0,1.3,d/2+.04,1.4,2.5,.1,g);box(materials.wood,0,1.1,d/2+.13,1.2,1.3,.1,g);for(const xx of [-w*.3,w*.3]){box(materials.trim,xx,2,d/2+.1,1.3,1.7,.1,g);box(mat('#ffc575',{emissive:'#efa34c',emissiveIntensity:.8}),xx,2,d/2+.17,1.05,1.45,.07,g);box(materials.wood,xx,2,d/2+.22,.07,1.5,.06,g);box(materials.wood,xx,2,d/2+.23,1.1,.07,.06,g);}box(materials.trim,0,h+.9,d/2-.1,w*.87,1.5,.25,g);label(name,0,h+.94,d/2+.05,w*.8,'#67442e','#eed7a6',g);box(materials.snow,0,h+1.73,d/2-.1,w*.92,.18,.5,g);obstacles.push({x,z,w:w/2+.35,d:d/2+.5});}
building(-10,-10,8,5,5.2,'SALOON','#ae6c52');building(0,-12,6,4,3.8,'SHERIFF','#7b99a0');building(10,-10,7,5,4.5,'COLD BANK','#d3ad75');building(-17,1,4,6,3.5,'POST','#769395');
function tree(x,z,s=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);box(materials.wood,0,.7,0,.35,1.4,.35,g);for(let i=0;i<3;i++){mesh(new THREE.ConeGeometry(1.4-i*.3,2.5,7),materials.green,0,1.8+i*.9,0,1,1,1,g);mesh(new THREE.ConeGeometry(1.18-i*.26,1.75,7),materials.snow,0,2.25+i*.9,0,1,1,1,g);}}
for(const [x,z,s] of [[-20,-13,1.5],[19,-13,1.4],[20,-5,1],[-21,9,1],[18,10,1.1],[-15,13,.8],[15,14,.7],[-7,-17,1],[7,-17,.9]])tree(x,z,s);
for(let x=-20;x<22;x+=3){for(const z of [-17,16]){box(materials.wood,x,.7,z,.18,1.4,.18);box(materials.wood,x+1.5,.7,z,3,.16,.15);box(materials.snow,x+1.5,.83,z,3,.12,.2);}}
for(const [x,z] of [[-7,-5],[7,-5],[-13,6],[12,6]]){cylinder(materials.wood,x,.65,z,.65,.55,1.3);cylinder(materials.dark,x,.4,z,.67,.67,.09);cylinder(materials.dark,x,1,z,.67,.67,.09);ball(materials.snow,x,1.34,z,.58).scale.y=.28;obstacles.push({x,z,w:.75,d:.75});}
for(const x of [-6.4,6.4]){box(materials.dark,x,2.1,-6,.17,4.2,.17);box(materials.dark,x+.38,4.1,-6,.85,.14,.14);box(materials.gold,x+.72,3.75,-6,.45,.65,.45);box(materials.dark,x+.72,4.12,-6,.65,.1,.65);const glow=new THREE.PointLight('#ffb34f',5,6);glow.position.set(x+.72,3.7,-6);scene.add(glow);}
// Wagon, wheel spokes and a frozen water trough at the edge of town.
box(materials.wood,16,.85,1,2.4,.3,3.7);box(materials.wood,15,1.4,1,.18,1,3.7);box(materials.wood,17,1.4,1,.18,1,3.7);box(materials.snow,16,1.02,1,2,.13,3.4);
for(const x of [14.7,17.3])for(const z of [-.2,2.2]){const wheel=mesh(new THREE.TorusGeometry(.65,.1,6,12),materials.dark,x,.67,z);wheel.rotation.y=Math.PI/2;for(let i=0;i<4;i++){const spoke=box(materials.wood,x,.67,z,.07,1.2,.07);spoke.rotation.x=i*Math.PI/4;}}
obstacles.push({x:16,z:1,w:1.8,d:2.3});
for(let i=0;i<70;i++){const x=Math.sin(i*18.42)*21,z=Math.cos(i*9.13)*16;const b=ball(materials.snow,x,.05,z,.3+(i%4)*.12);b.scale.y=.25;}
// The town never moves: combine its meshes by material once, retaining exact
// world-space geometry, normals, UVs and the warm window/sign materials.
function batchStaticTown(){
 const groups=new Map(), originals=[];
 scene.updateMatrixWorld(true);
 scene.traverse(o=>{if(o.isMesh){originals.push(o);const key=o.material; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}});
 for(const [material,objects] of groups){
  const pieces=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});
  const geometry=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){
   const size=pieces[0].getAttribute(name).itemSize;
   const array=new Float32Array(pieces.reduce((n,g)=>n+g.getAttribute(name).array.length,0));let offset=0;
   for(const g of pieces){array.set(g.getAttribute(name).array,offset);offset+=g.getAttribute(name).array.length;}
   geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
  }
  geometry.computeBoundingSphere();
  const merged=new THREE.Mesh(geometry,material);merged.castShadow=objects.some(o=>o.castShadow);merged.receiveShadow=objects.some(o=>o.receiveShadow);scene.add(merged);
  pieces.forEach(g=>g.dispose());
 }
 const obsolete=new Set();for(const o of originals){o.removeFromParent();if(o.geometry!==boxG&&o.geometry!==ballG)obsolete.add(o.geometry);}obsolete.forEach(g=>g.dispose());
}
batchStaticTown();
// Bake only the stationary town. Moving actors retain their ground rings and
// receive the detailed town shadows, without rerendering a 2048² map each frame.
renderer.render(scene,camera);renderer.shadowMap.autoUpdate=false;
function cowboy(color){const g=new THREE.Group();scene.add(g);const body=box(color,0,.99,0,.64,.76,.42,g);box(materials.trim,0,1.15,.24,.12,.45,.06,g);const legs=[];for(const x of [-.19,.19]){const leg=box(materials.dark,x,.35,0,.23,.6,.26,g);box(materials.wood,0,-.24,.06,.28,.2,.4,leg);legs.push(leg);}ball(mat('#efbb8d'),0,1.62,0,.32,g);box(materials.dark,0,1.57,.285,.3,.08,.04,g);cylinder(materials.wood,0,1.92,0,.68,.65,.12,g);cylinder(materials.wood,0,2.11,-.04,.35,.41,.38,g);cylinder(materials.gold,0,1.98,-.04,.415,.415,.1,g);box(materials.rust,0,1.34,.24,.46,.16,.08,g);const arm=box(color,.45,1,.06,.22,.62,.23,g);ball(materials.snow,.45,.85,.2,.18,g);box(color,-.45,1,0,.22,.6,.23,g);const ring=mesh(new THREE.RingGeometry(.64,.78,32),new THREE.MeshBasicMaterial({color:color.color,side:THREE.DoubleSide,transparent:true,opacity:.8}),0,.025,0,1,1,1,g);ring.rotation.x=-Math.PI/2;return {g,legs,arm,ring,body};}
function snowman(){const g=new THREE.Group();scene.add(g);ball(materials.snow,0,.58,0,.65,g);ball(materials.snow,0,1.3,0,.47,g);ball(materials.snow,0,1.95,0,.37,g);cylinder(materials.dark,0,2.26,0,.6,.6,.1,g);cylinder(materials.dark,0,2.45,0,.32,.36,.35,g);cylinder(materials.rust,0,2.32,0,.37,.37,.08,g);box(materials.rust,0,1.65,0,.85,.17,.65,g);box(materials.rust,.3,1.37,.3,.2,.55,.1,g);for(const x of [-.13,.13])ball(materials.dark,x,2.01,.32,.045,g);const nose=mesh(new THREE.ConeGeometry(.09,.4,6),materials.rust,0,1.94,.48,1,1,1,g);nose.rotation.x=Math.PI/2;for(const y of [.5,.78,1.12])ball(materials.dark,0,y,.59,.055,g);for(const x of [-.7,.7]){const arm=box(materials.wood,x,1.3,0,.12,.85,.12,g);arm.rotation.z=x>0?-.9:.9;}return g;}
const players=[0,1].map((id)=>({id,...cowboy(id?materials.teal:materials.rust),x:id?2:-2,z:3,hp:5,active:true,angle:Math.PI,moveAngle:Math.PI,windup:0,recoil:0,impact:0,throws:0,dodges:0,hitsReceived:0,fire:0,dodge:0,inv:0,dash:0,revive:0}));
let enemies=[], bullets=[], particles=[], pickups=[], state='menu', wave=0, score=0, shots=0, dodges=0, hits=0, revives=0, elapsed=0, transition=0, noticeTimer=0, mode=2, seed=7331;
const keys=new Set();const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function cooldownHUD(){for(const p of players){$('#cooldown'+p.id).textContent=p.hp<=0?'STAND NEAR PARTNER TO THAW':`${p.windup>0?'WINDING UP':p.fire>0?'THROW '+p.fire.toFixed(1)+'s':'THROW READY'} · ${p.dash>0?'DODGE ACTIVE!':p.dodge>0?'DODGE '+p.dodge.toFixed(1)+'s':'DODGE READY'}`;}}
function sync(){cooldownHUD();root.dataset.state=state;root.dataset.shotsFired=shots;root.dataset.enemyCount=enemies.length;root.dataset.wave=wave;root.dataset.score=score;$('#wave').textContent=wave?`WAVE ${wave} / 3 · ${enemies.length} OUTLAWS`:'FROSTY FRONTIER';$('#score').textContent=String(score).padStart(5,'0');for(const p of players)$('#health'+p.id).textContent=!p.active?'RIDING SOLO':p.hp<=0?`FROZEN · ${Math.floor(p.revive/2.2*100)}%`:'♥ '.repeat(p.hp)+'♡ '.repeat(5-p.hp);}
function announce(text,time=3){$('#announcement').textContent=text;noticeTimer=time;}
function clearEntities(list){for(const e of list)scene.remove(e.g);list.length=0;}
function spawnWave(){wave++;transition=0;announce(['','Draw, pardner!','A flurry of bad decisions.','The last cold standoff.'][wave]);for(let i=0;i<3+wave*2;i++){const angle=i/(3+wave*2)*Math.PI*2;const e={g:snowman(),x:Math.cos(angle)*11,z:Math.sin(angle)*8,hp:wave===3?3:2,fire:1.6+random()*2,t:random()*6};enemies.push(e);}sync();}
function start(n=mode){mode=n;seed=7331;accumulator=0;last=performance.now();state='playing';wave=score=shots=dodges=hits=revives=elapsed=transition=0;keys.clear();for(const list of [enemies,bullets,particles,pickups])clearEntities(list);for(const p of players){Object.assign(p,{x:p.id?2:-2,z:3,hp:5,active:p.id<n,angle:Math.PI,moveAngle:Math.PI,windup:0,recoil:0,impact:0,throws:0,dodges:0,hitsReceived:0,fire:0,dodge:0,inv:1,dash:0,revive:0});p.g.visible=p.active;}$('.teal').style.display=n===1?'none':'';for(const id of ['menu','pause-menu','end-menu'])$('#'+id).classList.add('hidden');spawnWave();sync();render();}
function move(p,dx,dz){const nx=THREE.MathUtils.clamp(p.x+dx,-14,14),nz=THREE.MathUtils.clamp(p.z+dz,-7,13);if(!obstacles.some(o=>Math.abs(nx-o.x)<o.w+.4&&Math.abs(p.z-o.z)<o.d+.4))p.x=nx;if(!obstacles.some(o=>Math.abs(p.x-o.x)<o.w+.4&&Math.abs(nz-o.z)<o.d+.4))p.z=nz;}
function shoot(p){if(p.fire>0||p.windup>0||!p.active||p.hp<=0||state!=='playing')return;p.windup=.16;p.fire=.46;}
function release(p){let target=enemies.reduce((a,b)=>!a||dist(p,b)<dist(p,a)?b:a,null);if(target)p.angle=Math.atan2(target.x-p.x,target.z-p.z);const dx=Math.sin(p.angle),dz=Math.cos(p.angle);const g=ball(materials.snow,p.x+dx*.7,1.2,p.z+dz*.7,.19);bullets.push({g,x:g.position.x,z:g.position.z,dx:dx*19,dz:dz*19,life:1.8,owner:p.id});p.recoil=.18;p.throws++;shots++;tone(540,.06,'triangle',.018);sync();}
function dodge(p){if(state!=='playing'||!p.active||p.hp<=0||p.dodge>0)return;p.dodge=2.5;p.dash=.23;p.inv=.4;p.dodges++;dodges++;burst(p.x,p.z,materials.snow,8);tone(150,.1,'sine',.02);sync();}
let audio=null,sound=false;
function tone(freq,duration,type='sine',volume=.03){if(!sound||state!=='playing')return;try{audio ||= new AudioContext();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.6,audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{/* Sound is optional. */}}
function burst(x,z,m,n=12){for(let i=0;i<n;i++){const g=ball(m,x,.9,z,.08+random()*.12);particles.push({g,x,z,y:.9,dx:(random()-.5)*7,dz:(random()-.5)*7,dy:2+random()*4,life:.6+random()*.4});}}
let accumulator=0;const FIXED_STEP=1/120,MAX_FRAME=.25;
function consumeFrame(delta){const wasPlaying=state==='playing';pollPause();if(!wasPlaying||state!=='playing'){accumulator=0;return;}accumulator+=Math.min(Math.max(0,delta),MAX_FRAME);while(accumulator+1e-10>=FIXED_STEP&&state==='playing'){accumulator-=FIXED_STEP;update(FIXED_STEP);}if(state!=='playing')accumulator=0;}
function pause(){if(state==='playing'){accumulator=0;state='paused';keys.clear();$('#pause-menu').classList.remove('hidden');audio?.suspend();sync();}}
function resume(){if(state==='paused'){accumulator=0;last=performance.now();state='playing';$('#pause-menu').classList.add('hidden');if(sound)audio?.resume();sync();}}
const startHeld=[false,false];
function pollPause(){const pads=navigator.getGamepads?Array.from(navigator.getGamepads()):[];let toggle=false;for(let i=0;i<2;i++){const held=!!pads[i]?.buttons[9]?.pressed;if(held&&!startHeld[i])toggle=true;startHeld[i]=held;}if(toggle){state==='paused'?resume():pause();}return pads;}
function update(dt){const pads=pollPause();if(state!=='playing')return;elapsed+=dt;noticeTimer-=dt;if(noticeTimer<=0)$('#announcement').textContent='';
for(const p of players){if(!p.active)continue;p.fire=Math.max(0,p.fire-dt);p.dodge=Math.max(0,p.dodge-dt);p.inv=Math.max(0,p.inv-dt);p.dash=Math.max(0,p.dash-dt);p.recoil=Math.max(0,p.recoil-dt);p.impact=Math.max(0,p.impact-dt);if(p.hp<=0){p.windup=0;continue;}if(p.windup>0){p.windup=Math.max(0,p.windup-dt);if(p.windup===0)release(p);}const k=p.id?['arrowleft','arrowright','arrowup','arrowdown','k']:['a','d','w','s','f'];let dx=Number(keys.has(k[1]))-Number(keys.has(k[0])),dz=Number(keys.has(k[3]))-Number(keys.has(k[2]));const pad=pads[p.id];if(pad){dx+=Math.abs(pad.axes[0])>.18?pad.axes[0]:0;dz+=Math.abs(pad.axes[1])>.18?pad.axes[1]:0;if(pad.buttons[0]?.pressed||pad.buttons[7]?.pressed)shoot(p);if(pad.buttons[1]?.pressed)dodge(p);}const sx=dx,sy=dz;dx=screenRight.x*sx+screenDown.x*sy;dz=screenRight.z*sx+screenDown.z*sy;const length=Math.hypot(dx,dz);if(length){dx/=Math.max(1,length);dz/=Math.max(1,length);p.moveAngle=Math.atan2(dx,dz);p.angle=p.moveAngle;}if(p.dash>0){dx=Math.sin(p.moveAngle??p.angle)*3;dz=Math.cos(p.moveAngle??p.angle)*3;}move(p,dx*5.3*dt,dz*5.3*dt);if(keys.has(k[4]))shoot(p);p.legs.forEach((l,i)=>l.rotation.x=length?Math.sin(elapsed*15+i*Math.PI)*.42:0);p.arm.rotation.x=p.windup>0?-2.3*(1-p.windup/.16):p.recoil>0?.9*(p.recoil/.18):0;p.body.rotation.x=p.windup>0?-.22:p.recoil>0?.22:0;}
for(const p of players){p.g.position.set(p.x,0,p.z);p.g.rotation.y=p.angle;p.g.rotation.z=p.hp<=0?1.2:p.dash>0?-.3:p.impact>0?Math.sin(elapsed*65)*.18:0;p.ring.scale.setScalar(p.dash>0?1.7:1);p.ring.material.opacity=p.dash>0?1:p.inv>0?.45+Math.sin(elapsed*25)*.3:.85;}
// Combat update is installed below; rendering and input use the same simulation.
combat(dt);
for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.dx*dt;p.z+=p.dz*dt;p.dy-=12*dt;p.y+=p.dy*dt;p.g.position.set(p.x,Math.max(.05,p.y),p.z);p.g.scale.multiplyScalar(Math.pow(.98,dt*60));if(p.life<=0){scene.remove(p.g);particles.splice(i,1);}}
sync();}
function hurt(p,amount=1){if(p.hp<=0||p.inv>0)return;p.hp=Math.max(0,p.hp-amount);p.hitsReceived++;p.impact=.3;p.inv=1.25;burst(p.x,p.z,materials.ice,14);tone(110,.18,'sawtooth',.025);if(p.hp===0){p.revive=0;announce(mode===2?'Partner frozen! Stand beside them to thaw.':'That was cold.',3);}}
function dropCocoa(x,z){const g=new THREE.Group();scene.add(g);cylinder(materials.rust,0,.5,0,.25,.21,.45,g);cylinder(materials.trim,0,.74,0,.25,.25,.04,g);const handle=mesh(new THREE.TorusGeometry(.14,.045,6,10),materials.trim,.28,.52,0,1,1,1,g);const halo=mesh(new THREE.RingGeometry(.43,.52,24),new THREE.MeshBasicMaterial({color:'#efb95b',side:THREE.DoubleSide}),0,.035,0,1,1,1,g);halo.rotation.x=-Math.PI/2;pickups.push({g,x,z,life:25});}
function kill(e){score+=100;burst(e.x,e.z,materials.snow,20);burst(e.x,e.z,materials.gold,5);scene.remove(e.g);enemies.splice(enemies.indexOf(e),1);if(random()<.4)dropCocoa(e.x,e.z);tone(770,.13,'triangle',.025);}
function finish(won){state=won?'won':'lost';keys.clear();$('#end-menu').classList.remove('hidden');$('#end-eyebrow').textContent=won?'RATTLEFROST’S MOST WANTED… FRIENDS':'FROZEN, NOT FORGOTTEN';$('#end-title').textContent=won?'The West is thawed.':'Snow hard feelings.';$('#end-copy').textContent=won?`All three waves cleared. ${score} points. Now somebody put the kettle on.`:`Your posse got iced. ${score} points · wave ${wave} of 3. Dodge the pink snowballs and stay close to thaw your partner.`;$('#announcement').textContent='';audio?.suspend();sync();}
function combat(dt){
 const living=players.filter(p=>p.active&&p.hp>0);
 if(!living.length){finish(false);return;}
 for(const p of players.filter(p=>p.active&&p.hp<=0)){if(living.some(q=>dist(p,q)<2.1)){p.revive+=dt;if(p.revive>=2.2){p.hp=3;p.inv=2;p.revive=0;revives++;burst(p.x,p.z,materials.gold,20);announce('A warm welcome back.',2);}}else p.revive=Math.max(0,p.revive-dt*.5);}
 for(const e of enemies){const p=living.reduce((a,b)=>dist(e,b)<dist(e,a)?b:a);let dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);e.t+=dt;e.fire-=dt;e.impact=Math.max(0,(e.impact||0)-dt);e.g.scale.set(1+e.impact,1-e.impact,1+e.impact);e.g.rotation.z=e.impact*Math.sin(e.t*45);e.g.rotation.y=Math.atan2(dx,dz);if(d>4.5){move(e,dx/d*(1.0+wave*.13)*dt,dz/d*(1.0+wave*.13)*dt);}else if(d<2){move(e,-dx/Math.max(d,.01)*dt,-dz/Math.max(d,.01)*dt);}e.g.position.set(e.x,Math.abs(Math.sin(e.t*5))*.07,e.z);if(e.fire<0){e.fire=2.6+random()*1.5-wave*.2;const g=ball(matEnemyBall,e.x,1.25,e.z,.25);bullets.push({g,x:e.x,z:e.z,dx:dx/Math.max(d,.01)*7,dz:dz/Math.max(d,.01)*7,life:3.5,owner:-1});}if(d<.95)hurt(p);}
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life-=dt;b.x+=b.dx*dt;b.z+=b.dz*dt;b.g.position.set(b.x,1.15,b.z);b.g.rotation.x+=dt*8;let remove=b.life<=0;const targets=b.owner<0?living:enemies;for(const target of targets){if(dist(b,target)<(b.owner<0?.65:.78)){if(b.owner<0)hurt(target);else{hits++;target.hp--;target.impact=.22;burst(b.x,b.z,materials.snow,5);if(target.hp<=0)kill(target);}remove=true;break;}}if(obstacles.some(o=>Math.abs(b.x-o.x)<o.w&&Math.abs(b.z-o.z)<o.d)){remove=true;burst(b.x,b.z,materials.snow,3);}if(remove){scene.remove(b.g);bullets.splice(i,1);}}
 for(let i=pickups.length-1;i>=0;i--){const c=pickups[i];c.life-=dt;c.g.position.set(c.x,Math.sin(elapsed*3)*.1,c.z);c.g.rotation.y+=dt;const p=living.find(p=>dist(c,p)<1&&p.hp<5);if(p){p.hp=Math.min(5,p.hp+2);score+=25;burst(c.x,c.z,materials.gold,10);tone(880,.2);announce('Hot cocoa. Cold justice.',2);}if(p||c.life<=0){scene.remove(c.g);pickups.splice(i,1);}}
 if(!enemies.length){transition+=dt;if(transition>2.8){if(wave===3)finish(true);else{for(const p of living)p.hp=Math.min(5,p.hp+1);spawnWave();}}else if(transition<dt*1.5)announce('Wave cleared. Take a cocoa break.',2.7);}
}
const matEnemyBall=mat('#eb7890',{emissive:'#f15c84',emissiveIntensity:.25});
const markerPoint=new THREE.Vector3();
function render(){for(const p of players){const marker=$('#marker'+p.id);marker.style.display=p.active&&state!=='menu'?'block':'none';markerPoint.set(p.x,2.9,p.z).project(camera);marker.style.left=`${(markerPoint.x*.5+.5)*innerWidth}px`;marker.style.top=`${(-markerPoint.y*.5+.5)*innerHeight}px`;}for(const p of players){p.g.position.set(p.x,0,p.z);p.g.rotation.y=p.angle;}for(const e of enemies)e.g.position.set(e.x,0,e.z);renderer.render(scene,camera);}
function resize(){const aspect=innerWidth/innerHeight,span=aspect<1.3?24:18;camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);render();}addEventListener('resize',resize);
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' ','f','g','k','l'].includes(k))e.preventDefault();if(e.repeat)return;if(k==='escape'||k==='p'){state==='paused'?resume():pause();return;}keys.add(k);if(k==='g')dodge(players[0]);if(k==='l')dodge(players[1]);});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>{keys.clear();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('#start').onclick=()=>start(2);$('#solo').onclick=()=>start(1);$('#pause').onclick=()=>state==='paused'?resume():pause();$('#resume').onclick=resume;document.querySelectorAll('.restart').forEach(b=>b.onclick=()=>start());$('#back-menu').onclick=()=>{state='menu';$('#end-menu').classList.add('hidden');$('#menu').classList.remove('hidden');sync();};$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'Sound on':'Sound off';if(!sound)audio?.suspend();else tone(660,.1);};
const snapshot=()=>({state,wave,score,shots,dodges,hits,revives,elapsed,enemies:enemies.length,bullets:bullets.length,pickups:pickups.length,renderer:renderer.constructor.name,players:players.map(p=>({x:p.x,z:p.z,hp:p.hp,active:p.active,inv:p.inv,dodge:p.dodge,revive:p.revive,windup:p.windup,recoil:p.recoil,throws:p.throws,dodges:p.dodges,hitsReceived:p.hitsReceived}))});
window.__snowdown={snapshot};if(testMode)Object.assign(window.__snowdown,{
 frameDelta(seconds){consumeFrame(seconds);render();return snapshot();},
 step(seconds){for(let t=0;t<Math.min(seconds,60);t+=1/60)update(Math.min(1/60,seconds-t));render();return snapshot();},
 encounter(){clearEntities(enemies);clearEntities(bullets);transition=0;players[0].x=-2;players[0].z=3;enemies.push({g:snowman(),x:-2,z:-1,hp:1,fire:100,t:0});enemies.push({g:snowman(),x:13,z:-6,hp:2,fire:100,t:0});sync();},
 fire(id){shoot(players[id]);},
 enemySnowball(id){const p=players[id];p.inv=0;const g=ball(matEnemyBall,p.x,1.2,p.z-1,.25);bullets.push({g,x:p.x,z:p.z-1,dx:0,dz:7,life:1,owner:-1});},
 down(id){const p=players[id];p.inv=0;hurt(p,5);sync();},
 place(id,x,z){players[id].x=x;players[id].z=z;render();},
 cocoa(id){const p=players[id];dropCocoa(p.x,p.z);},
 clearWave(){for(const e of [...enemies])kill(e);clearEntities(bullets);sync();}
});
resize();sync();let last=performance.now(),qualityFrames=0,qualityTime=0;
function frame(now){
 const delta=(now-last)/1000;last=now;
 // Reduce only the drawing buffer on persistently slow devices (e.g. software
 // WebGL). DOM text stays native resolution; deterministic test mode stays fixed.
 // Never change physics time to conceal a slow renderer. Ignore tab-resume gaps.
 if(!testMode&&!document.hidden&&delta<1){
  qualityTime+=delta;qualityFrames++;
  if(qualityFrames===8){
   if(qualityTime/qualityFrames>.035&&renderer.getPixelRatio()>.5)renderer.setPixelRatio(Math.max(.5,renderer.getPixelRatio()*.75));
   qualityFrames=0;qualityTime=0;
  }
 }
 if(!testMode)consumeFrame(delta);render();requestAnimationFrame(frame);
}requestAnimationFrame(frame);
