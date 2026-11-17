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
  ctx.fillStyle = w.government.type === "monarchy" ? "#c9a227" : w.government.type === "military" ? "#8a2b2b" : "#3d7ab8"; ctx.fillRect(k.x - 1, k.y - 22, 1, 6); ctx.fillRect(k.x, k.y - 22, 4, 3);
  ctx.fillStyle = "#d8d0b8"; ctx.fillRect(k.x + 8, k.y + 2, 6, 6); ctx.fillStyle = "#b48ee0"; ctx.fillRect(k.x + 10, k.y, 2, 2);
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
  constructor() { this.agents = new Map(); this.effects = []; this.march = null; }

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
      const place = ["ruler", "general", "priest"].includes(m.role) ? "Kessa" : (PLACES[m.place] ? m.place : "Kessa");
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
    for (const id of [...this.agents.keys()]) if (!keep.has(id)) this.agents.delete(id);
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
    if (this.march && now > this.march.until) this.march = null;
    for (const a of this.agents.values()) {
      if (a.wait > 0) { a.wait--; continue; }
      if (a.tx === null) this.pickTarget(a);
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const sp = a.speed * (this.march && (a.rebel || a.kind === "soldier") ? 2.2 : 1);
      if (d < 1) { a.tx = null; a.wait = rand(30, 200); }
      else { a.x += (dx / d) * sp; a.y += (dy / d) * sp; }
    }
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
      if (a.kind === "mind") body = a.ref?.role === "prophet" ? "#e6e6ff" : a.ref?.role === "priest" ? "#b48ee0" : "#e0b354";
      if (a.rebel) body = "#e0463e";
      ctx.fillStyle = body; ctx.fillRect(x - 1, y - 1, 2, 3);
      ctx.fillStyle = a.sick ? "#9fd17a" : "#e6c29a"; ctx.fillRect(x - 1, y - 3, 2, 2);
      if (a.kind === "soldier") { ctx.fillStyle = "#cfcfcf"; ctx.fillRect(x + 1, y - 5, 1, 6); }
      if (a.kind === "mind") { ctx.fillStyle = "#fff2b3"; ctx.fillRect(x - 1, y - 4, 2, 1); }
      if (a.believer) { ctx.fillStyle = "rgba(255,255,220,.7)"; ctx.fillRect(x, y - 5, 1, 1); }
      if (a.id === selectedId) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 5.5, 7, 10); }
    }
  }

  drawEffects(ctx, scale) {
    const now = performance.now();
    this.effects = this.effects.filter((e) => now - e.born < e.life);
    for (const e of this.effects) {
      const t = (now - e.born) / e.life;
      ctx.globalAlpha = 1 - t;
      if (e.ring) { ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x * scale, e.y * scale, 6 + t * 40, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillText(e.text, e.x * scale + 1, (e.y - t * 12) * scale + 1); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x * scale, (e.y - t * 12) * scale); }
      ctx.globalAlpha = 1;
    }
  }

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

export function drawLabels(ctx, scale) {
  ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center";
  const lab = (t, x, y) => { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillText(t, x * scale + 1, y * scale + 1); ctx.fillStyle = "#f3ead2"; ctx.fillText(t, x * scale, y * scale); };
  lab("Hollowmere", PLACES.Hollowmere.x, PLACES.Hollowmere.y - 22);
  lab("Reedmere", PLACES.Reedmere.x + 20, PLACES.Reedmere.y - 20);
  lab("Low Ford", PLACES["Low Ford"].x + 10, PLACES["Low Ford"].y - 22);
  lab("Kessa", PLACES.Kessa.x, PLACES.Kessa.y + 22);
  lab("Varn's dam", 438, 78);
  lab("to Varn →", 452, 150);
}
