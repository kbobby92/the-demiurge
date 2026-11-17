// The Demiurge – Phase 1 pixel map.
// Draws the valley at low resolution and scales it up for a crisp pixel look.
// Villagers, soldiers and notable minds wander between home, fields, water and the square.

export const LOW_W = 480, LOW_H = 300, SCALE = 2;

// Places in low-resolution map coordinates.
export const PLACES = {
  "Hollowmere": { x: 150, y: 70, field: { x: 105, y: 88, w: 60, h: 26 }, water: { x: 128, y: 54 } },
  "Reedmere": { x: 292, y: 150, field: { x: 300, y: 168, w: 62, h: 28 }, water: { x: 276, y: 136 } },
  "Low Ford": { x: 158, y: 232, field: { x: 56, y: 196, w: 62, h: 26 }, water: { x: 150, y: 220 } },
  "Kessa": { x: 258, y: 82 },
};
const RIVER = [[472, 52], [440, 60], [404, 80], [370, 104], [330, 128], [300, 140], [262, 156], [232, 178], [196, 204], [166, 220], [130, 240], [92, 262], [40, 290], [0, 300]];
const DAM = { x: 444, y: 56 };

let rng = Math.random;
const rand = (a, b) => a + rng() * (b - a);

// ---------------------------------------------------------------------------
// Terrain (redrawn each year so the river, fields and wells reflect the world)
// ---------------------------------------------------------------------------
export function drawTerrain(ctx, w) {
  const h = w.history.at(-1);
  const flow = h ? h.flow : 0.5;
  // Grass with light noise.
  ctx.fillStyle = "#3f6b3a"; ctx.fillRect(0, 0, LOW_W, LOW_H);
  const r2 = mulberry(7);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = r2() < 0.5 ? "#3a6436" : "#47753f"; ctx.fillRect(Math.floor(r2() * LOW_W), Math.floor(r2() * LOW_H), 1, 1); }
  // Hills in the north-west and the eastern ridge.
  blob(ctx, 120, 50, 90, 46, "#557a45", 11); blob(ctx, 250, 70, 50, 30, "#5d8049", 12);
  for (let y = 0; y < LOW_H; y++) { const x0 = 440 + Math.sin(y / 17) * 8; ctx.fillStyle = "#6b6a5c"; ctx.fillRect(x0, y, LOW_W - x0, 1); ctx.fillStyle = "#7d7b6b"; ctx.fillRect(x0, y, 3, 1); }
  // Spring at Hollowmere.
  ctx.fillStyle = "#4f9fd6"; ctx.fillRect(PLACES.Hollowmere.water.x - 3, PLACES.Hollowmere.water.y - 2, 7, 5);
  // River, thinner when the flow is low.
  const width = Math.max(2, Math.round(2 + flow * 6));
  ctx.strokeStyle = flow < 0.5 ? "#5f8fa0" : "#3f86c4"; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); RIVER.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  if (flow < 0.6) { ctx.strokeStyle = "#8a7b5a"; ctx.lineWidth = 1; ctx.beginPath(); RIVER.forEach(([x, y], i) => (i ? ctx.lineTo(x + 3, y + 3) : ctx.moveTo(x + 3, y + 3))); ctx.stroke(); }
  // Varn's dam.
  const closed = w.dam;
  ctx.fillStyle = "#9a9a9a"; ctx.fillRect(DAM.x - 2, DAM.y - 8, 5, 16);
  ctx.fillStyle = closed > 0.7 ? "#c94c4c" : closed > 0.35 ? "#d9a441" : "#6fbf73"; ctx.fillRect(DAM.x - 1, DAM.y - 11, 3, 2);
  // Fields: colour shows how well they are doing.
  for (const name of ["Hollowmere", "Reedmere", "Low Ford"]) {
    const v = w.villages[name], f = PLACES[name].field;
    const food = h ? Math.min(1.3, v.food) : 0.8;
    const crop = food > 1 ? "#c8b44a" : food > 0.8 ? "#a99a43" : food > 0.6 ? "#8c7d43" : "#7a6646";
    for (let yy = 0; yy < f.h; yy += 3) for (let xx = 0; xx < f.w; xx += 4) {
      ctx.fillStyle = (xx / 4 + yy / 3) % 2 ? crop : shade(crop, -18); ctx.fillRect(f.x + xx, f.y + yy, 3, 2);
    }
  }
  // Scars on the fields: burned, flooded or ruined crops.
  for (const name of ["Hollowmere", "Reedmere", "Low Ford"]) {
    const v = w.villages[name], f = PLACES[name].field;
    if (!(v.fieldDamage > 0.04)) continue;
    const r4 = mulberry(name.length * 7 + w.year);
    const col = v.fieldScar === "fire" ? ["#2a2420", "#3b3029", "#4a3a2e"] : v.fieldScar === "flood" ? ["#3b6f8f", "#4c86a8", "#36607a"] : ["#5b5636", "#4f4a2e", "#6a603c"];
    for (let yy = 0; yy < f.h; yy += 1) for (let xx = 0; xx < f.w; xx += 1) if (r4() < v.fieldDamage) { ctx.fillStyle = col[(xx + yy) % 3]; ctx.fillRect(f.x + xx, f.y + yy, 1, 1); }
  }
  // Fouled water.
  for (const name of ["Hollowmere", "Reedmere", "Low Ford"]) {
    const v = w.villages[name], wp = PLACES[name].water;
    if (v.poisoned > 0) { ctx.fillStyle = "#7fae3a"; ctx.fillRect(wp.x - 3, wp.y - 2, 7, 4); ctx.fillStyle = "#a8d04a"; ctx.fillRect(wp.x - 1, wp.y - 1, 2, 1); }
  }
  // Houses: one per ~25 people.
  for (const name of ["Hollowmere", "Reedmere", "Low Ford"]) {
    const v = w.villages[name], p = PLACES[name], r3 = mulberry(name.length * 31);
    const n = Math.max(3, Math.round(v.pop / 25));
    for (let i = 0; i < n; i++) {
      const a = r3() * Math.PI * 2, d = 6 + r3() * 16;
      const x = Math.round(p.x + Math.cos(a) * d * 1.3), y = Math.round(p.y + Math.sin(a) * d * 0.8);
      ctx.fillStyle = "#8b5a3c"; ctx.fillRect(x, y, 5, 4); ctx.fillStyle = "#b23b2f"; ctx.fillRect(x - 1, y - 2, 7, 2);
    }
    // Village square.
    ctx.fillStyle = "#a89b7c"; ctx.fillRect(p.x - 3, p.y - 2, 7, 5);
    if (v.wells) { ctx.fillStyle = "#555"; ctx.fillRect(p.x + 10, p.y + 8, 4, 3); ctx.fillStyle = "#4f9fd6"; ctx.fillRect(p.x + 11, p.y + 8, 2, 1); }
  }
  // Kessa: walls, keep, temple.
  const k = PLACES.Kessa;
  ctx.fillStyle = "#7d7d86"; ctx.fillRect(k.x - 16, k.y - 12, 32, 24);
  ctx.fillStyle = "#5e5e68"; ctx.fillRect(k.x - 14, k.y - 10, 28, 20);
  ctx.fillStyle = "#9b9ba6"; ctx.fillRect(k.x - 5, k.y - 16, 10, 12);
  ctx.fillStyle = FLAG[w.government.type] || "#3d7ab8"; ctx.fillRect(k.x - 1, k.y - 22, 1, 6); ctx.fillRect(k.x, k.y - 22, 4, 3);
  ctx.fillStyle = "#d8d0b8"; ctx.fillRect(k.x + 8, k.y + 2, 6, 6); ctx.fillStyle = "#b48ee0"; ctx.fillRect(k.x + 10, k.y, 2, 2);
  // Things the inhabitants have built.
  for (const st of w.structures || []) drawStructure(ctx, st, structurePos(w, st));
}

