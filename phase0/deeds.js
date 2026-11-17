// The Demiurge – free-form deeds.
//
// A mind describes what it does in its own words. A translator (an AI call, or the
// keyword stand-in below) turns those words into a few generic building blocks.
// The code here then judges whether the deed works and applies the effects.
//
// The AI decides what a deed IS. The code decides what HAPPENS.

import { chron, remember, liveMinds, createOrUpdateIdea, arrestMind, succeed, bereave, ideaFollowers, rulerOf } from "./sim.js";

export const BLOCKS = ["change_resource", "move_people", "recruit", "fight", "shift_opinion", "spread_idea", "suppress_idea", "relationship", "take_power", "give_power", "give_or_trade", "speak_to"];
export const RESOURCES = ["food", "fields", "water", "wells", "granary", "soldiers", "buildings", "people", "trust", "none"];
export const LOOKS = ["fire", "poison", "flood", "build", "destroy", "gift", "theft", "violence", "persuade", "fear", "ritual", "ally", "betray", "bribe", "love", "other"];
const SCALES = { small: { need: 3, mag: 0.15 }, medium: { need: 20, mag: 0.3 }, large: { need: 60, mag: 0.5 } };

// The "forgiving" dial: bold deeds succeed more often and hit harder.
export const RULES = { successBonus: 0.15, effectScale: 1.25 };

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const round = Math.round;
const VILLAGES = (w) => Object.keys(w.villages);
const placeList = (w) => [...VILLAGES(w), "Kessa", "Varn", "none"];
const personList = (w) => [...liveMinds(w).map((m) => m.name), "the ruler", "the people", "none"];

