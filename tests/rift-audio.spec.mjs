import { test, expect } from '@playwright/test';

// Measure rendered stereo PCM, not counters or nominal AudioParam values.
async function measureSignal(page, action, milliseconds) {
  return page.evaluate(async ({action, milliseconds}) => {
    const a = window.a, c = a.ctx;
    const probe = c.createScriptProcessor(1024, 2, 2), silent = c.createGain();
    silent.gain.value = 0;
    a.analyser.connect(probe); probe.connect(silent); silent.connect(c.destination);
    let sum = 0, count = 0, peak = 0, clipped = 0;
    probe.onaudioprocess = event => {
      for (let ch = 0; ch < event.inputBuffer.numberOfChannels; ch++) {
        for (const sample of event.inputBuffer.getChannelData(ch)) {
          sum += sample * sample; count++; peak = Math.max(peak, Math.abs(sample));
          if (Math.abs(sample) >= 1) clipped++;
        }
      }
    };
    let timer;
    if (action === 'stress') {
      a.setVolumes({music:1,sfx:1});
      timer = setInterval(() => {
        for (const name of ['shot','geom','dash','splitter','kill','gravity','bomb','death','upgrade']) a.fx(name,{tier:5,x:600});
      }, 40);
    }
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    clearInterval(timer); a.analyser.disconnect(probe); probe.disconnect(); silent.disconnect();
    return {rmsDb:20*Math.log10(Math.sqrt(sum/count)),peak,clipped,count};
  }, {action,milliseconds});
}

test('rendered default score has useful loudness with headroom under FX stress and settles to mute',async({page,request})=>{
  await boot(page,request); await page.mouse.click(10,10);
  await page.evaluate(async()=>{localStorage.removeItem('rift-runner-audio');window.a=new RiftAudio();await a.start();});
  const score = await measureSignal(page, 'score', 3700);
  const stress = await measureSignal(page, 'stress', 1600);
  await page.evaluate(()=>a.setMuted(true)); await page.waitForTimeout(200);
  const muted = await measureSignal(page, 'mute', 250);
  console.log('AUDIO_PCM',JSON.stringify({score,stress,muted}));
  await page.evaluate(()=>a.dispose());
  expect(score.count).toBeGreaterThan(100000);
  expect(score.rmsDb).toBeGreaterThan(-29);
  expect(score.rmsDb).toBeLessThan(-16);
  expect(stress.clipped).toBe(0); expect(stress.peak).toBeLessThan(.98);
  expect(muted.peak).toBeLessThan(.0001);
});
test('mixer volume and mute changes ramp the rendered signal rather than stepping it',async({page,request})=>{
  await boot(page,request); await page.mouse.click(10,10);
  const transitions = await page.evaluate(async()=>{
    localStorage.removeItem('rift-runner-audio');
    const results=[];
    // Offline rendering retains every adjacent PCM sample. Main-thread
    // ScriptProcessor delivery under CI load is unsuitable for click detection.
    // Exercise the production mixer setters with real WebAudio gains, not mocks.
    for(const kind of ['music','sfx','mute']) {
      const a=new RiftAudio(),c=new OfflineAudioContext(1,12000,48000);
      a.ctx=c;a.music=c.createGain();a.sfx=c.createGain();a.master=c.createGain();
      a.music.connect(a.master);a.sfx.connect(a.master);a.master.connect(c.destination);
      a.settings.music=kind==='sfx'?0:.55;a.settings.sfx=kind==='music'?0:.7;a._gains();
      const source=c.createConstantSource();source.offset.value=.1;
      source.connect(a.music);source.connect(a.sfx);source.start();
      const stopped=c.suspend(.1),rendered=c.startRendering();
      await stopped;
      if(kind==='mute')a.setMuted(true);else a.setVolumes({[kind]:0});
      await c.resume();const data=(await rendered).getChannelData(0);
      let maxDelta=0;
      for(let i=1;i<data.length;i++)maxDelta=Math.max(maxDelta,Math.abs(data[i]-data[i-1]));
      results.push({kind,initial:Math.abs(data[0]),maxDelta,last:Math.abs(data[data.length-1]),count:data.length});
      source.disconnect();a.music.disconnect();a.sfx.disconnect();a.master.disconnect();
    }
    return results;
  });
  console.log('AUDIO_RAMPS',JSON.stringify(transitions));
  for(const result of transitions){
    expect(result.initial).toBeGreaterThan(.01);expect(result.count).toBeGreaterThan(4000);
    expect(result.maxDelta).toBeLessThan(result.initial*.1);
    expect(result.last).toBeLessThan(.0001);
  }
});

