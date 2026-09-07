(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    root = $("#game-root"),
    canvas = $("#arena"),
    ctx = canvas.getContext("2d"),
    overlay = $("#overlay");
  const W = 1200,
    H = 700,
    CYAN = "#67f8ea",
    CORAL = "#ff697b",
    keys = new Set();
  let lives = 3,
    bombs = 3,
    best = 0,
    bombsUsed = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem("rift-runner-best")) || 0);
  } catch {}
  const audio = window.RiftAudio ? new window.RiftAudio() : null;
  window.riftAudio = audio;
  let muted = audio?.snapshot().settings.muted || false, audioEvents = 0;
  let state = "title",
    player,
    enemies = [],
    bullets = [],
    particles = [],
    trails = [],
    shots = 0,
    kills = 0,
    dashes = 0,
    dashKills = 0,
    trailHits = 0,
    score = 0,
    wave = 1,
    last = 0,
    time = 0,
    shake = 0,
    shotTimer = 0,
    enemyShots = [],
    banner = 0,
    mouse = { x: 900, y: 350, down: false },
    seed = 73;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function resetPlayer() {
    player = {
      x: 600,
      y: 350,
      hp: 3,
      maxHp: 3,
      speed: 260,
      damage: 20,
      fireRate: 0.16,
      dash: 0,
      cooldown: 0,
      invuln: 0,
      angle: 0,
      dx: 1,
      dy: 0,
    };
  }
  resetPlayer();
  function sync() {
    for (const [id, value] of Object.entries({
      multiplier: "×" + multiplier,
      geoms: collected,
      weapon: "T" + weaponTier,
      bombs,
      best: String(best).padStart(6, "0"),
    })) {
      const el = $("#" + id);
      if (el) el.textContent = value;
    }
    Object.assign(root.dataset, {
      state,
      lives,
      bombs,
      best,
      multiplier,
      collected,
      weaponTier,
      muted,
      audioEvents,
      shotsFired: shots,
      enemyCount: enemies.length,
      kills,
      dashes,
      dashKills,
      trailHits,
      wave,
      score,
      health: Math.ceil(player.hp),
    });
    $("#health").textContent = Math.ceil(player.hp);
    $("#health-bar").style.width = `${(player.hp / player.maxHp) * 100}%`;
    $("#wave").textContent = String(wave).padStart(2, "0");
    $("#score").textContent = String(score).padStart(6, "0");
    $("#status").textContent =
      state === "playing"
        ? "SIGNAL LIVE / " + enemies.length + " HOSTILES"
        : state.toUpperCase();
    $("#dash-status").textContent =
      player.cooldown > 0
        ? `PHASE DRIVE / ${player.cooldown.toFixed(1)}s`
        : "PHASE DRIVE / READY";
  }
  function spawn(x, y, type = "chaser") {
    const hp =
      type === "blackhole"
        ? 150
        : type === "splitter"
          ? 65
          : type === "mini"
            ? 15
            : 30;
    const e = {
      x,
      y,
      type,
      hp,
      maxHp: hp,
      r:
        type === "blackhole"
          ? 25
          : type === "splitter"
            ? 21
            : type === "mini"
              ? 9
              : 15,
      speed:
        type === "blackhole"
          ? 14
          : type === "mini"
            ? 160
            : 75 + Math.min(100, wave * 5),
      age: 0,
      spawnIn: 0,
    };
    if (enemies.length < 120) enemies.push(e);
    return e;
  }
  // Only called at run start; the director owns all later arrivals.
  function beginWave() {
    player.invuln = 1.5;
    banner = 2.5;
    $('#announcement').textContent = 'THREAT 01 // COLLECT GEOMS. KEEP MOVING.';
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const e = spawn(600 + Math.cos(a) * 470, 350 + Math.sin(a) * 270, i % 3 === 1 ? 'weaver' : 'chaser');
      e.spawnIn = .8 + i * .08;
      spawned++;
    }
  }
  function start() {
    keys.clear();
    mouse.down = false;
    resetPlayer();
    enemies = [];
    bullets = [];
    particles = [];
    trails = [];
    shots = kills = dashes = dashKills = trailHits = score = 0;
    wave = 1;
    time = 0;
    spawned = 0;
    spawnTimer = 1.5;
    collected = 0;
    multiplier = 1;
    weaponTier = 1;
    lives = 3;
    bombs = 3;
    bombsUsed = 0;
    geoms = [];
    shockwaves = [];
    shotTimer = 0;
    seed = 73;
    state = "playing";
    overlay.hidden = true;
    beginWave();
    updateAudio();
    initAudio();
    sync();
  }
  function initAudio() {
    if (audio) Promise.resolve(audio.start()).catch(() => {});
  }
  function updateAudio() {
    audio?.update({threat:wave,weaponTier,player,enemies,state});
  }
  function sound(name, x = player.x) {
    if (!muted && audio?.fx(name,{x,tier:weaponTier})) audioEvents++;
  }
  function refreshAudioControls() {
    const settings=audio?.snapshot().settings || {music:.5,sfx:.7,muted:false};
    for(const name of ['music','sfx']) {
      const input=document.querySelector('#'+name+'-volume');
      if(input) input.value=settings[name];
      const output=document.querySelector('#'+name+'-value');
      if(output) output.textContent=Math.round(settings[name]*100)+'%';
    }
    $('#mute').textContent=muted?'M · SOUND OFF':'M · SOUND ON';
    $('#mute').setAttribute('aria-label',muted?'Unmute audio':'Mute audio');
  }
  function toggleMute() {
    muted = !muted;
    audio?.setMuted(muted);
    $("#mute").textContent = muted ? "M · SOUND OFF" : "M · SOUND ON";
    $("#mute").setAttribute(
      "aria-label",
      muted ? "Unmute audio" : "Mute audio",
    );
    sync();
  }
  function pause() {
    if (state === "playing") {
      state = "paused";
      audio?.pause();
      keys.clear();
      mouse.down = false;
      overlay.hidden = false;
      overlay.innerHTML =
        '<p class="eyebrow">SIGNAL HELD</p><h2>TAKE A BREATH.</h2><p class="intro">The breach can wait.</p><button class="primary" id="resume">Resume run ↗</button>';
      $("#resume").onclick = pause;
    } else if (state === "paused") {
      state = "playing";
      overlay.hidden = true;
      keys.clear();
      updateAudio();
      initAudio();
    }
    sync();
  }
  function hurt(damage) {
    if (state !== "playing" || player.invuln > 0) return;
    lives = Math.max(0, lives - 1);
    player.hp = lives;
    multiplier = 1;
    player.invuln = 2.5;
    player.dash = 0;
    enemies = enemies.filter(
      (e) => Math.hypot(e.x - player.x, e.y - player.y) > 190,
    );
    enemyShots = enemyShots.filter(
      (e) => Math.hypot(e.x - player.x, e.y - player.y) > 240,
    );
    shockwaves.push({
      x: player.x,
      y: player.y,
      life: 0.7,
      max: 0.7,
      radius: 190,
      color: CYAN,
    });
    shake = 12;
    burst(player.x, player.y, CORAL, 25);
    sound("death");
    if (!player.hp) {
      best = Math.max(best, score);
      try {
        localStorage.setItem("rift-runner-best", String(best));
      } catch {}
      state = "gameover";
      setTimeout(()=>{if(state==='gameover') audio?.pause();},900);
      keys.clear();
      mouse.down = false;
      overlay.hidden = false;
      $("#announcement").textContent = "";
      overlay.innerHTML = `<p class="eyebrow">CONNECTION LOST / WAVE ${wave}</p><h2>NOT YOUR LAST RUN.</h2><p class="intro">${String(score).padStart(6, "0")} sync score · ${kills} hostiles erased<br>The rift remembers. Go again.</p><button class="primary" id="restart">Restart run ↗</button>`;
      $("#restart").onclick = start;
    }
    sync();
  }
  function burst(x, y, color, n = 16) {
    for (let i = 0; i < n; i++) {
      let a = rand() * Math.PI * 2,
        v = 40 + rand() * 210;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.3 + rand() * 0.5,
        max: 0.8,
        color,
      });
    }
    if (particles.length > 550) particles.splice(0, particles.length - 550);
  }
  function hit(e, damage, dash = false) {
    if (e.hp <= 0) return;
    e.hp -= damage;
    burst(e.x, e.y, dash ? CYAN : CORAL, 5);
    if (e.hp <= 0) {
      if (e.type === "splitter")
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3;
          spawn(e.x + Math.cos(a) * 25, e.y + Math.sin(a) * 25, "mini");
        }
      if (e.type === "blackhole") {
        shockwaves.push({
          x: e.x,
          y: e.y,
          life: 0.65,
          max: 0.65,
          radius: 190,
          color: "#b890ff",
        });
        for (const other of [...enemies])
          if (
            other !== e &&
            other.hp > 0 &&
            Math.hypot(other.x - e.x, other.y - e.y) < 190
          )
            hit(other, 90);
        enemyShots = enemyShots.filter(
          (b) => Math.hypot(b.x - e.x, b.y - e.y) > 190,
        );
      }
      kills++;
      score += 100 * multiplier;
      for (let i = 0; i < 3; i++)
        geoms.push({ x: e.x + (i - 1) * 8, y: e.y, life: 18 });
      if (geoms.length > 450) geoms.splice(0, geoms.length - 450);
      sound(e.type === "blackhole" ? "gravity" : e.type === "splitter" ? "splitter" : "kill", e.x);
      if (dash) dashKills++;
      burst(e.x, e.y, CORAL, 22);
      shake = 4;
    }
  }
  function bomb() {
    if (state !== "playing" || bombs <= 0) return;
    bombs--;
    bombsUsed++;
    enemies = [];
    bullets = [];
    enemyShots = [];
    spawnTimer = Math.max(spawnTimer, 1);
    shake = 20;
    shockwaves.push({
      x: player.x,
      y: player.y,
      life: 1,
      max: 1,
      radius: 1300,
      color: CYAN,
    });
    burst(player.x, player.y, CYAN, 70);
    sound("bomb");
    sync();
  }
  function dash() {
    if (state !== "playing" || player.cooldown > 0) return;
    let x =
        +(keys.has("d") || keys.has("arrowright")) -
        +(keys.has("a") || keys.has("arrowleft")),
      y =
        +(keys.has("s") || keys.has("arrowdown")) -
        +(keys.has("w") || keys.has("arrowup"));
    let n = Math.hypot(x, y);
    player.dx = n ? x / n : Math.cos(player.angle);
    player.dy = n ? y / n : Math.sin(player.angle);
    player.dash = 0.2;
    player.cooldown = 2.2;
    player.invuln = 0.3;
    dashes++;
    sound("dash");
    burst(player.x, player.y, CYAN);
  }
  function shoot() {
    let a = player.angle;
    if (keys.has("f") && enemies.length) {
      let target = enemies.reduce((a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) <
        Math.hypot(b.x - player.x, b.y - player.y)
          ? a
          : b,
      );
      a = Math.atan2(target.y - player.y, target.x - player.x);
      player.angle = a;
    }
    for (let i = 0; i < weaponTier * 2 - 1; i++) {
      let angle = a + (i - (weaponTier - 1)) * 0.11;
      bullets.push({
        x: player.x + Math.cos(angle) * 20,
        y: player.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * 800,
        vy: Math.sin(angle) * 800,
        life: 1.6,
      });
    }
    shots++;
    sound("shot");
    burst(player.x + Math.cos(a) * 21, player.y + Math.sin(a) * 21, CYAN, 2);
  }
  function phaseHit(e, id, trail = false) {
    if (e.lastDash === id) return;
    e.lastDash = id;
    if (trail) trailHits++;
    hit(e, 100, true);
  }
  let spawned = 0,
    spawnTimer = 0,
    geoms = [],
    collected = 0,
    multiplier = 1,
    weaponTier = 1,
    shockwaves = [];
  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - dt * 25);
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const s of shockwaves) s.life -= dt;
    shockwaves = shockwaves.filter((s) => s.life > 0);
    for (const g of geoms) {
      g.life -= dt;
      let dx = player.x - g.x,
        dy = player.y - g.y,
        d = Math.hypot(dx, dy);
      if (d < 150 && d > 0) {
        const move = Math.min(d, dt * (170 + (150 - d) * 3));
        g.x += (dx / d) * move;
        g.y += (dy / d) * move;
      }
      if (Math.hypot(player.x - g.x, player.y - g.y) < 22) {
        g.life = 0;
        collected++;
        multiplier++;
        const previousTier = weaponTier;
        weaponTier =
          collected >= 60 ? 4 : collected >= 30 ? 3 : collected >= 10 ? 2 : 1;
        sound("geom", g.x);
        if (weaponTier > previousTier) sound("upgrade");
      }
    }
    geoms = geoms.filter((g) => g.life > 0);
    wave = 1 + Math.floor(time / 15);
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < 100) {
      const a = rand() * Math.PI * 2;
      const types = wave >= 3
        ? ["chaser", "chaser", "weaver", "splitter", "chaser", "weaver", "splitter", "blackhole"]
        : wave >= 2 ? ["chaser", "weaver", "chaser", "splitter"] : ["chaser", "chaser", "weaver"];
      const pack = time < 5 ? 1 : Math.min(6, 2 + Math.floor(wave / 2));
      for (let i = 0; i < pack && enemies.length < 100; i++) {
        const angle = a + i * 0.16;
        const e = spawn(600 + Math.cos(angle) * 540, 350 + Math.sin(angle) * 290,
          types[spawned % types.length]);
        e.spawnIn = 0.7 + i * 0.06;
        spawned++;
      }
      spawnTimer = Math.max(0.45, 1.5 - time * 0.025);
    }
    banner -= dt;
    if (banner <= 0) $("#announcement").textContent = "";
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    shotTimer -= dt;
    let x =
        +(keys.has("d") || keys.has("arrowright")) -
        +(keys.has("a") || keys.has("arrowleft")),
      y =
        +(keys.has("s") || keys.has("arrowdown")) -
        +(keys.has("w") || keys.has("arrowup"));
    const n = Math.hypot(x, y);
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    if (player.dash > 0) {
      player.dash -= dt;
      player.x += player.dx * 1000 * dt;
      player.y += player.dy * 1000 * dt;
      trails.push({
        x: player.x,
        y: player.y,
        angle: player.angle,
        life: 0.4,
        id: dashes,
      });
    } else if (n) {
      player.x += (x / n) * player.speed * dt;
      player.y += (y / n) * player.speed * dt;
    }
    player.x = clamp(player.x, 30, W - 30);
    player.y = clamp(player.y, 30, H - 30);
    if ((keys.has("f") || mouse.down) && shotTimer <= 0) {
      shoot();
      shotTimer = player.fireRate;
    }
    for (const e of [...enemies]) {
      if (e.hp <= 0) continue;
      e.age += dt;
      e.spawnIn = Math.max(0, e.spawnIn - dt);
      if (e.spawnIn > 0) continue;
      let a = Math.atan2(player.y - e.y, player.x - e.x);
      let dist = Math.hypot(player.x - e.x, player.y - e.y);
      if (e.type === "weaver") {
        const threat = bullets.find(
          (b) =>
            Math.hypot(b.x - e.x, b.y - e.y) < 160 &&
            b.vx * (e.x - b.x) + b.vy * (e.y - b.y) > 0,
        );
        if (threat) {
          const n = Math.hypot(threat.vx, threat.vy) || 1;
          e.x -= (threat.vy / n) * 240 * dt;
          e.y += (threat.vx / n) * 240 * dt;
        }
      }
      if (
        e.type === "blackhole" &&
        dist < 280 &&
        dist > 1 &&
        player.dash <= 0
      ) {
        player.x -= Math.cos(a) * 85 * dt;
        player.y -= Math.sin(a) * 85 * dt;
        for (const b of bullets) {
          let dx = e.x - b.x,
            dy = e.y - b.y,
            d = Math.hypot(dx, dy);
          if (d < 230 && d > 1) {
            b.vx += (dx / d) * 450 * dt;
            b.vy += (dy / d) * 450 * dt;
          }
        }
      }
      if (e.type !== "shooter" || dist > 270) {
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
      }
      e.x = clamp(e.x, 20 + e.r, W - 20 - e.r);
      e.y = clamp(e.y, 20 + e.r, H - 20 - e.r);
      if (e.type === "boss" || e.type === "shooter") {
        e.timer -= dt;
        if (e.timer <= 0) {
          let count = e.type === "boss" ? 14 : 1;
          for (let j = 0; j < count; j++) {
            let angle =
              count === 1 ? a : (j / count) * Math.PI * 2 + e.age * 0.2;
            enemyShots.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(angle) * 180,
              vy: Math.sin(angle) * 180,
              life: 6,
            });
          }
          e.timer = e.type === "boss" ? 1.6 : 2.7;
        }
      }
      if (
        player.dash > 0 &&
        Math.hypot(e.x - player.x, e.y - player.y) < e.r + 26
      )
        phaseHit(e, dashes);
      else if (
        e.hp > 0 &&
        Math.hypot(e.x - player.x, e.y - player.y) < e.r + 13
      )
        hurt(e.type === "boss" ? 30 : 18);
    }
    for (const t of trails) {
      t.life -= dt;
      if (t.life > 0)
        for (const e of enemies)
          if (e.hp > 0 && Math.hypot(t.x - e.x, t.y - e.y) < e.r + 19)
            phaseHit(e, t.id, true);
    }
    trails = trails.filter((t) => t.life > 0);
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of enemies)
        if (e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 5) {
          hit(e, player.damage);
          b.life = 0;
          break;
        }
    }
    bullets = bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30).slice(-350);
    enemies = enemies.filter((e) => e.hp > 0);
    for (const b of enemyShots) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (Math.hypot(b.x - player.x, b.y - player.y) < 18) {
        hurt(14);
        b.life = 0;
      }
    }
    enemyShots = enemyShots.filter((b) => b.life > 0);
    sync();
  }
  function polygon(x, y, r, sides, angle, color, fill = "#152b38") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      let a = (i / sides) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }
  function draw(dt) {
    if (window.RiftRenderer) {
      window.RiftRenderer.draw(
        ctx,
        {
          W,
          H,
          state,
          time,
          player,
          enemies,
          bullets,
          enemyShots,
          particles,
          trails,
          geoms,
          shockwaves,
          score,
          multiplier,
          weaponTier,
          shake,
        },
        dt,
      );
      return;
    }
    ctx.fillStyle = "#07111f";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate((rand() - 0.5) * shake, (rand() - 0.5) * shake);
    ctx.strokeStyle = "#112a3a";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#235061";
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.setLineDash([4, 10]);
    ctx.beginPath();
    ctx.arc(600, 350, 180, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#173345";
    ctx.beginPath();
    ctx.arc(600, 350, 240, 0, 7);
    ctx.stroke();
    ctx.fillStyle = "#163545";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("R I F T   C O N T A I N M E N T   Z O N E", 600, 620);
    for (const [x, y] of [
      [50, 50],
      [1150, 50],
      [50, 650],
      [1150, 650],
    ]) {
      polygon(x, y, 10, 4, time * 0.15, CYAN);
      ctx.fillStyle = "#30576b";
      ctx.fillRect(x - 2, y - 25, 4, 8);
      ctx.fillRect(x - 2, y + 18, 4, 8);
    }
    for (const t of trails) {
      ctx.globalAlpha = Math.max(0, t.life / 0.4) * 0.5;
      polygon(t.x, t.y, 17, 3, t.angle, CYAN);
    }
    ctx.globalAlpha = 1;
    for (const e of enemies) {
      polygon(
        e.x,
        e.y,
        e.r,
        e.type === "boss" ? 6 : e.type === "shooter" ? 3 : 4,
        e.age * 0.8,
        e.type === "shooter" ? "#ffbd7a" : CORAL,
      );
      if (e.type === "boss") {
        polygon(e.x, e.y, e.r + 12, 6, -e.age * 0.6, CORAL);
        ctx.fillStyle = "#3b2436";
        ctx.fillRect(400, 55, 400, 6);
        ctx.fillStyle = CORAL;
        ctx.fillRect(400, 55, (400 * e.hp) / e.maxHp, 6);
        ctx.font = "11px monospace";
        ctx.fillText("THE GATEKEEPER // " + Math.ceil(e.hp), 600, 45);
      }
      ctx.fillStyle = CORAL;
      ctx.fillRect(e.x - 3, e.y - 3, 6, 6);
    }
    for (const b of enemyShots) {
      ctx.fillStyle = CORAL;
      ctx.shadowColor = CORAL;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, 7);
      ctx.fill();
    }
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    for (const b of bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    for (const g of geoms) polygon(g.x, g.y, 5, 4, Math.PI / 4, CYAN);
    if (player.invuln <= 0 || Math.sin(time * 60) > 0)
      polygon(player.x, player.y, 18, 3, player.angle, CYAN, "#123845");
    ctx.beginPath();
    ctx.arc(
      player.x,
      player.y,
      26,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (1 - player.cooldown / 2.2),
    );
    ctx.strokeStyle = "#67f8ea50";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  function frame(now) {
    let dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    if (state === "playing") {update(dt);updateAudio();}
    draw(dt);
    requestAnimationFrame(frame);
  }
  $("#start").onclick = start;
  addEventListener("keydown", (e) => {
    if(e.target instanceof HTMLInputElement) return;
    keys.add(e.key.toLowerCase());
    if (
      [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
    )
      e.preventDefault();
    if (e.key === " " && !e.repeat) dash();
    if ((e.code === "KeyB" || e.key.toLowerCase() === "b") && !e.repeat) bomb();
    if (e.key.toLowerCase() === "p" && !e.repeat) pause();
    if (e.key.toLowerCase() === "m" && !e.repeat) toggleMute();
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("pointermove", (e) => {
    let r = canvas.getBoundingClientRect();
    if (getComputedStyle(canvas).objectFit === "contain") {
      const scale = Math.min(r.width / W, r.height / H);
      mouse.x = (e.clientX - r.left - (r.width - W * scale) / 2) / scale;
      mouse.y = (e.clientY - r.top - (r.height - H * scale) / 2) / scale;
    } else {
      mouse.x = ((e.clientX - r.left) / r.width) * W;
      mouse.y = ((e.clientY - r.top) / r.height) * H;
    }
  });
  canvas.addEventListener("pointerdown", () => (mouse.down = true));
  addEventListener("pointerup", () => (mouse.down = false));
  document.querySelectorAll("[data-key]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {}
      keys.add(b.dataset.key);
      if (b.dataset.key === " ") dash();
      if (b.dataset.key === "b") bomb();
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(event, () => keys.delete(b.dataset.key));
  });
  $("#pause").onclick = pause;
  $("#mute").onclick = toggleMute;
  addEventListener("blur", () => {
    keys.clear();
    mouse.down = false;
    if (state === "playing") pause();
  });
  document.addEventListener("visibilitychange",()=>{if(document.hidden && state==='playing') pause();});
  for(const name of ['music','sfx']) {
    document.querySelector('#'+name+'-volume')?.addEventListener('input',e=>{audio?.setVolumes({[name]:Number(e.target.value)});refreshAudioControls();});
  }
  refreshAudioControls();
  window.__gameTest = {
    probeEffects() {
      enemies = [];
      bullets = [];
      geoms = [];
      spawnTimer = 99;
      particles = [];
      shockwaves = [];
      burst(100, 100, CYAN);
      shockwaves.push({ x: 100, y: 100, life: 0.5, max: 0.5 });
      const before = particles.length + shockwaves.length;
      let rendererCalls = 0;
      const original = window.RiftRenderer;
      window.RiftRenderer = {
        draw() {
          rendererCalls++;
        },
      };
      draw(0);
      for (let i = 0; i < 120; i++) update(1 / 120);
      draw(0);
      window.RiftRenderer = original;
      return {
        before,
        after: particles.length + shockwaves.length,
        rendererCalls,
      };
    },
    setupCollision() {
      enemies = [];
      player.invuln = 0;
      const e = spawn(player.x, player.y);
      e.speed = 0;
      update(1 / 120);
      sync();
    },
    probeEnemies() {
      enemies = [];
      bullets = [];
      spawnTimer = 99;
      player.x = 600;
      player.y = 350;
      player.invuln = 10;
      const c = spawn(900, 350),
        chaserDistanceBefore = 300;
      update(0.1);
      const chaserDistanceAfter = Math.hypot(c.x - player.x, c.y - player.y);
      enemies = [];
      const w = spawn(800, 350, "weaver");
      bullets = [{ x: 700, y: 350, vx: 800, vy: 0, life: 1 }];
      update(0.05);
      const dodgeY = w.y - 350;
      enemies = [];
      bullets = [];
      hit(spawn(950, 350, "splitter"), 999);
      const minis = enemies.filter((e) => e.type === "mini").length;
      enemies = [];
      const hole = spawn(800, 350, "blackhole");
      hole.speed = 0;
      const gravityDistanceBefore = 200;
      update(0.1);
      const gravityDistanceAfter = Math.hypot(
        hole.x - player.x,
        hole.y - player.y,
      );
      const target = spawn(850, 350);
      target.hp = 300;
      hit(hole, 999);
      const explosionDamage = 300 - target.hp;
      enemies = [];
      const edge = spawn(900, H - 36, "weaver");
      edge.speed = 0;
      bullets = [{x:800,y:H-36,vx:800,vy:0,life:1}];
      update(0.1);
      return {
        edgeInside: edge.y <= H - 20 - edge.r && edge.x >= 20 + edge.r,
        chaserDistanceBefore,
        chaserDistanceAfter,
        dodgeY,
        minis,
        gravityDistanceBefore,
        gravityDistanceAfter,
        explosionDamage,
        shockwaves: shockwaves.length,
      };
    },
    probeProgression() {
      enemies = [];
      geoms = [];
      spawnTimer = 99;
      player.x = 600;
      player.y = 350;
      const e = spawn(700, 350);
      hit(e, 999);
      const dropCount = geoms.length,
        originalDistance = Math.hypot(
          geoms[0].x - player.x,
          geoms[0].y - player.y,
        );
      update(0.1);
      const attractedDistance = Math.hypot(
        geoms[0].x - player.x,
        geoms[0].y - player.y,
      );
      for (let i = 0; i < 4; i++) hit(spawn(player.x, player.y), 999);
      for (let i = 0; i < 120; i++) update(1 / 120);
      bullets = [];
      shoot();
      const projectiles = bullets.length,
        spread =
          Math.max(...bullets.map((b) => b.vy)) -
          Math.min(...bullets.map((b) => b.vy)),
        before = score;
      hit(spawn(100, 100), 999);
      return {
        dropCount,
        originalDistance,
        attractedDistance,
        collected,
        multiplier,
        weaponTier,
        projectiles,
        spread,
        killScore: score - before,
      };
    },
    step(seconds, options = {}) {
      if (options.invulnerable && state === "playing") player.invuln = seconds + 1;
      for (let t = 0; t < seconds; t += 1 / 120)
        if (state === "playing") update(Math.min(1 / 120, seconds - t));
    },
    snapshot: () => ({
      particles: particles.map((p) => ({ ...p })),
      trails: trails.map((t) => ({ ...t })),
      shockwaves: shockwaves.map((s) => ({ ...s })),
      lives,
      bombs,
      bombsUsed,
      best,
      time,
      bullets: bullets.map((b) => ({ ...b })),
      enemyShots: enemyShots.map((b) => ({ ...b })),
      spawned,
      collected,
      multiplier,
      weaponTier,
      geoms: geoms.map((g) => ({ ...g })),
      state,
      mouse: { ...mouse },
      player: { ...player },
      shots,
      kills,
      dashes,
      dashKills,
      trailHits,
      wave,
      score,
      muted,
      audioEvents,
      enemies: enemies.map((e) => ({ ...e })),
    }),
    clearWave() {
      for (const e of enemies) hit(e, 99999);
      enemies = [];
      sync();
    },
    probeAfterimage() {
      enemies = [];
      bullets = [];
      enemyShots = [];
      trails = [];
      keys.clear();
      player.x = 600;
      player.y = 350;
      player.angle = 0;
      player.cooldown = 0;
      spawn(50, 50).speed = 0;
      dash();
      for (let i = 0; i < 14; i++) update(1 / 60);
      const t = trails[trails.length - 3],
        e = spawn(t.x, t.y);
      e.hp = 300;
      e.speed = 0;
      const before = e.hp;
      update(1 / 60);
      const after = e.hp;
      update(1 / 60);
      return { damage: before - after, repeatDamage: after - e.hp, trailHits };
    },
    setupLethalCollision() {
      lives = player.hp = 1;
      player.invuln = 0;
      enemies = [];
      spawn(player.x, player.y);
    },
    setupCombat(mode) {
      state = "playing";
      overlay.hidden = true;
      player.x = 600;
      player.y = 350;
      player.cooldown = 0;
      enemies = [];
      bullets = [];
      enemyShots = [];
      spawnTimer = 99;
      const e = spawn(mode === "dash" ? 680 : 750, 350);
      e.speed = 0;
      spawn(80, 80).speed = 0;
    },
  };
  sync();
  requestAnimationFrame(frame);
})();