export const FLAG = { monarchy: "#c9a227", military: "#8a2b2b", council: "#3d7ab8", theocracy: "#9b6fd6", usurper: "#d9792b", conquest: "#555b66" };

export function structurePos(w, st) {
  const same = (w.structures || []).filter((x) => x.place === st.place);
  const i = same.indexOf(st);
  const p = PLACES[st.place] || PLACES.Kessa;
  const spots = st.place === "Kessa" ? [[-26, 6], [24, -6], [-22, -14], [22, 14]] : [[24, -10], [-26, 8], [20, 14], [-22, -12]];
  const [dx, dy] = spots[i % spots.length];
  return { x: p.x + dx, y: p.y + dy };
}
function drawStructure(ctx, st, { x, y }) {
  const n = st.name.toLowerCase(), big = Math.min(3, st.size || 1);
  const h = 5 + big * 2;
  if (/tower|watch/.test(n)) { ctx.fillStyle = "#8c8c96"; ctx.fillRect(x - 2, y - h - 4, 5, h + 4); ctx.fillStyle = "#b5b5c0"; ctx.fillRect(x - 3, y - h - 6, 7, 2); return; }
  if (/wall|fort|palisade/.test(n)) { ctx.fillStyle = "#7f6a4d"; ctx.fillRect(x - 8, y - 3, 16, 3); for (let i = -8; i < 8; i += 3) ctx.fillRect(x + i, y - 5, 2, 2); return; }
  if (/shrine|temple|altar|statue|monument|idol/.test(n)) { ctx.fillStyle = "#d8d0b8"; ctx.fillRect(x - 3, y - h, 6, h); ctx.fillStyle = "#b48ee0"; ctx.fillRect(x - 1, y - h - 2, 2, 2); return; }
  if (/granary|store|barn/.test(n)) { ctx.fillStyle = "#a0763f"; ctx.fillRect(x - 4, y - 5, 8, 5); ctx.fillStyle = "#c8b44a"; ctx.fillRect(x - 3, y - 7, 6, 2); return; }
  ctx.fillStyle = "#9c7a54"; ctx.fillRect(x - 4, y - 4 - big, 8, 4 + big); ctx.fillStyle = "#6e4f33"; ctx.fillRect(x - 5, y - 6 - big, 10, 2);
}