// ---------------------------------------------------------------------------
// The translator prompt
// ---------------------------------------------------------------------------
export function translateSchema(w) {
  return {
    type: "object",
    properties: {
      summary: { type: "string", maxLength: 180 },
      possible: { type: "boolean" },
      impossible_reason: { type: "string", maxLength: 140 },
      scale: { enum: Object.keys(SCALES) },
      secret: { type: "boolean" },
      thing: { type: "string", maxLength: 40 },
      effects: {
        type: "array", minItems: 1, maxItems: 3,
        items: {
          type: "object",
          properties: {
            block: { enum: BLOCKS },
            place: { enum: placeList(w) },
            person: { enum: personList(w) },
            resource: { enum: RESOURCES },
            direction: { enum: ["increase", "decrease"] },
            look: { enum: LOOKS },
            text: { type: "string", maxLength: 160 },
          },
          required: ["block", "place", "person", "resource", "direction", "look", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "possible", "impossible_reason", "scale", "secret", "thing", "effects"],
    additionalProperties: false,
  };
}

export function buildTranslatePrompt(w, mind, d) {
  const people = liveMinds(w).map((m) => `${m.name} (${m.role === "foreign" ? "ruler of Varn" : m.role}, ${m.place})`).join("; ");
  const ideas = w.ideas.map((i) => i.name).join("; ") || "none yet";
  const user = `WORLD: Villages Low Ford, Reedmere and Hollowmere each have fields, drinking water, houses and people. Kessa is the hill-fort: the ruler's hall, the royal granary, the temple and the army. Varn is the rival kingdom over the eastern ridge; its dam holds back the river.
PEOPLE: ${people}.
IDEAS AND FAITHS: ${ideas}.
ACTOR: ${mind.name}, ${mind.role}, now in ${mind.place}. ${capacityText(w, mind)}
THE DEED, IN THEIR OWN WORDS: "${String(d.deed || "").slice(0, 400)}"

EFFECT BLOCKS:
- change_resource: add or remove something at a place. resource is one of: food (stored grain), fields (crops in the ground), water (drinking water; also Varn's dam), wells, granary (the royal grain at Kessa), soldiers, buildings (a shrine, hall, wall, monument, the dam), people (harm or help the inhabitants), trust.
- move_people: the actor goes to a place, or people resettle there.
- recruit: gather followers or fighters at a place.
- fight: attack a person or a place by force.
- shift_opinion: make people at a place trust "person" more (increase) or less (decrease).
- spread_idea / suppress_idea: preach, teach or ban an idea or faith. text = the idea in one sentence.
- relationship: make or break a bond with a person (look: ally, betray, bribe, fear for threats, love for marriage).
- take_power: seize rule of the valley. give_power: hand power to a person, or to councils if person is "none".
- give_or_trade: give or trade grain to a place or person. text = the terms.
- speak_to: a private message to a person. text = what is said.

RULES: Describe what the actor ATTEMPTS; the game decides if it works. Use 1 to 3 effects, most important first. Use "none" for place, person or resource when not relevant. look = how it appears (fire for burning, poison, flood, build, destroy, violence, persuade, ritual, gift, theft, and so on). scale = how many hands it needs: small (a few people), medium (dozens), large (an army or a whole village). secret = true if they try to do it unseen. possible = false ONLY if it needs magic or things that do not exist in this world (no guns, no flying, no commanding the weather); ambition, cruelty or risk are all possible.
Reply with JSON: {"summary" (what they attempt, past tense, starting with "${mind.name}", at most 25 words), "possible", "impossible_reason", "scale", "secret", "thing" (name of anything built or made, else ""), "effects": [{"block", "place", "person", "resource", "direction", "look", "text"}]}`;
  return {
    system: "You turn a character's intended deed into effects for a strategy game's simulation. You do not decide whether it succeeds; the game does. Reply ONLY with one JSON object.",
    user, schema: translateSchema(w),
  };
}

function capacityText(w, m) {
  const crew = crewOf(w, m);
  if (m.role === "ruler") return `They command about ${w.soldiers} soldiers and the royal granary.`;
  if (m.role === "general") return `They command the army of about ${w.soldiers} spearmen.`;
  if (m.role === "foreign") return `They rule Varn, with an army of about ${w.varn.army}.`;
  return crew > 10 ? `About ${round(crew)} people would follow them.` : "Few people follow them yet.";
}

// ---------------------------------------------------------------------------
// Who and how many stand behind the actor
// ---------------------------------------------------------------------------
function followersOf(w, m) {
  if (!m.ideaId) return 0;
  const idea = w.ideas.find((i) => i.id === m.ideaId);
  if (!idea) return 0;
  const f = ideaFollowers(w, idea);
  const here = w.villages[m.place] ? f.share[m.place] * w.villages[m.place].pop : 0;
  return here + (f.total - here) * 0.25;
}
export function crewOf(w, m) {
  const fol = followersOf(w, m);
  switch (m.role) {
    case "ruler": return w.soldiers * Math.max(0.3, w.loyalty) + fol;
    case "general": return w.soldiers * Math.max(0.4, w.loyalty);
    case "priest": return 15 + fol;
    case "merchant": return 12 + fol;
    case "foreign": return w.varn.army;
    default: return 3 + fol;
  }
}

// ---------------------------------------------------------------------------
// Judging a deed
// ---------------------------------------------------------------------------
function resolvePerson(w, name, actor) {
  if (!name || name === "none") return null;
  if (name === "the people") return null;
  if (name === "the ruler") return rulerOf(w);
  const live = liveMinds(w);
  return live.find((m) => m.name === name) || live.find((m) => m.name.toLowerCase().includes(String(name).toLowerCase().split(" ")[0])) || null;
}
function resolvePlace(w, place, actor) {
  if (place && place !== "none" && (w.villages[place] || place === "Kessa" || place === "Varn")) return place;
  return actor.place === "Varn" ? "Varn" : (w.villages[actor.place] ? actor.place : "Kessa");
}

function judge(w, m, t) {
  const s = SCALES[t.scale] || SCALES.medium;
  const crew = crewOf(w, m);
  const r = rulerOf(w);
  let p;
  if (t.effects.some((e) => e.block === "take_power") && m.role !== "ruler") {
    const defenders = m.role === "general" ? 20 : w.soldiers * w.loyalty * (w.generalSympathy ? 0.5 : 1);
    p = crew / (crew + defenders) + RULES.successBonus - (w.legitimacy - 0.5) * 0.4;
  } else {
    p = 0.3 + 0.5 * Math.min(1, crew / s.need) + RULES.successBonus;
    const hitsCrown = m.role !== "ruler" && t.effects.some((e) => e.place === "Kessa" || ["granary", "soldiers"].includes(e.resource) || (r && e.person === r.name) || e.person === "the ruler");
    if (hitsCrown) p -= 0.2 * w.loyalty * (t.secret ? 0.5 : 1);
  }
  p = clamp(p, 0.08, 0.92);
  const roll = w.rng();
  const outcome = roll < p ? "success" : roll < p + 0.2 ? "partial" : "failure";
  const mag = s.mag * RULES.effectScale * (outcome === "success" ? 1 : outcome === "partial" ? 0.5 : 0);
  const caught = !t.secret || w.rng.chance(outcome === "failure" ? 0.7 : 0.35);
  return { p, outcome, mag, crew, caught, scale: t.scale in SCALES ? t.scale : "medium" };
}

// ---------------------------------------------------------------------------
// Applying a deed
// ---------------------------------------------------------------------------
export function applyDeed(w, m, d, t) {
  m.lastAction = "deed"; m.lastSpeech = d.speech || ""; m.lastReason = d.reason || "";
  t = sanitize(w, m, t, d);
  m.lastDeed = t.summary;
  const fx = { actorId: m.id, actorRole: m.role, speech: d.speech || "", effects: [], outcome: null };

  if (t.possible === false) {
    const why = t.impossible_reason ? `: ${t.impossible_reason.replace(/\.$/, "")}` : "";
    chron(w, "act", `${m.name} tried to ${lowerDeed(d.deed)}, but it could not be done${why}.`, m.name);
    remember(m, `You tried: "${String(d.deed).slice(0, 120)}". It could not be done${why}.`);
    fx.outcome = "impossible";
    return fx;
  }

  const j = judge(w, m, t);
  fx.outcome = j.outcome; fx.scale = j.scale; fx.secret = t.secret; fx.caught = j.caught;
  const results = [];
  for (const e of t.effects.slice(0, 3)) {
    const r = applyEffect(w, m, e, j, t);
    if (r) { if (r.text) results.push(r.text); fx.effects.push(r.fx); }
  }
  const head = t.summary.replace(/\.$/, "");
  const tail = j.outcome === "success" ? (results.length ? ` ${results.join(" ")}` : " It worked.")
    : j.outcome === "partial" ? ` It only partly worked.${results.length ? " " + results.join(" ") : ""}`
    : ` It failed.${results.length ? " " + results.join(" ") : ""}`;
  const secrecy = t.secret ? (j.caught ? " Word got out who was behind it." : " No one learned who was behind it.") : "";
  chron(w, isMajor(t) ? "deed" : "act", `${head}.${tail}${secrecy}`, m.name);
  remember(m, `You ${lowerDeed(head.replace(new RegExp("^" + escapeRe(m.name) + "\\s*"), ""))}. ${j.outcome === "success" ? "It worked." : j.outcome === "partial" ? "It partly worked." : "It failed."}${t.secret ? (j.caught ? " People know it was you." : " No one knows it was you.") : ""}`);
  // The ruler hears of deeds that touch the realm.
  const r = rulerOf(w);
  if (r && r !== m && j.outcome !== "failure" && t.effects.some((e) => e.block !== "speak_to" && e.block !== "relationship")) {
    remember(r, j.caught ? `${m.name}: ${head.replace(new RegExp("^" + escapeRe(m.name) + "\\s*"), "")} (${j.outcome}).` : `Someone, unknown, struck: ${head.replace(new RegExp("^" + escapeRe(m.name) + "\\s*"), "")}.`);
  }
  return fx;
}

function isMajor(t) { return t.effects.some((e) => ["fight", "take_power", "give_power", "change_resource", "recruit"].includes(e.block)); }
function lowerDeed(s) { s = String(s || "").trim().replace(/\.$/, ""); return s ? s[0].toLowerCase() + s.slice(1) : "act"; }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function sanitize(w, m, t, d) {
  if (!t || typeof t !== "object") t = mockTranslate(w, m, d.deed);
  t.summary = String(t.summary || `${m.name} ${d.deed}`).trim();
  if (!t.summary.startsWith(m.name)) t.summary = `${m.name}: ${t.summary}`;
  t.effects = Array.isArray(t.effects) && t.effects.length ? t.effects : mockTranslate(w, m, d.deed).effects;
  t.effects = t.effects.filter((e) => e && BLOCKS.includes(e.block));
  if (!t.effects.length) t.effects = [{ block: "speak_to", place: "none", person: "the people", resource: "none", direction: "increase", look: "persuade", text: d.speech || "" }];
  if (!(t.scale in SCALES)) t.scale = "medium";
  return t;
}

// Each block. Returns { text, fx } where fx tells the map what to show.
function applyEffect(w, m, e, j, t) {
  const V = w.villages;
  const M = j.mag;
  const ok = j.outcome !== "failure";
  let P = resolvePlace(w, e.place, m);
  // Village-only things aimed at no particular village: pick the most restless one (or the hungriest).
  if (!V[P] && P !== "Varn" && ["fields", "food", "wells", "people", "water"].includes(e.resource) && !(e.resource === "water" && P === "Kessa") || (!V[P] && ["recruit", "spread_idea"].includes(e.block) && P === "Kessa" && !["ruler", "general", "priest"].includes(m.role))) {
    const vs = VILLAGES(w);
    const restless = (v) => w.citizens.filter((c) => c.alive && c.village === v && c.active).length;
    P = vs.slice().sort((a, b) => restless(b) - restless(a) || V[a].food - V[b].food)[0];
  }
  const X = resolvePerson(w, e.person, m);
  const up = e.direction !== "decrease";
  const fx = { block: e.block, look: e.look, place: P, personId: X?.id ?? null, resource: e.resource, ok, up, thing: t.thing || "" };
  const vil = V[P];
  const pct = (x) => `${Math.round(clamp(x) * 100)}%`;

  switch (e.block) {
    case "change_resource": {
      if (!ok) return { fx };
      switch (e.resource) {
        case "fields": {
          if (!vil) return { fx };
          if (up) { vil.fieldBoost = clamp((vil.fieldBoost || 0) + M); return { fx, text: `The fields of ${P} were tended well.` }; }
          const before = vil.fieldDamage || 0;
          vil.fieldDamage = clamp(before + M * 1.6);
          vil.fieldScar = e.look === "flood" ? "flood" : e.look === "poison" ? "poison" : e.look === "fire" ? "fire" : "ruin";
          return { fx, text: `About ${pct(vil.fieldDamage - before)} of ${P}'s crops were ${vil.fieldScar === "fire" ? "burned" : vil.fieldScar === "flood" ? "flooded" : "ruined"}.` };
        }
        case "food": {
          if (P === "Kessa") return granary(w, up, M, fx);
          if (!vil) return { fx };
          const amt = round(M * vil.pop * 0.8);
          vil.aid += up ? amt : -amt;
          return { fx, text: up ? `${P} gained about ${amt} sacks of food.` : `About ${amt} sacks of ${P}'s food were lost.` };
        }
        case "granary": return granary(w, up, M, fx);
        case "water": {
          if (P === "Varn") { w.dam = clamp(w.dam + (up ? -M : M)); return { fx, text: up ? `Varn's dam let more water through.` : `Varn's dam held back more of the river.` }; }
          if (!vil) return { fx };
          if (up) { vil.poisoned = 0; return { fx, text: `${P}'s water was made clean.` }; }
          vil.poisoned = 2; vil.poisonStrength = Math.max(vil.poisonStrength || 0, M);
          return { fx, text: `${P}'s drinking water was fouled.` };
        }
        case "wells": {
          if (!vil) return { fx };
          if (up) { if (vil.water === "river") { vil.wells = true; vil.wellsYear = w.year; } return { fx, text: `New wells were dug in ${P}.` }; }
          vil.wells = false; return { fx, text: `${P}'s wells were filled in.` };
        }
        case "buildings": {
          if (up) {
            const name = (t.thing || "a meeting hall").replace(/^(a|an|the)\s+/i, "");
            w.structures = w.structures || [];
            const same = w.structures.find((x) => x.place === P && x.name.toLowerCase() === name.toLowerCase());
            if (same) { same.size = (same.size || 1) + 1; return { fx, text: `The ${name} in ${P} was made grander.` }; }
            if (w.structures.filter((x) => x.place === P).length >= 4) w.structures.splice(w.structures.findIndex((x) => x.place === P), 1);
            w.structures.push({ name, place: P, ideaId: m.ideaId, builder: m.name, year: w.year, look: e.look, size: 1 });
            return { fx, text: `${/^[aeiou]/i.test(name) ? "An" : "A"} ${name} now stands in ${P}.` };
          }
          if (P === "Varn") { w.dam = clamp(w.dam - M * 1.5); w.varn.relation = clamp(w.varn.relation - 0.3, -1, 1); return { fx, text: w.dam < 0.1 ? `Varn's dam was broken; the river runs free.` : `Varn's dam was damaged.` }; }
          const s = (w.structures || []).findIndex((x) => x.place === P);
          if (s >= 0) { const gone = w.structures.splice(s, 1)[0]; return { fx, text: `The ${gone.name} in ${P} was destroyed.` }; }
          if (P === "Kessa") { w.granary = Math.max(0, w.granary - M * 200); w.legitimacy = clamp(w.legitimacy - M * 0.3); return { fx, text: `Part of Kessa was destroyed.` }; }
          return { fx, text: `Houses in ${P} were wrecked.` };
        }
        case "soldiers": {
          if (up) {
            if (m.role === "ruler" || m.role === "general") { const n = round(M * 80); w.soldiers += n; for (const v of VILLAGES(w)) V[v].pop = Math.max(20, V[v].pop - n / 3); return { fx, text: `${n} more spearmen joined the army.` }; }
            w.flags.rebelBoost += M; return { fx, text: `A band of armed followers formed.` };
          }
          const n = round(w.soldiers * M * 0.5); w.soldiers = Math.max(10, w.soldiers - n); w.loyalty = clamp(w.loyalty - M * 0.3);
          return { fx, text: `${n} soldiers were lost.` };
        }
        case "people": {
          if (!vil) return { fx };
          if (up) { vil.aid += round(M * vil.pop * 0.5); w.flags.careThisYear = true; return { fx, text: `The people of ${P} were cared for.` }; }
          const n = round(vil.pop * M * 0.12); vil.pop = Math.max(20, vil.pop - n); vil.martyr = 3;
          for (const c of w.citizens) if (c.alive && c.village === P) c.grief = clamp(c.grief + 0.3);
          return { fx, text: `About ${n} people of ${P} were killed.` };
        }
        case "trust": return opinion(w, m, X, up, M, P, fx);
        default: return { fx };
      }
    }

    case "move_people": {
      if (P === "Varn") { if (m.role !== "foreign") remember(m, `You crossed into Varn.`); return { fx, text: `${m.name} crossed the ridge into Varn and returned.` }; }
      const from = m.place;
      if (m.role !== "foreign") m.place = P;
      if (ok && j.scale !== "small" && V[from] && V[P] && from !== P) {
        const n = round(V[from].pop * M * 0.3); V[from].pop -= n; V[P].pop += n;
        return { fx: { ...fx, from }, text: `About ${n} people moved from ${from} to ${P}.` };
      }
      return { fx: { ...fx, from }, text: from !== P ? `${m.name} went to ${P}.` : "" };
    }

    case "recruit": {
      if (!ok) return { fx };
      if (m.role === "ruler" || m.role === "general") {
        const n = round(M * 60); w.soldiers += n; if (vil) vil.pop = Math.max(20, vil.pop - n);
        return { fx, text: `${n} new spearmen were raised${vil ? ` from ${P}` : ""}.` };
      }
      let idea = m.ideaId ? w.ideas.find((i) => i.id === m.ideaId) : null;
      if (!idea) idea = createOrUpdateIdea(w, m, e.text || `Follow ${m.name}.`, { kind: "politics" });
      if (!idea) return { fx };
      const slot = idea.kind === "faith" ? "faith" : "idea";
      let n = 0;
      for (const c of w.citizens) if (c.alive && !c.jailed && (vil ? c.village === P : true) && c[slot] !== idea.id && w.rng.chance(M * 1.6)) { c[slot] = idea.id; n++; }
      if (idea.kind === "politics") w.flags.rebelBoost += M * 0.5;
      const people = vil ? round(n * vil.pop / 12) : n * 20;
      return { fx: { ...fx, ideaId: idea.id }, text: n ? `About ${people} people ${vil ? `of ${P} ` : ""}joined ${idea.name}.` : `Few joined.` };
    }

    case "fight": {
      if (X && X !== m) {
        fx.personId = X.id;
        if (j.outcome === "success") {
          X.alive = false; X.fate = `slain by ${m.name} in ${w.year}`;
          chron(w, "death", `${X.name} was slain by ${j.caught ? m.name : "unknown hands"}.`, X.name);
          for (const o of liveMinds(w)) if (o.role !== "foreign" || X.role === "foreign") remember(o, `${X.name} was killed${j.caught ? ` by ${m.name}` : ""}.`);
          if (X.role === "ruler") w.legitimacy = clamp(w.legitimacy - 0.1);
          succeed(w, X);
          return { fx, text: "" };
        }
        if (j.outcome === "partial") { remember(X, `${j.caught ? m.name : "Someone"} attacked you; you survived, wounded.`); return { fx, text: `${X.name} survived, wounded.` }; }
        remember(X, `${j.caught ? m.name : "Someone"} tried to attack you.`);
        if (j.caught && m.role !== "ruler" && rulerOf(w) && w.rng.chance(0.5)) { arrestMind(w, m, `caught after attacking ${X.name}`); return { fx, text: "" }; }
        return { fx, text: `${X.name} was unharmed.` };
      }
      if (P === "Varn") {
        if (m.role === "ruler" || m.role === "general") { w.flags.attackVarn = m; return { fx, text: `The army marched on Varn.` }; }
        w.varn.relation = clamp(w.varn.relation - 0.2, -1, 1);
        if (ok && (e.look === "fire" || e.look === "destroy" || e.resource === "buildings" || e.resource === "water")) { w.dam = clamp(w.dam - M * 0.8); return { fx, text: `The raiders damaged Varn's dam.` }; }
        return { fx, text: ok ? `The raid stung Varn.` : "" };
      }
      if (m.role === "foreign") { w.flags.invasion = true; return { fx, text: `Varn's army crossed the ridge.` }; }
      if (P === "Kessa" && m.role !== "ruler") {
        w.flags.uprisingCalls.push(m); w.flags.rebelBoost += M;
        return { fx, text: `${m.name}'s people rose against Kessa.` };
      }
      if (vil && ok) {
        const n = round(vil.pop * M * 0.1); vil.pop = Math.max(20, vil.pop - n); vil.martyr = 3;
        for (const c of w.citizens) if (c.alive && c.village === P) { c.grief = clamp(c.grief + 0.25); if (c.active && w.rng.chance(M)) { c.jailed = 2; c.active = false; } }
        if (m.role === "ruler" || m.role === "general") w.legitimacy = clamp(w.legitimacy - 0.05);
        return { fx, text: `About ${n} people of ${P} fell.` };
      }
      return { fx };
    }

    case "shift_opinion": return ok ? opinion(w, m, X, up, M, P, fx) : { fx };

    case "spread_idea": {
      const kind = ["priest", "prophet"].includes(m.role) || e.look === "ritual" || /\bgods?\b|spirit|moon|holy|divine/i.test(e.text || "") ? "faith" : "politics";
      const idea = createOrUpdateIdea(w, m, e.text || t.summary, { kind }) || (m.ideaId && w.ideas.find((i) => i.id === m.ideaId));
      if (!idea) return { fx };
      w.flags.speaking = [...(w.flags.speaking || []), m];
      if (!ok) return { fx: { ...fx, ideaId: idea.id } };
      const slot = idea.kind === "faith" ? "faith" : "idea";
      let n = 0;
      for (const c of w.citizens) if (c.alive && (vil ? c.village === P : true) && c[slot] !== idea.id && w.rng.chance(M * 1.2)) { c[slot] = idea.id; n++; }
      return { fx: { ...fx, ideaId: idea.id }, text: n ? `${idea.name} won new followers${vil ? ` in ${P}` : ""}.` : "" };
    }

    case "suppress_idea": {
      const words = String(e.text || "").toLowerCase();
      let idea = (X && X.ideaId && w.ideas.find((i) => i.id === X.ideaId))
        || w.ideas.find((i) => words && (words.includes(i.name.toLowerCase().replace(/^the /, "")) || words.includes(i.founder.toLowerCase().split(" ")[0])))
        || w.ideas.filter((i) => i.id !== m.ideaId).sort((a, b) => ideaFollowers(w, b).total - ideaFollowers(w, a).total)[0];
      if (!idea || !ok) return { fx };
      const slot = idea.kind === "faith" ? "faith" : "idea";
      let n = 0;
      for (const c of w.citizens) if (c.alive && c[slot] === idea.id && (vil ? c.village === P : true) && w.rng.chance(M * 1.5)) { c[slot] = null; c.active = false; n++; }
      if (m.role === "ruler") w.arrestRisk = clamp(w.arrestRisk + 0.15);
      const founder = w.minds.find((x) => x.id === idea.founderId);
      if (founder && founder.alive && founder !== m && m.role === "ruler" && j.outcome === "success" && w.rng.chance(M)) arrestMind(w, founder, `seized for spreading ${idea.name}`);
      return { fx: { ...fx, ideaId: idea.id }, text: n ? `Many abandoned ${idea.name}.` : `${idea.name} held on.` };
    }

    case "relationship": {
      if (!X || X === m) return { fx };
      const warm = ["ally", "love", "bribe", "gift"].includes(e.look) || (up && !["betray", "fear"].includes(e.look));
      w.bonds = w.bonds || {};
      const key = [m.id, X.id].sort().join("|");
      w.bonds[key] = clamp((w.bonds[key] || 0) + (warm ? 0.4 : -0.4), -1, 1);
      const verb = e.look === "love" ? "sought a marriage with" : e.look === "bribe" ? "bribed" : e.look === "betray" ? "betrayed" : e.look === "fear" ? "threatened" : warm ? "sought an alliance with" : "turned against";
      remember(X, `${m.name} ${verb} you.${e.text ? ` "${String(e.text).slice(0, 120)}"` : ""}`);
      if (X.role === "foreign") w.varn.relation = clamp(w.varn.relation + (warm ? 0.2 : -0.2) * (ok ? 1 : 0.3), -1, 1);
      if (ok && X.role === "general" && m.role !== "ruler" && warm) w.generalSympathy = true;
      if (ok && X.role === "general" && m.role === "ruler") w.loyalty = clamp(w.loyalty + (warm ? 0.1 : -0.1));
      return { fx, text: ok ? `${X.name} ${warm ? "was won over" : "now counts them an enemy"}.` : `${X.name} was not moved.` };
    }

    case "take_power": {
      if (m.role === "ruler") return { fx };
      const r = rulerOf(w);
      if (j.outcome === "success") {
        if (r) { r.alive = false; r.fate = `overthrown by ${m.name} in ${w.year}`; }
        const idea = m.ideaId ? w.ideas.find((i) => i.id === m.ideaId) : null;
        const prevRole = m.role;
        if (prevRole === "general") w.government = { type: "military", name: `the army under ${m.name}`, councils: w.government.councils };
        else if (prevRole === "priest" || prevRole === "prophet") w.government = { type: "theocracy", name: `the temple under ${m.name}`, councils: false, ideaId: idea?.id };
        else if (prevRole === "foreign") w.government = { type: "conquest", name: `the governors of Varn`, councils: false };
        else w.government = idea ? { type: "council", name: `the councils of ${idea.name}`, councils: true, ideaId: idea.id } : { type: "usurper", name: `the rule of ${m.name}`, councils: false };
        if (prevRole !== "foreign") { m.role = "ruler"; m.place = "Kessa"; m.title = `${m.name}, ruler of the valley`; m.goals += "; hold the power you seized"; }
        w.legitimacy = 0.45; w.arrestRisk = 0.2; for (const c of w.citizens) c.active = false;
        chron(w, "revolution", `${m.name} seized power${r ? ` from ${r.name}` : ""}. The valley is now ruled by ${w.government.name}.`, m.name);
        for (const o of liveMinds(w)) if (o !== m) remember(o, `${m.name} seized power; the valley is ruled by ${w.government.name}.`);
        return { fx, text: "" };
      }
      if (j.outcome === "partial") { w.legitimacy = clamp(w.legitimacy - 0.1); return { fx, text: `Some joined ${m.name}, but the seat of power held.` }; }
      if (j.caught && r && w.rng.chance(0.6)) { arrestMind(w, m, "taken while trying to seize power"); return { fx, text: "" }; }
      return { fx, text: `${m.name} escaped into hiding.` };
    }

    case "give_power": {
      if (m.role !== "ruler") return { fx };
      if (X && X !== m && X.role !== "foreign") {
        m.role = "organizer"; m.title = m.name;
        X.role = "ruler"; X.place = "Kessa"; X.title = `${X.name}, ruler of the valley`;
        const idea = X.ideaId ? w.ideas.find((i) => i.id === X.ideaId) : null;
        w.government = { type: idea ? "council" : "usurper", name: idea ? `the councils of ${idea.name}` : `the rule of ${X.name}`, councils: !!idea, ideaId: idea?.id };
        chron(w, "revolution", `${m.name} handed power to ${X.name}. The valley is now ruled by ${w.government.name}.`, m.name);
        for (const o of liveMinds(w)) remember(o, `${m.name} gave up power to ${X.name}.`);
        return { fx, text: "" };
      }
      w.government.councils = true; w.tax = Math.min(w.tax, 0.15); w.legitimacy = clamp(w.legitimacy + 0.15);
      if (j.scale === "large") { w.government = { type: "council", name: "the village councils", councils: true, ideaId: m.ideaId }; m.title = `Speaker of the Valley Council, ${m.name}`; }
      else w.government.name = `${w.government.name.replace(/ with village councils$/, "")} with village councils`;
      return { fx, text: `The villages were given councils of their own.` };
    }

    case "give_or_trade": {
      if (!ok) return { fx };
      const amt = round(M * 200);
      const fromCrown = m.role === "ruler";
      if (fromCrown && w.granary < amt) return { fx, text: `The granary was too empty to give much.` };
      if (fromCrown) w.granary -= amt;
      if (P === "Varn" || X?.role === "foreign") {
        w.varn.relation = clamp(w.varn.relation + 0.15, -1, 1);
        if (amt >= 80 && w.varn.pendingDemand) { w.varn.pendingDemand = false; w.varn.unpaid = 0; }
        return { fx: { ...fx, place: "Varn" }, text: `About ${amt} sacks went to Varn.` };
      }
      if (X && X.role === "general") w.loyalty = clamp(w.loyalty + 0.1);
      if (vil) { vil.aid += amt; return { fx, text: `About ${amt} sacks of grain reached ${P}.` }; }
      if (P === "Kessa") { w.granary += fromCrown ? amt : amt * 0.5; return { fx, text: `Grain reached Kessa.` }; }
      return { fx };
    }

    case "speak_to": {
      if (!X || X === m) return { fx, text: "" };
      X.inbox = X.inbox || [];
      X.inbox.push({ from: m.name, text: String(e.text || m.lastSpeech || "").slice(0, 220), year: w.year });
      if (X.inbox.length > 3) X.inbox.shift();
      return { fx: { ...fx, ok: true }, text: "" };
    }
    default: return { fx };
  }
}

function granary(w, up, M, fx) {
  if (up) { const n = round(M * 300); w.granary += n; return { fx: { ...fx, place: "Kessa" }, text: `About ${n} sacks were added to the royal granary.` }; }
  const n = round(Math.min(w.granary, w.granary * M * 0.6 + 20)); w.granary -= n;
  return { fx: { ...fx, place: "Kessa" }, text: `About ${n} sacks of the royal granary were lost.` };
}

function opinion(w, m, X, up, M, P, fx) {
  const r = rulerOf(w);
  const local = !!w.villages[P];
  if (!X || X === r) { w.legitimacy = clamp(w.legitimacy + (up ? 1 : -1) * M * (local ? 0.25 : 0.35)); return { fx, text: up ? `Trust in ${w.government.name} grew.` : `Trust in ${w.government.name} fell.` }; }
  if (X.role === "general") { w.loyalty = clamp(w.loyalty + (up ? 1 : -1) * M * 0.3); return { fx, text: up ? `The soldiers thought better of ${X.name}.` : `The soldiers began to doubt ${X.name}.` }; }
  X.standing = clamp((X.standing || 0) + (up ? M : -M), -1, 1);
  remember(X, `People${local ? ` in ${P}` : ""} now think ${up ? "better" : "worse"} of you.`);
  return { fx, text: up ? `${X.name}'s name rose${local ? ` in ${P}` : ""}.` : `${X.name}'s name was blackened${local ? ` in ${P}` : ""}.` };
}

// ---------------------------------------------------------------------------
// Keyword stand-in translator (for testing without a model, and as a fallback)
// ---------------------------------------------------------------------------
export function mockTranslate(w, m, deed) {
  const s = String(deed || "").toLowerCase();
  const place = [...VILLAGES(w), "Kessa", "Varn"].find((p) => s.includes(p.toLowerCase())) || "none";
  const STOP = new Set(["of", "the", "king", "queen", "general", "high", "priest", "priestess", "captain", "monarch", "prince", "lord", "protector", "speaker", "grain", "merchant", "trader", "low", "ford", "reedmere", "hollowmere", "varn", "valley", "council"]);
  const keys = (x) => x.name.toLowerCase().split(/[\s,]+/).filter((k) => k.length > 2 && !STOP.has(k));
  const person = liveMinds(w).find((x) => x !== m && keys(x).some((k) => new RegExp(`\\b${k}\\b`).test(s)))
    || (/\bthe (king|ruler|crown|queen)\b/.test(s) ? rulerOf(w) : null)
    || (/\bthe (general|army commander|captain)\b/.test(s) ? liveMinds(w).find((x) => x.role === "general") : null)
    || (/\bthe (high )?priest(ess)?\b/.test(s) ? liveMinds(w).find((x) => x.role === "priest") : null);
  const P = person && person !== m ? person.name : "none";
  const E = (block, resource = "none", direction = "decrease", look = "other", text = "", pl = place, pe = P) => ({ block, place: pl, person: pe, resource, direction, look, text });
  const effects = [];
  if (/burn|set fire|torch/.test(s)) effects.push(E("change_resource", /granary/.test(s) ? "granary" : /dam/.test(s) ? "buildings" : "fields", "decrease", "fire"));
  if (/poison|foul/.test(s)) effects.push(E("change_resource", "water", "decrease", "poison"));
  if (/flood|break the dam|destroy the dam|smash the dam/.test(s)) effects.push(E("change_resource", "buildings", "decrease", "destroy", "", "Varn"));
  if (/build|raise a|erect|construct/.test(s)) effects.push(E("change_resource", "buildings", "increase", "build"));
  if (/kill|assassin|murder|slay/.test(s) && person) effects.push(E("fight", "none", "decrease", "violence"));
  if (/seize|overthrow|take the throne|take power/.test(s)) effects.push(E("take_power", "none", "increase", "violence", "", "Kessa", "the ruler"));
  if (/preach|teach|spread/.test(s)) effects.push(E("spread_idea", "none", "increase", "persuade", deed));
  if (/ban|forbid|outlaw|suppress/.test(s)) effects.push(E("suppress_idea", "none", "decrease", "fear", deed));
  if (/recruit|rally|gather/.test(s)) effects.push(E("recruit", "none", "increase", "persuade", deed));
  if (/give|send grain|feed|share/.test(s)) effects.push(E("give_or_trade", "food", "increase", "gift", deed));
  if (/bribe|ally|befriend|marry|threaten|betray/.test(s) && person) effects.push(E("relationship", "none", /threaten|betray/.test(s) ? "decrease" : "increase", /bribe/.test(s) ? "bribe" : /marry/.test(s) ? "love" : /threaten/.test(s) ? "fear" : /betray/.test(s) ? "betray" : "ally", deed));
  if (/slander|rumou?r|shame/.test(s)) effects.push(E("shift_opinion", "none", "decrease", "persuade"));
  if (/go to|travel|march to|move to/.test(s) && place !== "none") effects.unshift(E("move_people", "none", "increase", "other"));
  if (/tell|warn|write to|send word/.test(s) && person) effects.push(E("speak_to", "none", "increase", "persuade", deed));
  // No recognisable deed: treat it as building the actor's own standing, without inventing an idea from the words.
  if (!effects.length) effects.push(E("shift_opinion", "none", "increase", "persuade", "", place, m.name));
  return {
    summary: `${m.name} tried to ${lowerDeed(deed).slice(0, 140)}`,
    possible: !/lightning|fly|summon|magic|curse the/.test(s), impossible_reason: "no mortal can do that",
    scale: /army|whole|all the|every/.test(s) ? "large" : /alone|myself|quietly/.test(s) ? "small" : "medium",
    secret: /secret|night|quietly|unseen|in disguise/.test(s), thing: (s.match(/build (?:a|an) ([a-z ]{3,30}?)(?: in| at| for|$|,|\.)/) || [])[1] || "",
    effects: effects.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// What the map shows for the usual (listed) actions
// ---------------------------------------------------------------------------
const LISTED = {
  open_granary: ["give_or_trade", "gift", "Kessa→villages"], distribute_temple_grain: ["give_or_trade", "gift", "Kessa→Low Ford"], donate_grain: ["give_or_trade", "gift", "here→Low Ford"],
  crack_down: ["fight", "violence", "soldiers→villages"], hold_public_ritual: ["spread_idea", "ritual", "Kessa"], hold_rain_ritual: ["spread_idea", "ritual", "Kessa"],
  preach_obedience: ["spread_idea", "persuade", "here"], preach_against_the_ruler: ["shift_opinion", "persuade", "here"], declare_omen: ["spread_idea", "ritual", "here"],
  preach_the_vision: ["spread_idea", "ritual", "here"], speak_out_publicly: ["shift_opinion", "persuade", "here"], organize_neighbors_secretly: ["recruit", "persuade", "here"],
  start_uprising: ["recruit", "violence", "here"], dig_wells: ["change_resource", "build", "event"], prepare_war: ["recruit", "violence", "Kessa"],
  attack_varn: ["fight", "violence", "soldiers→Varn"], invade_oren: ["fight", "violence", "Varn→Kessa"], sell_grain_to_varn: ["give_or_trade", "theft", "here→Varn"],
  send_envoy_to_varn: ["move_people", "other", "Kessa→Varn"], tend_the_sick: ["change_resource", "ritual", "Low Ford"], pay_varn_tribute: ["give_or_trade", "gift", "Kessa→Varn"],
  grant_village_councils: ["give_power", "persuade", "Kessa"], seize_power: ["take_power", "violence", "Kessa"], fund_rebels: ["give_or_trade", "bribe", "here→villages"],
};
export function listedFx(w, m, action, eventText = "") {
  const spec = LISTED[action];
  const fx = { actorId: m.id, actorRole: m.role, speech: m.lastSpeech || "", effects: [], outcome: "success", scale: "medium", listed: true };
  if (!spec) return fx;
  const [block, look, route] = spec;
  const here = w.villages[m.place] ? m.place : "Kessa";
  const named = [...VILLAGES(w), "Kessa", "Varn"].find((p) => eventText.includes(p));
  let [from, to] = route.includes("→") ? route.split("→") : [null, route];
  const fix = (p) => p === "here" ? here : p === "event" ? (named || here) : p === "villages" ? (block === "give_or_trade" ? "villages" : named && named !== "Kessa" ? named : "Low Ford") : p === "soldiers" ? "Kessa" : p;
  to = fix(to); from = from ? fix(from) : null;
  fx.effects.push({ block, look, place: to, from, ok: true, up: true, resource: action === "dig_wells" ? "wells" : "none", soldiers: route.startsWith("soldiers"), ideaId: m.ideaId });
  return fx;
}
