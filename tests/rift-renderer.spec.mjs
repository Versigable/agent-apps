import { test, expect } from '@playwright/test';

test('vector renderer draws the combat vocabulary without mutating simulation', async ({page,request}) => {
  expect((await request.get('/games/rift-runner/renderer.js')).status()).toBe(200);
  await page.goto('/games/rift-runner/');
  const result=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=1200;c.height=700;
    const scene={W:1200,H:700,state:'playing',time:3,player:{x:600,y:350,angle:0,invuln:0,cooldown:0},
      enemies:['chaser','weaver','splitter','mini','blackhole'].map((type,i)=>({type,x:180+i*200,y:200,r:type==='blackhole'?30:18,age:3,hp:40,maxHp:40})),
      bullets:[{x:710,y:350,vx:800,vy:0,life:1}],enemyShots:[{x:800,y:450,vx:-100,vy:0,life:1}],
      particles:[{x:600,y:200,vx:50,vy:40,life:.6,max:1,color:'#ff49b8'}],trails:[],geoms:[{x:400,y:450,life:8}],
      shockwaves:[{x:600,y:350,life:.5,max:1,radius:180}],score:100,multiplier:2,weaponTier:1,shake:0};
    const before=JSON.stringify(scene),context=c.getContext('2d');let positiveBlurSets=0;
    const blurDescriptor=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'shadowBlur');
    Object.defineProperty(context,'shadowBlur',{get(){return blurDescriptor.get.call(this);},set(v){if(v>0)positiveBlurSets++;blurDescriptor.set.call(this,v);}});
    window.RiftRenderer.draw(context,scene,1/60);
    const pixels=c.getContext('2d').getImageData(0,0,1200,700).data;let bright=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>300)bright++;
    return {unchanged:JSON.stringify(scene)===before,bright,positiveBlurSets};
  });
  expect(result.positiveBlurSets).toBe(0);
  expect(result.unchanged).toBe(true);expect(result.bright).toBeGreaterThan(1000);
});