function blob(ctx, cx, cy, rx, ry, color, seed) {
  const r = mulberry(seed); ctx.fillStyle = color;
  for (let i = 0; i < 900; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()); ctx.fillRect(Math.round(cx + Math.cos(a) * rx * d), Math.round(cy + Math.sin(a) * ry * d), 2, 2); }
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, v + d)); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
export class Population {
  constructor() { this.agents = new Map(); this.effects = []; this.march = null; this.particles = []; this.emitters = []; this.carts = []; }

  sync(w) {
    const keep = new Set();
    const homeOf = (village) => PLACES[village] || PLACES.Kessa;
    // Named citizens.
    for (const c of w.citizens) {
      const id = "c" + c.id;
      if (!c.alive || c.jailed || c.promoted) continue;
      keep.add(id);
      if (!this.agents.has(id)) this.agents.set(id, this.newAgent(id, "citizen", c.village, homeOf(c.village)));
      const a = this.agents.get(id); a.ref = c; a.village = c.village;
    }
    // Notable minds (Varn's ruler stays off the map).
    for (const m of w.minds) {
      const id = "m" + m.id;
      if (!m.alive || m.role === "foreign") continue;
      keep.add(id);
      const place = PLACES[m.place] ? m.place : "Kessa";
      if (!this.agents.has(id)) this.agents.set(id, this.newAgent(id, "mind", place, homeOf(place)));
      const a = this.agents.get(id); a.ref = m; a.village = place; a.home = homeOf(place);
    }
    // Anonymous villagers: one sprite per ~8 people beyond the named folk.
    for (const name of Object.keys(w.villages)) {
      const want = Math.max(0, Math.round(w.villages[name].pop / 8) - 12);
      for (let i = 0; i < want; i++) { const id = `a-${name}-${i}`; keep.add(id); if (!this.agents.has(id)) this.agents.set(id, this.newAgent(id, "anon", name, homeOf(name))); }
    }
    // Soldiers: one sprite per ~6 spearmen.
    const nSold = Math.round(w.soldiers / 6);
    for (let i = 0; i < nSold; i++) { const id = `s-${i}`; keep.add(id); if (!this.agents.has(id)) this.agents.set(id, this.newAgent(id, "soldier", "Kessa", PLACES.Kessa)); }
    const now = performance.now();
    for (const [id, a] of [...this.agents]) if (!keep.has(id) && !(a.kind === "visitor" && a.expires > now)) this.agents.delete(id);
    // Sickness tint per village.
    for (const a of this.agents.values()) {
      const v = w.villages[a.village];
      a.sick = v ? rng() < (v.sick / Math.max(1, v.pop)) * 3 : false;
      a.rebel = a.kind === "citizen" && a.ref?.active;
      a.believer = !!a.ref?.creditsGod;
    }
  }

  newAgent(id, kind, village, home) {
    return { id, kind, village, home, x: home.x + rand(-14, 14), y: home.y + rand(-10, 10), tx: null, ty: null, wait: rand(0, 120), speed: kind === "soldier" ? 0.35 : 0.25 + rng() * 0.15, shirt: pick(["#c9b27a", "#9c6b46", "#7f8c5a", "#b07b5a", "#a2a2a2", "#6d7fa3"]) };
  }

  // Called when a year ends: start marches and floating labels from the year's events.
  onYear(events) {
    for (const e of events) {
      if (e.kind === "revolt" || e.kind === "revolution") {
        const where = Object.keys(PLACES).filter((p) => p !== "Kessa" && e.text.includes(p));
        this.march = { villages: where.length ? where : ["Low Ford"], until: performance.now() + 9000, won: e.kind === "revolution" };
        this.label(e.kind === "revolution" ? "REVOLUTION!" : "Revolt crushed", PLACES.Kessa.x, PLACES.Kessa.y - 28, e.kind === "revolution" ? "#ff8a7a" : "#e0a454");
      } else if (e.kind === "war") this.label("WAR WITH VARN", 400, 70, "#ff8a7a");
      else if (e.kind === "idea") { const p = Object.keys(PLACES).find((x) => e.text.includes(x)) || "Kessa"; this.label("A new idea", PLACES[p].x, PLACES[p].y - 18, "#c9a7ff"); }
      else if (/wells dug in (\w[\w ]*)/.test(e.text)) { const p = e.text.match(/wells dug in ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/)?.[1]; if (PLACES[p]) this.label("New wells", PLACES[p].x, PLACES[p].y - 18, "#8fd0ff"); }
      else if (e.kind === "god") { /* labels added directly by the god panel */ }
    }
  }