async function boot(page, request) {
  expect((await request.get('/games/rift-runner/audio.js')).status()).toBe(200);
  await page.goto('/games/arcade/');
  await page.addScriptTag({url:'/games/rift-runner/audio.js'});
}
test('musical arrangement commits at bars and renders nonzero original score', async ({page,request})=>{
  await boot(page,request);await page.mouse.click(10,10);
  await page.evaluate(async()=>{window.a=new RiftAudio({bpm:480});await a.start();});
  await page.waitForTimeout(100);
  const pending=await page.evaluate(()=>{a.update({threat:4,weaponTier:3});return a.snapshot();});
  expect(pending.arrangement.lead).toBe(false);expect(pending.pendingArrangement.lead).toBe(true);
  await page.waitForTimeout(650);
  const played=await page.evaluate(()=>a.snapshot());
  expect(played.arrangement.lead).toBe(true);expect(played.arrangement.layers).toBe(3);
  expect(played.counters.musicNotes).toBeGreaterThan(12);expect(played.energy).toBeGreaterThan(0);
  expect(played.arrangementChanges.every(c=>c.step%16===0)).toBe(true);
  expect(played.bars).toBeGreaterThan(0);
  const freeze=await page.evaluate(async()=>{await a.pause();return {time:a.ctx.currentTime,step:a.snapshot().scheduledSteps};});
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>a.ctx.currentTime)).toBe(freeze.time);
  expect(await page.evaluate(()=>a.snapshot().scheduledSteps)).toBe(freeze.step);
  await page.evaluate(async()=>{await a.start();});await page.waitForTimeout(150);
  expect(await page.evaluate(()=>a.snapshot().scheduledSteps)).toBeGreaterThan(freeze.step);
  console.log('AUDIO_SCORE',JSON.stringify(played));await page.evaluate(()=>a.dispose());
});
test('bounded stereo FX accepts major events, ducks and rebuilds; nearest hum stops safely',async({page,request})=>{
  await boot(page,request);await page.mouse.click(10,10);
  const result=await page.evaluate(async()=>{
    window.a=new RiftAudio({bpm:480});await a.start();a.update({threat:4,weaponTier:3});
    const accepted=[];for(const name of ['shot','geom','dash','splitter','kill','gravity','bomb','death','upgrade'])accepted.push(a.fx(name,{x:200,tier:3}));
    for(let i=0;i<500;i++){a.fx('shot');a.fx('geom');}
    const danger=a.fx('bomb');await new Promise(r=>setTimeout(r,30));const flood=a.snapshot();
    a.update({threat:4,weaponTier:3,player:{x:600,y:350},enemies:[{type:'blackhole',x:1100,y:350},{type:'blackhole',x:650,y:350}],state:'playing'});
    const hum=a.snapshot();a.setMuted(true);const muted=a.snapshot();a.setMuted(false);
    a.update({player:{x:600,y:350},enemies:[{type:'blackhole',x:650,y:350}],state:'playing',threat:4,weaponTier:3});
    await a.pause();const paused=a.snapshot();await a.start();a.update({enemies:[]});const empty=a.snapshot();
    return {accepted,danger,flood,hum,muted,paused,empty};
  });
  expect(result.accepted.every(Boolean)).toBe(true);expect(result.danger).toBe(true);
  expect(result.flood.voices).toBeLessThanOrEqual(result.flood.voiceLimit);expect(result.flood.droppedFx).toBeGreaterThan(900);
  expect(result.flood.duckGain).toBeLessThan(1);expect(result.hum.hum.x).toBe(650);expect(result.hum.hum.count).toBe(1);
  expect(result.muted.hum.count).toBe(0);expect(result.paused.hum.count).toBe(0);expect(result.empty.hum.count).toBe(0);
  await page.waitForTimeout(550);expect((await page.evaluate(()=>a.snapshot())).arrangement.lead).toBe(false);
  await page.evaluate(()=>a.update({threat:4,weaponTier:3}));await page.waitForTimeout(1100);
  expect((await page.evaluate(()=>a.snapshot())).arrangement.lead).toBe(true);
  await page.evaluate(()=>a.dispose());expect((await page.evaluate(()=>a.snapshot())).voices).toBe(0);
  console.log('AUDIO_FX',JSON.stringify(result));
});
test('pre-start scene, silent SFX and disposal clean up continuous sources and capture',async({page,request})=>{
  await boot(page,request);await page.mouse.click(10,10);
  const result=await page.evaluate(async()=>{
    const a=new RiftAudio();a.update({threat:1,weaponTier:1,state:'playing',player:{x:600,y:350},enemies:[{type:'blackhole',x:650,y:350}]});
    const pre=a.snapshot();await a.start();const started=a.snapshot();a.setVolumes({sfx:0});const silent=a.snapshot();
    a.setVolumes({sfx:.7});const restored=a.snapshot();const track=a.captureStream().getAudioTracks()[0];
    await a.dispose();return {pre,started,silent,restored,end:track.readyState,disposed:a.snapshot(),restart:await a.start()};
  });
  expect(result.pre.contextState).toBe('uninitialized');expect(result.pre.pendingArrangement.layers).toBe(1);
  expect(result.started.hum.count).toBe(1);expect(result.silent.hum.count).toBe(0);expect(result.restored.hum.count).toBe(1);
  expect(result.end).toBe('ended');expect(result.disposed.contextState).toBe('closed');expect(result.restart).toBe(false);
});
test('a pause requested during async start wins over the late resume callback',async({page,request})=>{
 await boot(page,request);await page.mouse.click(10,10);
 const r=await page.evaluate(async()=>{const a=new RiftAudio();const starting=a.start();const pausing=a.pause();await Promise.all([starting,pausing]);const result={paused:a.paused,timer:a.timer,state:a.snapshot().contextState};await a.dispose();return result;});
 expect(r.paused).toBe(true);expect(r.timer).toBeNull();expect(r.state).toBe('suspended');
});

