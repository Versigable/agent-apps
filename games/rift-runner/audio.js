/* RIFT//RUNNER — original procedural score. No assets, dependencies or frame-clock timing. */
(() => {
  'use strict';
  const KEY = 'rift-runner-audio';
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  class RiftAudio {
    constructor(options = {}) {
      this.settings = {music: .55, sfx: .7, muted: false};
      try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) {
        for (const k of ['music','sfx']) if (Number.isFinite(s[k])) this.settings[k] = clamp(s[k]);
        if (typeof s.muted === 'boolean') this.settings.muted = s.muted;
      }} catch (_) { /* Storage may be disabled. */ }
      this.bpm = clamp(Number(options.bpm) || 132, 60, 480);
      this.voiceLimit=48; this.lastFx={}; this.hum=null; this.scene={};
      this.step = 0; this.nextTime = 0; this.timer = null;
      this.arrangement = {layers:1,lead:false}; this.pendingArrangement = {...this.arrangement};
      this.arrangementChanges = []; this.recoveryBars = 0;
      this.options = options; this.ctx = null; this.disposed = false; this.paused = true; this.lifecycle=0;
      this.voices = []; this.droppedFx = 0; this.counters = {started:0,fx:0,musicNotes:0};
    }
    async start() {
      if (this.disposed) return false;
      const request=++this.lifecycle;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try {
          this.ctx = new AC(); const c = this.ctx;
          this.music = c.createGain(); this.sfx = c.createGain(); this.duck = c.createGain();
          this.master = c.createGain(); this.compressor = c.createDynamicsCompressor();
          this.compressor.threshold.value = -16; this.compressor.knee.value = 18;
          this.compressor.ratio.value = 4; this.compressor.attack.value = .004; this.compressor.release.value = .18;
          this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024;
          this.destination = c.createMediaStreamDestination();
          this.music.connect(this.duck); this.duck.connect(this.compressor); this.sfx.connect(this.compressor);
          // Lift the quiet score without changing the saved mixer scale. The final
          // fast compressor protects both playback and capture during stacked FX.
          this.makeup = c.createGain(); this.makeup.gain.value = 3;
          this.limiter = c.createDynamicsCompressor();
          this.limiter.threshold.value = -4; this.limiter.knee.value = 0;
          this.limiter.ratio.value = 20; this.limiter.attack.value = 0; this.limiter.release.value = .1;
          this.compressor.connect(this.master); this.master.connect(this.makeup); this.makeup.connect(this.limiter);
          this.limiter.connect(c.destination); this.limiter.connect(this.destination);
          this.limiter.connect(this.analyser); this._gains();
        } catch (_) { return false; }
      }
      try { await this.ctx.resume(); } catch (_) { return false; }
      if(request!==this.lifecycle || this.disposed)return false;
      this.paused = false; this.counters.started++;
      if (!this.nextTime) this.nextTime=this.ctx.currentTime+.035;
      this._updateHum(); this._schedule(); if (!this.timer) this.timer=setInterval(()=>this._schedule(),25);
      return this.ctx.state === 'running';
    }
    async pause() { this.lifecycle++; clearInterval(this.timer); this.timer=null; this.paused = true; this._stopHum(); if (this.ctx && this.ctx.state !== 'closed') await this.ctx.suspend(); }
    update(scene={}) {
      this.scene={...this.scene,...scene}; const {threat=0,weaponTier=1}=this.scene;
      this.pendingArrangement={layers:threat>=4?3:threat>=2?2:1,lead:weaponTier>=3};
      this._updateHum();
    }
    _schedule() {
      if(this.paused || this.disposed || this.ctx.state!=='running')return;
      const now=this.ctx.currentTime;
      // Catch up without a burst after timer throttling; retain the musical grid.
      if(this.nextTime<now-.1) {const skipped=Math.ceil((now-this.nextTime)/(60/this.bpm/4));this.step+=skipped;this.nextTime+=skipped*60/this.bpm/4;}
      while(this.nextTime<now+.085) {
        if(this.step%16===0) {
          this.arrangement=this.recoveryBars>0?{layers:1,lead:false}:{...this.pendingArrangement};
          if(this.recoveryBars>0)this.recoveryBars--;
          this.arrangementChanges.push({step:this.step,time:this.nextTime,...this.arrangement});
          if(this.arrangementChanges.length>32)this.arrangementChanges.shift();
        }
        this._score(this.step,this.nextTime);this.step++;this.nextTime+=60/this.bpm/4;
      }
    }
    _tone(time,freq,duration,gain,type='sine',pan=0,bus=this.music,endFreq=null,filterHz=0,priority=1) {
      if(!this._room(priority,1))return null;
      const c=this.ctx,o=type==='noise'?c.createBufferSource():c.createOscillator();
      if(type==='noise') {
        if(!this.noise) {this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
        o.buffer=this.noise;o.loop=true;
      } else {o.type=type;o.frequency.setValueAtTime(freq,time);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(10,endFreq),time+duration);}
      const envelope=c.createGain(),stereo=c.createStereoPanner();stereo.pan.setValueAtTime(clamp(pan,-1,1),time);
      envelope.gain.setValueAtTime(.0001,time);envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),time+.006);
      envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
      const nodes=[o,envelope,stereo];
      if(filterHz){const f=c.createBiquadFilter();f.type=type==='noise'?'highpass':'lowpass';f.frequency.value=filterHz;o.connect(f);f.connect(envelope);nodes.push(f);}else o.connect(envelope);
      envelope.connect(stereo);stereo.connect(bus);
      const voice={o,nodes,end:time+duration,priority,stereo};this.voices.push(voice);
      o.onended=()=>{nodes.forEach(n=>n.disconnect());const i=this.voices.indexOf(voice);if(i>=0)this.voices.splice(i,1);};
      o.start(time);o.stop(time+duration+.01);if(bus===this.music)this.counters.musicNotes++;
      return voice;
    }
    _harmony(bar=Math.floor(this.step/16)) {
      const index=Math.floor(bar/2)%4;
      return {root:[45,41,48,43][index],third:index===0?3:4,seventh:[10,11,11,10][index]};
    }
    _score(step,t) {
      const s=step%16,bar=Math.floor(step/16),a=this.arrangement;
      const {root,third,seventh}=this._harmony(bar),hz=n=>440*2**((n-69)/12);
      if([0,6,10].includes(s)||(bar%2 && s===14))this._tone(t,135,.19,.32,'sine',0,this.music,42);
      if(s===4||s===12){this._tone(t,180,.13,.10,'triangle');this._tone(t,0,.14,.12,'noise',.08,this.music,null,1500);}
      if(s%2===0 || a.layers>=2)this._tone(t,0,s===14?.10:.035,s%4===0?.035:.021,'noise',s%4===0?-.35:.35,this.music,null,6500);
      if([0,3,6,8,10,14].includes(s))this._tone(t,hz(root+(s===14?7:0)),.16,.065,'square',-.1,this.music,null,550);
      if(a.layers>=2 && s%2===0) {const motif=[0,7,12,12+third,12,7,seventh,7];this._tone(t,hz(root+12+motif[(s/2+bar%2)%8]),.18,.043,'triangle',s%4?-.48:.48);}
      if(a.layers>=3 && (s===7||s===15))this._tone(t,0,.06,.05,'noise',-.55,this.music,null,2100);
      if(a.lead && [1,5,8,11,14].includes(s)) {const notes=[19,12+third,12,seventh,7];this._tone(t,hz(root+12+notes[([1,5,8,11,14].indexOf(s)+bar)%5]),.22,.036,'sawtooth',.22,this.music,null,1900);}
    }
    _stopVoice(v) {
      try{v.o.stop();}catch(_){} v.nodes.forEach(n=>n.disconnect());
      const i=this.voices.indexOf(v);if(i>=0)this.voices.splice(i,1);
    }
    _room(priority,count) {
      // Reserve headroom for the score and warnings; 47 transient sources + one well.
      if(priority===0 && this.voices.filter(v=>v.priority===0).length+count>16)return false;
      while(this.voices.length+count>this.voiceLimit-1) {
        const candidates=this.voices.filter(v=>v.priority<priority || (priority>=3 && v.priority===priority));
        candidates.sort((a,b)=>a.priority-b.priority||a.end-b.end);
        if(!candidates.length)return false;this._stopVoice(candidates[0]);
      }
      return true;
    }
    _duckMusic(level,hold) {
      const t=this.ctx.currentTime,p=this.duck.gain;
      p.cancelScheduledValues(t);p.setValueAtTime(level,t);p.setValueAtTime(level,t+hold);p.linearRampToValueAtTime(1,t+hold+.65);
    }
    fx(name,{x=600,tier=1}={}) {
      if(!this.ctx || this.disposed || this.paused || this.settings.muted || this.ctx.state!=='running')return false;
      const priorities={shot:0,geom:0,kill:1,dash:2,splitter:2,gravity:3,bomb:4,death:4,upgrade:3};
      if(!(name in priorities))return false;
      const t=this.ctx.currentTime+.004,priority=priorities[name],cooldown=name==='geom'?.045:name==='shot'?.035:name==='kill'?.025:0;
      if((this.lastFx[name]!==undefined && t-this.lastFx[name]<cooldown)||!this._room(priority,6)){this.droppedFx++;return false;}
      this.lastFx[name]=t;this.counters.fx++;const pan=clamp((Number.isFinite(x)?x:600)/600-1,-.85,.85);tier=clamp(Number(tier)||1,1,5);
      const tone=(f,d,g,type='sine',offset=0,p=pan,end=null,filter=0)=>this._tone(t+offset,f,d,g,type,p,this.sfx,end,filter,priority);
      if(name==='shot') {
        tone(700+tier*140,.09,.065,'sawtooth',0,pan,110,2200);
        if(tier>=2)tone(230,.10,.05,'triangle',0,clamp(pan-.25,-1,1),65);
        if(tier>=3)tone(1100,.075,.037,'square',.008,clamp(pan+.25,-1,1),240,3000);
      } else if(name==='geom') {
        const {root,third}=this._harmony();
        const note=root+24+[0,third,7,12][this.counters.fx%4],f=440*2**((note-69)/12);
        tone(f,.18,.052,'sine');tone(f*2,.23,.027,'sine',.012,-pan);
      } else if(name==='dash') {
        const v=tone(220,.25,.09,'sawtooth',0,-.85,880,1400);
        if(v)v.stereo.pan.linearRampToValueAtTime(.85,t+.25);
        tone(0,.18,.05,'noise',0,pan,null,3500);
      } else if(name==='splitter') {
        [980,1470,2058,2940].forEach((f,i)=>tone(f,.30+i*.045,.034,'sine',i*.012,clamp(pan+(i-1.5)*.2,-1,1),f*.72));
      } else if(name==='kill') {
        tone(190,.15,.065,'triangle',0,pan,55);tone(0,.09,.035,'noise',0,pan,null,1800);
      } else if(name==='gravity') {
        tone(90,.55,.12,'sine',0,pan,36);tone(135,.45,.025,'triangle',.03,-pan,54);
      } else if(name==='bomb') {
        this._duckMusic(.22,.38);
        const v=tone(65,.19,.13,'sawtooth',0,pan,650,1100);if(v)v.stereo.pan.linearRampToValueAtTime(0,t+.19);
        tone(145,.6,.3,'sine',.19,0,28);tone(0,.32,.14,'noise',.19,0,null,700);
        tone(220,.8,.045,'triangle',.26,-.65,55);tone(330,.95,.035,'sine',.29,.65,82.5);
      } else if(name==='death') {
        this.recoveryBars=2;this._duckMusic(.12,.55);
        tone(440,.55,.12,'sawtooth',0,pan,38,950);tone(0,.38,.09,'noise',.02,-pan,null,650);
        tone(55,.85,.14,'sine',.04,0,27.5);
      } else if(name==='upgrade') {
        const {root,third}=this._harmony();
        [0,third,7,12].forEach((n,i)=>tone(440*2**((root+24+n-69)/12),.32,.065,'triangle',i*.065,i%2?.4:-.4));
      }
      return true;
    }
    _stopHum() {
      if(!this.hum)return;try{this.hum.o.stop();}catch(_){}this.hum.nodes.forEach(n=>n.disconnect());this.hum=null;
    }
    _updateHum() {
      const {player={x:600,y:350},enemies=[],state}=this.scene;
      if(!this.ctx || this.disposed || this.paused || this.settings.muted || this.settings.sfx===0 || (state && state!=='playing')){this._stopHum();return;}
      let nearest=null,distance=Infinity;
      for(const e of enemies)if(e.type==='blackhole') {const d=Math.hypot(e.x-player.x,e.y-player.y);if(d<distance){nearest=e;distance=d;}}
      if(!nearest || distance>700){this._stopHum();return;}
      const c=this.ctx,t=c.currentTime;
      if(!this.hum) {
        const o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner();o.type='sine';o.frequency.value=43;g.gain.value=0;
        o.connect(g);g.connect(p);p.connect(this.sfx);o.start();this.hum={o,g,p,nodes:[o,g,p],x:nearest.x};
      }
      this.hum.x=nearest.x;this.hum.g.gain.setTargetAtTime(.055*(1-distance/700),t,.07);
      this.hum.p.pan.setTargetAtTime(clamp((nearest.x-player.x)/500,-.9,.9),t,.07);
      this.hum.o.frequency.setTargetAtTime(39+10*(1-distance/700),t,.1);
    }
    _gains() {
      if (!this.ctx) return;
      const t=this.ctx.currentTime;
      for(const [node,value] of [[this.music,this.settings.music],[this.sfx,this.settings.sfx],[this.master,this.settings.muted?0:.72]]) {
        const p=node.gain;
        if(!this.gainsInitialized) p.setValueAtTime(value,t);
        else {
          // Hold an interrupted ramp at its current value before retargeting.
          const current=p.value;
          if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(t);
          else p.cancelScheduledValues(t);
          p.setValueAtTime(current,t);
          p.linearRampToValueAtTime(value,t+.02);
        }
      }
      this.gainsInitialized=true;
    }
    _save() { try {localStorage.setItem(KEY,JSON.stringify(this.settings));} catch (_) {} this._gains(); }
    setVolumes(values={}) { for(const k of ['music','sfx']) if(Number.isFinite(values[k])) this.settings[k]=clamp(values[k]); this._save(); this._updateHum(); }
    setMuted(value) { this.settings.muted=!!value; this._save(); if(this.settings.muted)this._stopHum();else this._updateHum(); }
    captureStream() { return this.destination ? this.destination.stream : null; }
    snapshot() { const samples=new Float32Array(1024); if(this.analyser)this.analyser.getFloatTimeDomainData(samples); const energy=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length); return {energy,voiceLimit:this.voiceLimit,hum:{count:this.hum?1:0,x:this.hum?this.hum.x:null},duckGain:this.duck?this.duck.gain.value:1,recoveryBars:this.recoveryBars,bars:Math.floor(this.step/16),scheduledSteps:this.step,arrangement:{...this.arrangement},pendingArrangement:{...this.pendingArrangement},arrangementChanges:this.arrangementChanges.slice(),contextState:this.ctx?this.ctx.state:'uninitialized',settings:{...this.settings},voices:this.voices.length+(this.hum?1:0),droppedFx:this.droppedFx,counters:{...this.counters},gains:this.ctx?{music:this.music.gain.value,sfx:this.sfx.gain.value,master:this.master.gain.value}:null,gainTargets:{music:this.settings.music,sfx:this.settings.sfx,master:this.settings.muted?0:.72}}; }
    async dispose() {this.lifecycle++;clearInterval(this.timer);this.timer=null;this.disposed=true;this.paused=true;this._stopHum();for(const v of [...this.voices])this._stopVoice(v);if(this.destination)this.destination.stream.getTracks().forEach(t=>t.stop());if(this.ctx && this.ctx.state!=='closed')await this.ctx.close();}
  }
  window.RiftAudio = RiftAudio;
})();