  label(text, x, y, color) { this.effects.push({ text, x, y, color, born: performance.now(), life: 5000 }); }
  ring(x, y, color) { this.effects.push({ ring: true, x, y, color, born: performance.now(), life: 2500 }); }

  step() {
    const now = performance.now();
    this.stepParticles();
    if (this.march && now > this.march.until) this.march = null;
    for (const [id, a] of this.agents) if (a.kind === "visitor" && now > a.expires) this.agents.delete(id);
    for (const a of this.agents.values()) {
      if (a.goal && now > a.goal.until) { a.goal = null; a.tx = null; if (a.kind === "visitor") { a.goal = { x: VARN.x, y: VARN.y, jx: 0, jy: 0, until: a.expires }; } }
      if (a.goal) { const g = a.goal.follow ? this.agents.get(a.goal.follow) : null; a.tx = (g ? g.x : a.goal.x) + a.goal.jx; a.ty = (g ? g.y : a.goal.y) + a.goal.jy; a.wait = 0; }
      if (a.wait > 0) { a.wait--; continue; }
      if (a.tx === null) this.pickTarget(a);
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const sp = a.goal ? 0.85 : a.speed * (this.march && (a.rebel || a.kind === "soldier") ? 2.2 : 1);
      if (d < 1) { if (!a.goal) { a.tx = null; a.wait = rand(30, 200); } }
      else { a.x += (dx / d) * sp; a.y += (dy / d) * sp; }
    }
  }