test('pickup notes follow the current chord rather than a fixed unrelated scale',async({page,request})=>{
 await boot(page,request);await page.mouse.click(10,10);
 const notes=await page.evaluate(async()=>{const a=new RiftAudio();await a.start();a.step=32;const frequencies=[];const original=a._tone.bind(a);a._tone=(...args)=>{frequencies.push(args[1]);return original(...args);};a.fx('geom');await a.dispose();return frequencies;});
 // Bar two is F major: the first pickup cycles to its third, A4.
 expect(notes[0]).toBeCloseTo(440,1);expect(notes[1]).toBeCloseTo(880,1);
});

test('gesture lifecycle, independent persistent gains and real capture track', async ({page,request})=>{
  await boot(page,request);
  expect(await page.evaluate(()=>{localStorage.removeItem('rift-runner-audio');window.a=new RiftAudio();return a.snapshot().contextState;})).toBe('uninitialized');
  await page.mouse.click(10,10);
  const result=await page.evaluate(async()=>{
    await a.start();a.setVolumes({music:.27,sfx:.63});a.setMuted(true);
    const targets=a.snapshot().gainTargets; await new Promise(r=>setTimeout(r,60));
    const muted=a.snapshot();const track=a.captureStream().getAudioTracks()[0];
    await a.pause();const paused=a.snapshot();a.setMuted(false);await a.start();
    await new Promise(r=>setTimeout(r,60));
    const active=a.snapshot();const b=new RiftAudio();const saved=b.snapshot();b.dispose();
    await a.dispose();return {muted,paused,active,saved,targets,track:track.kind};
  });
  expect(result.targets).toEqual({music:.27,sfx:.63,master:0});
  expect(result.muted.contextState).toBe('running');expect(result.muted.gains.master).toBe(0);
  expect(result.paused.contextState).toBe('suspended');expect(result.active.contextState).toBe('running');
  expect(result.active.gains.music).toBeCloseTo(.27);expect(result.active.gains.sfx).toBeCloseTo(.63);
  expect(result.saved.settings).toEqual({music:.27,sfx:.63,muted:false});expect(result.track).toBe('audio');
  console.log('AUDIO_LIFECYCLE',JSON.stringify(result));
});
