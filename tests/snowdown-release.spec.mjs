import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';

// Real scene/math and game simulation; only browser I/O and GPU are stubbed.
function game() {
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},getContext:()=>new Proxy({}, {get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)})});return elements.get(id);};
 class WebGLRenderer {constructor(){this.shadowMap={};}setPixelRatio(){}getPixelRatio(){return 1;}render(){}setSize(){}}
 const pads=[0,1].map(()=>({axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false}))}));
 const sandbox={THREE:{...THREE,WebGLRenderer},document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>element('canvas'),addEventListener(){}},location:{search:'?test=1'},URLSearchParams,devicePixelRatio:1,innerWidth:1280,innerHeight:720,navigator:{getGamepads:()=>pads},performance:{now:()=>0},addEventListener(){},requestAnimationFrame(){},console,window:{}};
 vm.createContext(sandbox);
 const source=fs.readFileSync(new URL('../games/snowdown/game.js',import.meta.url),'utf8').replace("import * as THREE from 'three';",'');
 vm.runInContext(source+'\nwindow.sceneTest={start,spawnBoss,updateBoss,players,keys,getBoss:()=>boss,getBullets:()=>bullets};',sandbox);
 const r=sandbox.window.sceneTest;r.start(2);return {r,t:sandbox.window.__snowdown,pads};
}

for(const encore of [false,true]) test(`volley scene lanes contain actual trajectories (${encore?'encore':'base'})`,()=>{
 const {r}=game();r.spawnBoss();const b=r.getBoss();if(encore)b.hp=b.maxHp/2;
 r.updateBoss(b,r.players[0],1.2);b.aim=.71;r.updateBoss(b,r.players[0],.1);
 b.warning.updateMatrixWorld(true);
 const lanes=[];b.warning.traverse(o=>{if(o.isMesh&&o.visible)lanes.push(o);});
 expect(lanes).toHaveLength(5);
 const origin=new THREE.Vector3(b.x,.045,b.z);
 // Capture actual rendered mesh bounds before emission, in each lane's local space.
 const footprints=lanes.map(o=>{o.geometry.computeBoundingBox();return {bounds:o.geometry.boundingBox.clone(),inverse:o.matrixWorld.clone().invert()};});
 // Crossing half health during a warning must not widen the attack behind the player's back.
 if(!encore)b.hp=b.maxHp/2;
 r.updateBoss(b,r.players[0],1);
 const shots=r.getBullets();expect(shots).toHaveLength(5);
 for(const shot of shots){
  expect(Math.hypot(shot.dx,shot.dz)*shot.life).toBeCloseTo(encore?30:24,8);
  const matching=footprints.filter(({bounds,inverse})=>[0,.25,.5,.75,1].every(f=>{
   const point=origin.clone().add(new THREE.Vector3(shot.dx,0,shot.dz).multiplyScalar(shot.life*f)).applyMatrix4(inverse);
   return bounds.clone().expandByScalar(1e-5).containsPoint(point);
  }));expect(matching).toHaveLength(1);
 }
});

test('disconnect cancels held X without remapping P2 or suppressing deliberate releases',()=>{
 const {t,pads,r}=game();pads.forEach(p=>p.buttons[2].pressed=true);t.step(.6);
 expect(t.snapshot().players.every(p=>p.charge>0)).toBe(true);
 pads[0]=null;const cancelled=t.step(.02);
 expect(cancelled.rollsLaunched).toBe(0);expect(cancelled.players[0].charge).toBe(0);expect(cancelled.players[0].heldRadius).toBe(0);
 expect(cancelled.players[1].charge).toBeGreaterThan(.4);
 pads[1].buttons[2].pressed=false;expect(t.step(.02).players.map(p=>p.chargedThrows)).toEqual([0,1]);
 r.keys.add('h');t.step(.4);r.keys.delete('h');expect(t.step(.02).players.map(p=>p.chargedThrows)).toEqual([1,1]);
});