  stepParticles() {
    const now = performance.now();
    this.emitters = this.emitters.filter((e) => now < e.until);
    for (const e of this.emitters) for (let i = 0; i < e.rate; i++) this.particles.push(spawn(e));
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.life--; }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
    for (const c of this.carts) { const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy); if (d < 1) c.done = true; else { c.x += (dx / d) * 0.5; c.y += (dy / d) * 0.5; } }
    for (const c of this.carts) if (c.done && !c.landed) { c.landed = true; this.label(c.label || "+grain", c.tx, c.ty - 8, "#f1d77a"); }
    this.carts = this.carts.filter((c) => !c.done);
  }

  pickTarget(a) {
    const p = a.home, place = PLACES[a.village];
    if (this.march && (a.rebel || (a.kind === "anon" && this.march.villages.includes(a.village) && rng() < 0.4))) {
      a.tx = PLACES.Kessa.x + rand(-26, -14); a.ty = PLACES.Kessa.y + rand(8, 22); return;
    }
    if (a.kind === "soldier") {
      if (this.march && rng() < 0.6) { a.tx = PLACES.Kessa.x + rand(-20, -8); a.ty = PLACES.Kessa.y + rand(4, 16); return; }
      const ang = rng() * Math.PI * 2; a.tx = PLACES.Kessa.x + Math.cos(ang) * rand(14, 22); a.ty = PLACES.Kessa.y + Math.sin(ang) * rand(10, 16); return;
    }
    if (a.kind === "mind" && a.village === "Kessa") { a.tx = PLACES.Kessa.x + rand(-10, 10); a.ty = PLACES.Kessa.y + rand(-6, 8); return; }
    const r = rng();
    if (a.rebel && r < 0.5) { a.tx = p.x + rand(-4, 4); a.ty = p.y + rand(-3, 3); return; }             // gather at the square
    if (place?.field && r < 0.55) { const f = place.field; a.tx = f.x + rand(0, f.w); a.ty = f.y + rand(0, f.h); return; } // work the fields
    if (place?.water && r < 0.7) { a.tx = place.water.x + rand(-4, 4); a.ty = place.water.y + rand(-3, 3); return; } // fetch water
    a.tx = p.x + rand(-22, 22); a.ty = p.y + rand(-14, 14);                                                  // around home
  }

  draw(ctx, selectedId) {
    const list = [...this.agents.values()].sort((a, b) => a.y - b.y);
    for (const a of list) {
      const x = Math.round(a.x), y = Math.round(a.y);
      // Shadow, body, head.
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(x - 1, y + 2, 3, 1);
      let body = a.shirt;
      if (a.kind === "soldier") body = "#8f2f2f";
      if (a.kind === "visitor") body = "#34508f";
      if (a.kind === "mind") body = a.ref?.role === "prophet" ? "#e6e6ff" : a.ref?.role === "priest" ? "#b48ee0" : "#e0b354";
      if (a.rebel) body = "#e0463e";
      ctx.fillStyle = body; ctx.fillRect(x - 1, y - 1, 2, 3);
      ctx.fillStyle = a.sick ? "#9fd17a" : "#e6c29a"; ctx.fillRect(x - 1, y - 3, 2, 2);
      if (a.kind === "soldier" || a.kind === "visitor") { ctx.fillStyle = "#cfcfcf"; ctx.fillRect(x + 1, y - 5, 1, 6); }
      if (a.kind === "mind") { ctx.fillStyle = "#fff2b3"; ctx.fillRect(x - 1, y - 4, 2, 1); }
      if (a.believer) { ctx.fillStyle = "rgba(255,255,220,.7)"; ctx.fillRect(x, y - 5, 1, 1); }
      if (a.id === selectedId) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 5.5, 7, 10); }
    }
    for (const c of this.carts) { const x = Math.round(c.x), y = Math.round(c.y); ctx.fillStyle = "#6e4f33"; ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillStyle = c.color || "#e6c75a"; ctx.fillRect(x - 1, y - 3, 3, 2); ctx.fillStyle = "#2a1f14"; ctx.fillRect(x - 2, y + 1, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1); }
    for (const p of this.particles) { ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size || 1, p.size || 1); }
    ctx.globalAlpha = 1;
  }

  drawEffects(ctx, scale) {
    const now = performance.now();
    this.effects = this.effects.filter((e) => now - e.born < e.life);
    for (const e of this.effects) {
      if (now < e.born) continue;
      const t = (now - e.born) / e.life;
      ctx.globalAlpha = 1 - t;
      if (e.ring) { ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x * scale, e.y * scale, (e.r0 ?? 6) + t * (e.grow ?? 40), 0, Math.PI * 2); ctx.stroke(); }
      else if (e.link) {
        const a = this.agents.get(e.a), b = this.agents.get(e.b); const A = a || e.pa, B = b || e.pb; if (!A || !B) { ctx.globalAlpha = 1; continue; }
        ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * Math.sin(now / 120)); ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(A.x * scale, (A.y - 2) * scale); ctx.lineTo(B.x * scale, (B.y - 2) * scale); ctx.stroke(); ctx.setLineDash([]);
      }
      else if (e.bubble) {
        const a = this.agents.get(e.agent); const x = (a ? a.x : e.x) * scale, y = ((a ? a.y : e.y) - 9) * scale;
        ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center";
        const lines = wrap(e.text, 34).slice(0, 3), wd = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12, ht = lines.length * 14 + 8;
        ctx.fillStyle = "rgba(250,246,232,.94)"; roundRect(ctx, x - wd / 2, y - ht - 6, wd, ht, 6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x + 4, y - 7); ctx.lineTo(x, y); ctx.fill();
        ctx.fillStyle = "#2b2618"; lines.forEach((l, i) => ctx.fillText(l, x, y - ht - 6 + 16 + i * 14));
      }
      else { ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(e.text, e.x * scale + 1, (e.y - t * 12) * scale + 1); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x * scale, (e.y - t * 12) * scale); }
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Deeds: each building block has one animation.
  // fx = { actorId, actorRole, speech, outcome, scale, effects: [{ block, look, place, from, personId, resource, ok, up, ideaId, thing, soldiers }] }
  // onLanded is called when the deed's effect appears, so the terrain can be redrawn then.
  // ---------------------------------------------------------------------------
  playDeed(fx, w, onLanded) {
    const actor = this.agents.get("m" + fx.actorId);
    const start = actor ? { x: actor.x, y: actor.y } : fx.actorRole === "foreign" ? VARN : PLACES.Kessa;
    if (fx.speech && actor && !/^\(mock/.test(fx.speech)) this.bubble("m" + fx.actorId, fx.speech);
    if (fx.outcome === "impossible") { if (actor) this.label("…it cannot be done", actor.x, actor.y - 14, "#b9b9c9"); return 0; }
    const e = fx.effects[0];
    if (!e) return 0;
    const crewN = { small: 3, medium: 7, large: 14 }[fx.scale] || 6;
    const target = this.targetPoint(e, w, start);
    const from = e.from ? pointOf(e.from) : start;
    const moving = ["change_resource", "fight", "move_people", "take_power", "recruit"].includes(e.block) || e.soldiers;
    // Who walks: the actor plus a crew (soldiers for rulers and generals).
    let crew = moving ? this.pickCrew(fx, e, from, crewN) : [];
    if (moving && fx.actorRole === "foreign") crew = this.spawnVisitors(crewN, from);
    const travelMs = moving ? Math.min(5500, Math.max(900, (Math.hypot(target.x - from.x, target.y - from.y) / 0.85) * 16.7)) : 400;
    const holdMs = travelMs + 7000;
    const goal = (a, p, spread) => { a.goal = { x: p.x, y: p.y, jx: rand(-spread, spread), jy: rand(-spread * 0.6, spread * 0.6), until: performance.now() + holdMs }; };
    if (actor && (moving || e.block === "speak_to" || e.block === "relationship")) {
      if (e.personId != null && (e.block === "speak_to" || e.block === "relationship")) actor.goal = { follow: "m" + e.personId, jx: 4, jy: 0, until: performance.now() + 7000 };
      else goal(actor, target, 3);
    }
    for (const a of crew) goal(a, target, 9);
    if (e.block === "fight" && e.personId == null && (target === PLACES.Kessa || e.place === "Kessa")) for (const s of this.soldiersNear(PLACES.Kessa, crewN)) goal(s, target, 8);
    // The visual itself, once they arrive.
    setTimeout(() => { for (const ef of fx.effects) this.effectVisual(ef, fx, w, this.targetPoint(ef, w, start)); onLanded?.(); }, travelMs);
    return travelMs + 3000;
  }

  targetPoint(e, w, start) {
    if (e.personId != null && ["fight", "speak_to", "relationship", "shift_opinion", "give_power"].includes(e.block)) { const t = this.agents.get("m" + e.personId); if (t) return { x: t.x, y: t.y }; }
    const p = e.place;
    if (p === "Varn") return VARN;
    if (!PLACES[p]) return start;
    const pl = PLACES[p];
    if (e.block === "change_resource" && e.resource === "fields" && pl.field) return { x: pl.field.x + pl.field.w / 2, y: pl.field.y + pl.field.h / 2 };
    if (e.block === "change_resource" && (e.resource === "water" || e.resource === "wells") && pl.water) return { x: pl.water.x, y: pl.water.y + 4 };
    if (e.block === "change_resource" && e.resource === "buildings" && e.up && w) { const st = [...(w.structures || [])].reverse().find((x) => x.place === p); if (st) { const q = structurePos(w, st); return { x: q.x, y: q.y + 3 }; } }
    return { x: pl.x, y: pl.y + 4 };
  }

  pickCrew(fx, e, from, n) {
    const pool = [...this.agents.values()].filter((a) => !a.goal);
    if (e.soldiers || fx.actorRole === "ruler" || fx.actorRole === "general") return this.soldiersNear(from, n);
    const near = pool.filter((a) => (a.kind === "citizen" || a.kind === "anon") && Math.hypot(a.x - from.x, a.y - from.y) < 50);
    near.sort((a, b) => score(b, e) - score(a, e));
    return near.slice(0, n);
  }
  spawnVisitors(n, from) {
    const out = [], now = performance.now();
    for (let i = 0; i < n; i++) { const id = `v-${now}-${i}`; const a = this.newAgent(id, "visitor", "Varn", VARN); a.x = from.x + rand(-4, 4); a.y = from.y + rand(-10, 10); a.expires = now + 26000; this.agents.set(id, a); out.push(a); }
    return out;
  }
  soldiersNear(p, n) { return [...this.agents.values()].filter((a) => a.kind === "soldier" && !a.goal).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, n); }

  effectVisual(e, fx, w, at) {
    const ok = e.ok !== false && fx.outcome !== "failure";
    const now = performance.now();
    const area = (r) => ({ x: at.x - r, y: at.y - r * 0.6, w: r * 2, h: r * 1.2 });
    if (!ok) {
      this.emit("sparks", area(5), 900, 2);
      this.label(fx.outcome === "failure" ? "Failed" : "…", at.x, at.y - 12, "#c9c9d6");
      return;
    }
    const look = e.look || "other";
    switch (e.block) {
      case "change_resource": {
        const field = e.resource === "fields" && PLACES[e.place]?.field;
        const zone = field ? { ...field } : area(8);
        if (!e.up && (look === "fire" || e.resource === "granary" && look !== "theft")) { this.emit("fire", zone, 9000, field ? 6 : 3); this.emit("smoke", zone, 11000, 2); this.label(field ? "Fields burning!" : "Fire!", at.x, at.y - 16, "#ff9a5a"); }
        else if (look === "poison" || (!e.up && e.resource === "water")) { this.emit("poison", area(5), 7000, 2); this.label("Water fouled", at.x, at.y - 12, "#a8d04a"); }
        else if (look === "flood") { this.emit("flood", zone, 7000, 5); this.label("Flood!", at.x, at.y - 14, "#8fd0ff"); }
        else if (e.up && (look === "build" || e.resource === "buildings" || e.resource === "wells")) { this.emit("build", area(4), 5000, 2); this.label(e.thing ? `+ ${e.thing}` : e.resource === "wells" ? "New wells" : "Built", at.x, at.y - 14, "#e9dfc3"); }
        else if (!e.up && (look === "destroy" || look === "violence" || e.resource === "buildings")) { this.emit("sparks", area(7), 2500, 4); this.emit("smoke", area(6), 6000, 1); this.label(e.place === "Varn" ? "The dam is struck!" : "Destroyed", at.x, at.y - 14, "#ff8a7a"); }
        else if (!e.up && e.resource === "people") { this.emit("sparks", area(8), 3000, 4); this.label("Bloodshed", at.x, at.y - 14, "#ff8a7a"); }
        else if (look === "ritual" || (e.up && e.resource === "people")) { for (let i = 0; i < 4; i++) this.effects.push({ ring: true, x: at.x + rand(-10, 10), y: at.y + rand(-6, 6), color: "#f6f2d0", born: now + i * 400, life: 2200, r0: 2, grow: 18 }); }
        else this.emit(e.up ? "cheer" : "jeer", area(10), 3000, 2);
        break;
      }
      case "fight": {
        this.emit("sparks", area(9), 3500, 5);
        if (e.personId != null) { const t = this.agents.get("m" + e.personId); if (t) this.effects.push({ ring: true, x: t.x, y: t.y, color: "#ff4a3a", born: now, life: 1600, r0: 2, grow: 14 }); }
        this.label(e.place === "Varn" ? "WAR WITH VARN" : e.personId != null ? "An attack!" : "Fighting!", at.x, at.y - 16, "#ff8a7a");
        break;
      }
      case "move_people": this.label(e.place === "Varn" ? "Over the ridge" : `To ${e.place}`, at.x, at.y - 12, "#e9dfc3"); break;
      case "recruit": case "spread_idea": {
        const color = e.ideaId ? ideaColor(e.ideaId) : look === "ritual" ? "#f6f2d0" : "#c9a7ff";
        const near = [...this.agents.values()].filter((a) => (a.kind === "citizen" || a.kind === "anon") && Math.hypot(a.x - at.x, a.y - at.y) < 40);
        for (let i = 0; i < Math.min(12, near.length); i++) { const a = near[Math.floor(rng() * near.length)]; this.effects.push({ ring: true, x: a.x, y: a.y - 1, color, born: now + i * 260, life: 1800, r0: 1, grow: 9 }); }
        if (e.block === "recruit") this.label(e.soldiers || fx.actorRole === "ruler" || fx.actorRole === "general" ? "Spearmen raised" : "Followers gather", at.x, at.y - 16, color);
        break;
      }
      case "suppress_idea": {
        const near = [...this.agents.values()].filter((a) => (a.kind === "citizen" || a.kind === "anon") && Math.hypot(a.x - at.x, a.y - at.y) < 40);
        for (let i = 0; i < Math.min(10, near.length); i++) { const a = near[Math.floor(rng() * near.length)]; this.effects.push({ ring: true, x: a.x, y: a.y - 1, color: "#6c6c78", born: now + i * 260, life: 1600, r0: 9, grow: -8 }); }
        this.label("Banned", at.x, at.y - 14, "#b9b9c9");
        break;
      }
      case "shift_opinion": this.emit(e.up ? "cheer" : "jeer", area(14), 3500, 3); break;
      case "relationship": {
        const color = { ally: "#f1d77a", love: "#ff9ec4", bribe: "#d8dde6", betray: "#ff4a3a", fear: "#c06cff", gift: "#f1d77a" }[look] || (e.up ? "#f1d77a" : "#ff4a3a");
        this.effects.push({ link: true, a: "m" + fx.actorId, b: "m" + e.personId, color, born: now, life: 6000 });
        break;
      }
      case "take_power": case "give_power": {
        const k = PLACES.Kessa;
        for (let i = 0; i < 3; i++) this.effects.push({ ring: true, x: k.x + 1, y: k.y - 20, color: "#ffffff", born: now + i * 500, life: 2400, r0: 2, grow: 26 });
        this.label(e.block === "take_power" ? "POWER SEIZED" : "Power handed over", k.x, k.y - 34, "#ffffff");
        break;
      }
      case "give_or_trade": {
        const src = e.from ? pointOf(e.from) : this.agents.get("m" + fx.actorId) || PLACES.Kessa;
        const dsts = e.place === "villages" ? ["Low Ford", "Reedmere", "Hollowmere"].map(pointOf) : [at];
        for (const d of dsts) this.carts.push({ x: src.x, y: src.y + 4, tx: d.x, ty: d.y, color: look === "bribe" ? "#d8dde6" : "#e6c75a", label: look === "bribe" ? "+silver" : "+grain" });
        break;
      }
      case "speak_to": break;
      default: if (e.thing) this.label(e.thing, at.x, at.y - 12, "#e9dfc3");
    }
  }

  emit(kind, zone, ms, rate) { this.emitters.push({ kind, ...zone, until: performance.now() + ms, rate }); }
  bubble(agent, text) { if (text) this.effects.push({ bubble: true, agent, text: String(text).slice(0, 110), born: performance.now(), life: 6500 }); }

  hit(x, y) {
    let best = null, bd = 6;
    for (const a of this.agents.values()) {
      if (a.kind !== "citizen" && a.kind !== "mind") continue;
      const d = Math.hypot(a.x - x, a.y - y + 1);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
}
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

export function drawLabels(ctx, scale, w) {
  ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
  const lab = (t, x, y) => { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillText(t, x * scale + 1, y * scale + 1); ctx.fillStyle = "#f3ead2"; ctx.fillText(t, x * scale, y * scale); };
  lab("Hollowmere", PLACES.Hollowmere.x, PLACES.Hollowmere.y - 22);
  lab("Reedmere", PLACES.Reedmere.x + 20, PLACES.Reedmere.y - 20);
  lab("Low Ford", PLACES["Low Ford"].x + 10, PLACES["Low Ford"].y - 22);
  lab("Kessa", PLACES.Kessa.x, PLACES.Kessa.y + 22);
  lab("Varn's dam", 438, 78);
  lab("to Varn →", 452, 150);
  if (w) {
    ctx.font = "10px system-ui, sans-serif";
    for (const st of w.structures || []) { const p = structurePos(w, st); const t = st.name.length > 22 ? st.name.slice(0, 21) + "…" : st.name; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(t, p.x * scale + 1, (p.y + 5) * scale + 1); ctx.fillStyle = "#e9dfc3"; ctx.fillText(t, p.x * scale, (p.y + 5) * scale); }
  }
}

const VARN = { x: 466, y: 150 };
function pointOf(name) { if (name === "Varn") return VARN; const p = PLACES[name]; return p ? { x: p.x, y: p.y + 4 } : PLACES.Kessa; }
function score(a, e) { return (a.rebel ? 2 : 0) + (a.ref && e.ideaId && (a.ref.idea === e.ideaId || a.ref.faith === e.ideaId) ? 3 : 0) + (a.believer ? 1 : 0) + rng(); }
const IDEA_COLORS = ["#c9a7ff", "#7fd1c7", "#ffb86b", "#9ad06a", "#ff8fb1", "#8fb8ff", "#f1d77a"];
export function ideaColor(id) { return IDEA_COLORS[(id - 1) % IDEA_COLORS.length]; }
function spawn(e) {
  const x = e.x + rng() * e.w, y = e.y + rng() * e.h;
  switch (e.kind) {
    case "fire": return { x, y, vx: rand(-0.08, 0.08), vy: rand(-0.35, -0.12), life: 26 + rng() * 22, color: pick(["#ffd34a", "#ff9a2a", "#ff5a1f", "#e0321a"]) };
    case "smoke": return { x, y: y - 3, vx: rand(-0.05, 0.12), vy: rand(-0.25, -0.1), life: 60 + rng() * 40, color: pick(["#4b4b4b", "#5d5d5d", "#3a3a3a"]), size: 2 };
    case "poison": return { x, y, vx: rand(-0.05, 0.05), vy: rand(-0.18, -0.06), life: 40 + rng() * 30, color: pick(["#9fd14a", "#6fae2a", "#c6e86a"]) };
    case "flood": return { x, y, vx: rand(-0.2, 0.2), vy: rand(-0.05, 0.1), life: 40 + rng() * 30, color: pick(["#4f9fd6", "#6fb6e6", "#3f86c4"]), size: 2 };
    case "build": return { x, y: y + 3, vx: 0, vy: rand(-0.12, -0.04), life: 30 + rng() * 20, color: pick(["#c9b086", "#9c7a54", "#d8d0b8"]) };
    case "sparks": return { x, y, vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.3), g: 0.02, life: 12 + rng() * 10, color: pick(["#ffffff", "#ffd34a", "#ff5a4a"]) };
    case "cheer": return { x, y, vx: rand(-0.03, 0.03), vy: rand(-0.3, -0.15), life: 30 + rng() * 15, color: pick(["#8fe08a", "#c6f0a0"]) };
    case "jeer": return { x, y, vx: rand(-0.03, 0.03), vy: rand(-0.3, -0.15), life: 30 + rng() * 15, color: pick(["#ff6a5a", "#ff9a8a"]) };
    default: return { x, y, vx: 0, vy: -0.2, life: 20, color: "#ffffff" };
  }
}
function wrap(text, n) { const out = []; let line = ""; for (const word of String(text).split(/\s+/)) { if ((line + " " + word).trim().length > n) { if (line) out.push(line); line = word; } else line = (line + " " + word).trim(); } if (line) out.push(line); if (out.length > 3) out[2] = out[2].slice(0, n - 1) + "…"; return out; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
