/* Zoomies flagship demo. Vanilla JS + GSAP (ScrollTrigger).
 * Restrained hero (animated activity rings), an interactive zoomies heatmap,
 * a day timeline, an animated leaderboard, count-up stats, and 3D tilt cards.
 * All motion respects prefers-reduced-motion. See BRAND.md for the concept. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGsap = !!window.gsap;
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  // The pinned day scene adds a tall spacer after layout. If the browser restores a
  // mid-page scroll on reload before that exists, it lands inside the pinned scene.
  // Manage scroll ourselves so a reload starts at the top instead of jumping.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /* Fire a callback once when an element scrolls into view. IntersectionObserver is
   * used (not ScrollTrigger) for one-shot reveals: it has no start-position to go
   * stale when a pinned section or JS-sized grid changes the layout, so reveals fire
   * reliably. ScrollTrigger is reserved for the scrubbed/pinned day scene. */
  const inView = (el, cb, threshold) => {
    if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { cb(); io.disconnect(); } }), { threshold: threshold == null ? 0.15 : threshold });
    io.observe(el);
  };

  /* ---------------- 0. Immersive zoomie trail (the signature) ----------------
   * A glowing path that races and wanders across the hero like a tracked sprint,
   * and chases the cursor (the cat chasing you). On brand: it visualizes the
   * exact thing Zoomies tracks. Canvas 2D, reduced-motion draws a static route. */
  function initTrail() {
    const canvas = document.getElementById("trail");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize(); addEventListener("resize", () => { resize(); if (reduce) drawTrail(staticRoute()); });

    function drawTrail(pts) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
      // soft glow pass (whole path, wide + faint)
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.lineWidth = 11; ctx.strokeStyle = "rgba(194,240,74,0.045)"; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(194,240,74,0.07)"; ctx.stroke();
      // bright core, fading from tail (old, faint) to head (new, bright)
      for (let i = 1; i < pts.length; i++) {
        const a = i / pts.length;
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineWidth = 0.6 + a * 2.6; ctx.strokeStyle = `rgba(212,255,128,${0.08 + a * 0.55})`; ctx.stroke();
      }
      const h = pts[pts.length - 1];
      if (h) { ctx.beginPath(); ctx.arc(h.x, h.y, 3.6, 0, 7); ctx.fillStyle = "#eaffb0"; ctx.shadowColor = "rgba(194,240,74,0.9)"; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0; }
      ctx.globalCompositeOperation = "source-over";
    }

    // deterministic wander (used for the static/reduced-motion frame)
    function staticRoute() {
      const pts = []; let x = W * 0.16, y = H * 0.66, ang = -0.5;
      const pad = Math.min(W, H) * 0.08, step = Math.max(W, H) / 95;
      for (let i = 0; i < 210; i++) {
        const s = i * 0.07;
        ang += 0.13 * Math.sin(s * 1.3) + 0.09 * Math.sin(s * 2.7 + 1) + 0.05 * Math.sin(s * 0.5);
        x += Math.cos(ang) * step; y += Math.sin(ang) * step;
        if (x < pad) { x = pad; ang = Math.PI - ang; } if (x > W - pad) { x = W - pad; ang = Math.PI - ang; }
        if (y < pad) { y = pad; ang = -ang; } if (y > H - pad) { y = H - pad; ang = -ang; }
        pts.push({ x, y });
      }
      return pts;
    }

    if (reduce) { drawTrail(staticRoute()); return; }

    const trail = staticRoute().slice(-90);     // seed so it starts mid-zoom
    const cat = { x: trail[trail.length - 1].x, y: trail[trail.length - 1].y, ang: -0.5 };
    let wander = -0.5;                            // smooth meandering heading (no randomness)
    const mouse = { x: 0, y: 0, on: false };
    const MAX = 165; let frame = 0;
    addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.on = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function tick() {
      frame++; const s = frame * 0.07;
      wander += 0.05 * Math.sin(s * 1.3) + 0.035 * Math.sin(s * 0.47 + 1);   // gentle, smooth drift
      // desired direction as a vector: wander by default, a loose curve toward the cursor when near
      let dirX = Math.cos(wander), dirY = Math.sin(wander), speed = Math.max(W, H) / 120;
      if (mouse.on) {
        const dx = mouse.x - cat.x, dy = mouse.y - cat.y, d = Math.hypot(dx, dy) || 1;
        const rx = dx / d, ry = dy / d;
        const close = Math.max(0, Math.min(0.55, (150 - d) / 150));   // gentle: a loose curve, never a tight ring
        dirX = rx * (1 - close) - ry * close; dirY = ry * (1 - close) + rx * close;
        speed *= d < 90 ? 0.9 : 1.25;
      }
      // smooth edge avoidance: steer inward near a wall instead of a hard bounce (which caused the kink)
      const mg = Math.min(W, H) * 0.13;
      if (cat.x < mg) dirX += (1 - cat.x / mg) * 1.3;
      if (cat.x > W - mg) dirX -= (1 - (W - cat.x) / mg) * 1.3;
      if (cat.y < mg) dirY += (1 - cat.y / mg) * 1.3;
      if (cat.y > H - mg) dirY -= (1 - (H - cat.y) / mg) * 1.3;
      cat.ang += wrap(Math.atan2(dirY, dirX) - cat.ang) * 0.14;       // ease the heading: smooth curves
      cat.x += Math.cos(cat.ang) * speed; cat.y += Math.sin(cat.ang) * speed;
      cat.x = Math.max(6, Math.min(W - 6, cat.x));                    // soft position clamp, no angle flip
      cat.y = Math.max(6, Math.min(H - 6, cat.y));
      trail.push({ x: cat.x, y: cat.y }); if (trail.length > MAX) trail.shift();
      drawTrail(trail);
    }
    let raf, running = false;
    const loop = () => { tick(); raf = requestAnimationFrame(loop); };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting ? start() : stop()), { threshold: 0 }).observe(canvas);
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  }

  /* ---------------- 1. Hero masked line reveal ---------------- */
  function initHero() {
    if (!hasGsap || reduce) return;
    const lines = document.querySelectorAll(".hero-title .line > span");
    gsap.set(lines, { yPercent: 115 });
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .to(lines, { yPercent: 0, duration: 0.9, stagger: 0.1 }, 0.15)
      .from(".eyebrow", { opacity: 0, y: 12, duration: 0.6 }, 0.1)
      .from(".hero-sub", { opacity: 0, y: 16, duration: 0.7 }, 0.45)
      .from(".hero-cta", { opacity: 0, y: 16, duration: 0.7 }, 0.6);
  }

  /* ---------------- 2. Activity rings ---------------- */
  function initRings() {
    document.querySelectorAll(".ring-fill circle").forEach((c) => {
      const r = +c.getAttribute("r"), C = 2 * Math.PI * r, pct = +c.dataset.pct;
      c.style.strokeDasharray = C;
      if (hasGsap && !reduce) {
        c.style.strokeDashoffset = C;
        inView(document.querySelector(".rings-card"), () => gsap.to(c, { strokeDashoffset: C * (1 - pct), duration: 1.4, ease: "power2.out", delay: 0.3 }));
      } else {
        c.style.strokeDashoffset = C * (1 - pct);
      }
    });
  }

  /* ---------------- 3. Count-up numbers (decimals + prefix/suffix) ---------------- */
  function fmt(el, v) {
    const dec = +(el.dataset.dec || 0);
    return (el.dataset.prefix || "") + v.toFixed(dec) + (el.dataset.suffix || "");
  }
  function countUp(el) {
    const target = +el.dataset.count;
    if (hasGsap && !reduce) {
      const o = { v: 0 };
      gsap.to(o, { v: target, duration: 1.4, ease: "power2.out", onUpdate: () => el.textContent = fmt(el, o.v) });
    } else el.textContent = fmt(el, target);
  }
  function initCounters() {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; countUp(e.target); io.unobserve(e.target);
    }), { threshold: 0.6 });
    document.querySelectorAll("[data-count]").forEach((el) => io.observe(el));
  }

  /* ---------------- 4. Interactive zoomies heatmap ----------------
   * A week of zoomies by hour, with a story in the data: a hard 3am spike every
   * night (the running joke), a breakfast bump, a calm work-from-home midday, an
   * evening surge, weekends more feral than weekdays, a suspiciously quiet
   * Wednesday afternoon (a vet visit), and peak-feral Friday/Saturday nights. */
  const HOUR = [0.14, 0.10, 0.20, 0.96, 0.20, 0.13, 0.24, 0.46, 0.52, 0.40, 0.30, 0.16, 0.12, 0.13, 0.17, 0.27, 0.42, 0.55, 0.70, 0.76, 0.69, 0.52, 0.34, 0.42];
  const DAYMOOD = [0.84, 0.80, 1.00, 0.90, 1.10, 1.34, 1.22];   // Mon..Sun, weekends feral
  function heat(d, h) {
    let w = HOUR[h] * DAYMOOD[d];
    if (d === 2 && h >= 13 && h <= 18) w *= 0.22;                            // Wed afternoon at the vet: suspiciously calm
    if ((d === 4 || d === 5) && (h === 23 || h === 2 || h === 3)) w *= 1.5;  // Fri/Sat: peak-feral nights
    const n = Math.sin(d * 12.9898 + h * 78.233) * 43758.5453;              // deterministic per-cell variation (no uniform columns)
    return Math.max(0, Math.min(1, w * (0.72 + (n - Math.floor(n)) * 0.68)));
  }
  function initHeatmap() {
    const grid = document.getElementById("heatmap");
    if (!grid) return;
    const tip = document.createElement("div"); tip.className = "heat-tip"; document.body.appendChild(tip);
    const cells = [];
    for (let d = 0; d < 7; d++) {                 // row-major: one row per day, 24 hours across
      for (let h = 0; h < 24; h++) {
        const w = heat(d, h);
        const lvl = w < 0.1 ? 0 : w < 0.3 ? 1 : w < 0.52 ? 2 : w < 0.76 ? 3 : 4;
        const zoom = Math.round(w * 7);
        const speed = (6 + w * 15).toFixed(1);
        const cell = document.createElement("div");
        cell.className = "cell g" + lvl;
        const hr = ((h % 12) || 12) + (h < 12 ? "am" : "pm");
        cell.addEventListener("mouseenter", (e) => {
          tip.innerHTML = `${DAYS[d]} ${hr} &middot; <b>${zoom} zoomies</b> &middot; ${speed} mph`;
          tip.classList.add("on");
        });
        cell.addEventListener("mousemove", (e) => { tip.style.left = e.clientX + "px"; tip.style.top = (e.clientY - 14) + "px"; });
        cell.addEventListener("mouseleave", () => tip.classList.remove("on"));
        grid.appendChild(cell); cells.push(cell);
      }
    }
    // size cells explicitly: 24 square columns that fill the width, uniform rows
    const sizeHeatmap = () => {
      const cw = grid.clientWidth / 24;
      grid.style.gridTemplateColumns = `repeat(24, ${cw}px)`;
      grid.style.gridAutoRows = `${cw}px`;
    };
    sizeHeatmap();
    if (window.ResizeObserver) new ResizeObserver(sizeHeatmap).observe(grid);
    if (hasGsap && !reduce) {
      // fade in only (no per-cell scale): cells stay full size, so the grid never
      // looks uneven while the stagger is mid-flight
      gsap.set(cells, { opacity: 0 });
      inView(grid, () => gsap.to(cells, { opacity: 1, duration: 0.45, ease: "power2.out", stagger: { each: 0.003, from: "start" } }));
    }
  }

  /* ---------------- 5. Day timeline (hover a bar to focus the hour) ---------------- */
  const CATNAME = { z: "Zoomies", h: "Hunt", r: "Rest", a: "Awake" };
  function initDaybar() {
    const bar = document.getElementById("daybar");
    if (!bar) return;
    // 24 hours: category + activity level. The night is rest, with a 3am zoomie spike.
    const day = [
      ["r",18],["r",14],["r",16],["z",96],["r",30],["r",16],["r",20],["a",55],
      ["h",70],["r",40],["r",28],["r",22],["a",48],["r",36],["r",30],["r",26],
      ["h",64],["a",58],["z",88],["a",60],["h",66],["a",50],["z",80],["r",34],
    ];
    const tip = document.createElement("div"); tip.className = "heat-tip"; document.body.appendChild(tip);
    const segs = day.map(([cat, lvl], i) => {
      const s = document.createElement("div");
      s.className = "seg " + cat; s.style.height = lvl + "%";
      const hr = ((i % 12) || 12) + (i < 12 ? "am" : "pm");
      const intensity = lvl > 72 ? "peak" : lvl > 42 ? "active" : "calm";
      s.addEventListener("mouseenter", () => { tip.innerHTML = `${hr} &middot; <b>${CATNAME[cat]}</b> &middot; ${intensity}`; tip.classList.add("on"); });
      s.addEventListener("mousemove", (e) => { tip.style.left = e.clientX + "px"; tip.style.top = (e.clientY - 14) + "px"; });
      s.addEventListener("mouseleave", () => tip.classList.remove("on"));
      bar.appendChild(s); return s;
    });
    if (hasGsap && !reduce) {
      // fade in at full height (no grow): the right bars are never momentarily short
      gsap.set(segs, { opacity: 0 });
      inView(bar, () => gsap.to(segs, { opacity: 1, duration: 0.5, ease: "power2.out", stagger: 0.02 }));
    }
  }

  /* ---------------- 5.5 Rings: hover a ring or legend to isolate one metric ---------------- */
  function initRingFocus() {
    if (!fine) return;
    const card = document.querySelector(".rings-card");
    if (!card) return;
    const cats = ["z", "h", "r"];
    const set = (c) => () => card.setAttribute("data-focus", c);
    const clear = () => card.removeAttribute("data-focus");
    document.querySelectorAll(".rings-legend span").forEach((sp, i) => {
      sp.addEventListener("mouseenter", set(cats[i])); sp.addEventListener("mouseleave", clear);
    });
    const ringCat = { "r-zoom": "z", "r-hunt": "h", "r-rest": "r" };
    document.querySelectorAll(".ring-fill circle").forEach((c) => {
      const cat = ringCat[c.classList[0]];
      c.addEventListener("mouseenter", set(cat)); c.addEventListener("mouseleave", clear);
    });
  }

  /* ---------------- 6. Leaderboard ---------------- */
  function initBoard() {
    const board = document.getElementById("board");
    if (!board) return;
    const cats = [
      { n: "Sir Reginald Whiskers III", s: 9420, c: "#ffb24a", top: 22.1, zoom: 487, streak: 12 },
      { n: "Mochi", s: 8810, c: "#c2f04a", you: true, top: 19.4, zoom: 441, streak: 9 },
      { n: "Luna", s: 8200, c: "#6ea8ff", top: 20.6, zoom: 398, streak: 6 },
      { n: "Chairman Meow", s: 7950, c: "#ff7a90", top: 17.2, zoom: 372, streak: 14 },
      { n: "Stanford", s: 7400, c: "#9b8cff", top: 18.9, zoom: 351, streak: 4 },
      { n: "Carrot", s: 6980, c: "#5fd3c2", top: 16.4, zoom: 318, streak: 8 },
    ];
    const max = cats[0].s;
    const tip = document.createElement("div"); tip.className = "heat-tip"; document.body.appendChild(tip);
    cats.forEach((cat, i) => {
      const li = document.createElement("li");
      if (cat.you) li.className = "you";
      li.innerHTML =
        `<span class="rank">${i + 1}</span>` +
        `<span class="cat-avatar" style="background:${cat.c}">${cat.n[0]}</span>` +
        `<span class="bar-wrap"><span class="cat-name">${cat.n}${cat.you ? '<span class="tag">you</span>' : ""}</span>` +
        `<span class="bar"><i data-w="${(cat.s / max) * 100}"></i></span></span>` +
        `<span class="score tnum" data-count="${cat.s}">0</span>`;
      if (fine) {   // a tooltip (not an inline expand) so the row layout never shifts
        li.addEventListener("mouseenter", () => { tip.innerHTML = `<b>${cat.top} mph</b> top &middot; ${cat.zoom} zoomies &middot; ${cat.streak}-day streak`; tip.classList.add("on"); });
        li.addEventListener("mousemove", (e) => { tip.style.left = e.clientX + "px"; tip.style.top = (e.clientY - 14) + "px"; });
        li.addEventListener("mouseleave", () => tip.classList.remove("on"));
      }
      board.appendChild(li);
    });
    const bars = board.querySelectorAll(".bar > i");
    const scores = board.querySelectorAll(".score");
    if (hasGsap && !reduce) {
      inView(board, () => {
        gsap.to(bars, { width: (i, t) => t.dataset.w + "%", duration: 1.1, ease: "power2.out", stagger: 0.08 });
        scores.forEach(countUp);
      });
    } else {
      bars.forEach((b) => b.style.width = b.dataset.w + "%");
      scores.forEach((s) => s.textContent = (+s.dataset.count).toFixed(0));
    }
  }

  /* ---------------- 6.5 Scroll-scrubbed "a day in the life" ----------------
   * A pinned scene scrubbed by scroll: follow Mochi through 24 hours, the sun
   * arcing across the sky, each moment's stat and caption crossfading in. Under
   * reduced motion it becomes a plain, readable timeline (no pin). */
  function initDay() {
    const stage = document.getElementById("day-stage");
    if (!stage) return;
    const M = [
      { t: "6:30 AM", a: "Breakfast sprint", c: "z", stat: "14.2 mph dash", line: "A full-speed run to a bowl that has been full for nine hours." },
      { t: "9:05 AM", a: "Window patrol", c: "h", stat: "22 min stalking", line: "Tracking a pigeon through glass. The pigeon remains unbothered." },
      { t: "12:30 PM", a: "Sunbeam nap", c: "r", stat: "1h 48m, deep loaf", line: "Professional resting in progress. Do not disturb the loaf." },
      { t: "5:10 PM", a: "The evening hunt", c: "h", stat: "31 pounces", line: "The feather wand never stood a chance. Confirmed kills: 31." },
      { t: "8:40 PM", a: "Living-room laps", c: "z", stat: "3 laps, 18.1 mph", line: "Couch, rug, hallway, repeat. A personal best on the straightaway." },
      { t: "3:02 AM", a: "The 3am zoomie", c: "z", stat: "19.4 mph top speed", line: "The fastest run of the day. You are awake now. We are sorry." },
    ];
    if (reduce || !hasGsap) {
      stage.innerHTML = '<h2 class="day-list-title">A day in the life of Mochi</h2><ul class="day-list">' +
        M.map((m) => `<li data-cat="${m.c}"><span class="dl-time">${m.t}</span><span class="dl-act">${m.a}</span><span class="dl-stat">${m.stat}</span><p>${m.line}</p></li>`).join("") + "</ul>";
      return;
    }
    stage.innerHTML =
      `<div class="day-scene" data-cat="z">
        <div class="day-eyebrow">A day in the life of Mochi</div>
        <div class="day-arc"><div class="track"></div><div class="sun"></div>
          <div class="ticks"><span>6a</span><span>12p</span><span>6p</span><span>12a</span><span>3a</span></div></div>
        <div class="day-time"></div><div class="day-activity"></div><div class="day-stat"></div>
        <p class="day-line"></p>
        <div class="day-progress">${M.map(() => "<i></i>").join("")}</div>
      </div>`;
    const scene = stage.querySelector(".day-scene"), sun = stage.querySelector(".sun");
    const elT = stage.querySelector(".day-time"), elA = stage.querySelector(".day-activity"),
      elS = stage.querySelector(".day-stat"), elL = stage.querySelector(".day-line"),
      dots = stage.querySelectorAll(".day-progress i"), texts = [elT, elA, elS, elL];
    let cur = -1;
    function setMoment(i) {
      if (i === cur) return; cur = i; const m = M[i];
      scene.dataset.cat = m.c;
      elT.textContent = m.t; elA.textContent = m.a; elS.textContent = m.stat; elL.textContent = m.line;
      gsap.fromTo(texts, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.04, overwrite: true });
      dots.forEach((d, k) => d.classList.toggle("on", k <= i));
    }
    setMoment(0);
    ScrollTrigger.create({
      trigger: "#day", start: "top top", end: "+=" + (M.length * 85) + "%",
      pin: ".day-inner", scrub: 0.4, anticipatePin: 1,
      onUpdate: (self) => {
        const p = self.progress;
        setMoment(Math.min(M.length - 1, Math.floor(p * M.length + 0.0001)));
        gsap.set(sun, { left: (6 + p * 88) + "%", bottom: (12 + Math.sin(p * Math.PI) * 70) + "px" });
      },
    });
  }

  /* ---------------- 7. Cursor-reactive 3D tilt cards ---------------- */
  function initTilt() {
    if (!fine || reduce || !hasGsap) return;
    document.querySelectorAll(".tilt").forEach((card) => {
      const glow = card.querySelector(".glow");
      const rX = gsap.quickTo(card, "rotationX", { duration: 0.4, ease: "power3" });
      const rY = gsap.quickTo(card, "rotationY", { duration: 0.4, ease: "power3" });
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        rY((px - 0.5) * 9); rX((0.5 - py) * 9);
        glow.style.setProperty("--gx", px * 100 + "%"); glow.style.setProperty("--gy", py * 100 + "%");
      });
      card.addEventListener("mouseleave", () => { rX(0); rY(0); });
    });
  }

  /* ---------------- 8. Magnetic CTA + reveals ---------------- */
  function initMagnetic() {
    if (!fine || !hasGsap || reduce) return;
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("mousemove", (e) => { const r = el.getBoundingClientRect(); xTo((e.clientX - (r.left + r.width / 2)) * 0.4); yTo((e.clientY - (r.top + r.height / 2)) * 0.4); });
      el.addEventListener("mouseleave", () => { xTo(0); yTo(0); });
    });
  }
  function initReveals() {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  initTrail(); initHero(); initRings(); initRingFocus(); initCounters(); initHeatmap(); initDaybar(); initDay(); initBoard(); initTilt(); initMagnetic(); initReveals();

  // Recompute the pinned day scene's start/end after fonts and layout settle (the
  // one-shot reveals use IntersectionObserver, so they do not depend on this).
  if (hasGsap && !reduce) {
    requestAnimationFrame(() => ScrollTrigger.refresh());
    window.addEventListener("load", () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
})();
