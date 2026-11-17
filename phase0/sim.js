// The Demiurge – Phase 0 simulation core.
// Pure JavaScript, no browser APIs, so it can be tested in Node with a mock mind.
//
// The world owns the rules (weather, the dam, harvests, hunger, fever, legitimacy).
// Minds describe what they do in their own words. Usual deeds map to a known action;
// anything else is translated into building blocks and judged in deeds.js.
import { applyDeed, buildTranslatePrompt, mockTranslate, listedFx } from "./deeds.js";

// ---------------------------------------------------------------------------
// Random numbers (seeded so a run can be repeated)
// ---------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.normal = (mean = 0, sd = 1) => {
    const u = Math.max(1e-9, rng()), v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const round = (x) => Math.round(x);

// ---------------------------------------------------------------------------
// Static world description shared by every prompt
// ---------------------------------------------------------------------------
export const WORLD_TEXT = `The Valley of Oren: a river valley ruled from the hill-fort of Kessa. Villages: Low Ford (on the river, furthest downstream), Reedmere (on the river) and Hollowmere (in the hills, drinks from a spring).
This world is not Earth. Two moons: Ilu (pale, fast) and Varo (red, slow). People grow marrowgrain and keep woolly hessbeasts. Copper-like greenstone is mined in the hills.
Across the eastern ridge lies the larger kingdom of Varn, which has built a stone dam on the upper river.`;

export const SYSTEM_TEXT = `You are simulating one inhabitant of a fictional world for a strategy game. Think only with this character's knowledge, personality and goals. The character may be wrong, biased or selfish. Never mention being an AI or a game. Reply ONLY with one JSON object.`;

const CAUSES = ["the_gods", "the_ruler", "varn_dam", "the_moons", "bad_water", "witchcraft", "nature", "unknown"];

// ---------------------------------------------------------------------------
// Roles and their actions
// ---------------------------------------------------------------------------
export const ROLE_ACTIONS = {
  ruler: ["pay_varn_tribute", "attack_varn", "raise_taxes", "lower_taxes", "open_granary", "crack_down", "hold_public_ritual", "dig_wells", "send_envoy_to_varn", "accept_varn_offer", "reject_varn_offer", "prepare_war", "grant_village_councils", "do_nothing"],
  general: ["obey_the_ruler", "feed_soldiers_first", "advise_peace", "advise_war", "secretly_contact_rebels", "seize_power", "do_nothing"],
  priest: ["preach_obedience", "preach_against_the_ruler", "hold_rain_ritual", "declare_omen", "distribute_temple_grain", "tend_the_sick", "do_nothing"],
  organizer: ["organize_neighbors_secretly", "speak_out_publicly", "hide_grain", "petition_the_ruler", "dig_wells", "start_uprising", "flee_valley", "do_nothing"],
  merchant: ["sell_grain_to_varn", "sell_grain_at_high_price", "donate_grain", "fund_rebels", "fund_the_ruler", "hoard_and_wait"],
  prophet: ["preach_the_vision", "speak_out_publicly", "organize_neighbors_secretly", "petition_the_ruler", "dig_wells", "start_uprising", "flee_valley", "do_nothing"],
  foreign: ["offer_grain_for_mines", "open_the_dam", "raise_the_dam", "demand_tribute", "fund_rebels_in_oren", "invade_oren", "wait"],
};

// ---------------------------------------------------------------------------
// Starting world
// ---------------------------------------------------------------------------
const FIRST_NAMES = ["Arn", "Bessa", "Cole", "Dara", "Edrin", "Fenna", "Gorm", "Hale", "Iska", "Joss", "Kerra", "Lio", "Mira", "Nob", "Orla", "Pell", "Quin", "Rhea", "Sorn", "Tamsin", "Ulf", "Vena", "Wynn", "Yara", "Bram", "Cira", "Dov", "Elsa", "Fitch", "Greta", "Holt", "Ivy", "Jory", "Kael", "Lune", "Marek"];
const JOBS = ["farmer", "farmer", "farmer", "herder", "potter", "weaver", "miner", "farmer"];
const TRAITS = ["stubborn", "timid", "pious", "hot-tempered", "kind", "greedy", "clever", "loyal", "bitter", "hopeful", "proud", "cautious"];

export function createWorld(seed = 214) {
  const rng = makeRng(seed);
  const w = {
    seed, rng, year: 214,
    rain: 0.55, droughtLeft: 2,
    dam: 0.6,                      // 0 = open, 1 = fully closed
    tax: 0.2, granary: 260, soldiers: 120, loyalty: 0.6,
    legitimacy: 0.42, arrestRisk: 0.35,
    warReady: false, generalSympathy: false, mines: "oren",
    government: { type: "monarchy", name: "the crown of Oren", councils: false },
    varn: { relation: -0.2, army: 240, pendingOffer: null, pendingDemand: false, tributeOwed: 0, aidToRebels: 0 },
    villages: {
      "Low Ford": { pop: 260, water: "river", downstream: true, wells: false, food: 1, sick: 0, deaths: 0, feverDeaths: 0, hunger: 0, stock: 20, aid: 0, martyr: 0 },
      "Reedmere": { pop: 240, water: "river", downstream: false, wells: false, food: 1, sick: 0, deaths: 0, feverDeaths: 0, hunger: 0, stock: 30, aid: 0, martyr: 0 },
      "Hollowmere": { pop: 220, water: "spring", downstream: false, wells: false, food: 1, sick: 0, deaths: 0, feverDeaths: 0, hunger: 0, stock: 40, aid: 0, martyr: 0 },
    },
    kessaPop: 40,
    citizens: [],
    minds: [],
    ideas: [],
    chronicle: [],        // { year, kind, text, who? }
    history: [],          // per-year stats
    yearEvents: [],
    flags: { rebelBoost: 0, ritualThisYear: false, careThisYear: false, publicSpeakers: new Set(), uprisingCalls: [] },
    nextMindId: 1,
    ended: false,
    god: { power: 100, max: 100, believers: 0, acts: [] },
    structures: [], bonds: {},
  };

  // Named citizens: 12 per village.
  let n = 0;
  for (const v of Object.keys(w.villages)) {
    for (let i = 0; i < 12; i++) {
      w.citizens.push({
        id: n, name: FIRST_NAMES[n % FIRST_NAMES.length], village: v, job: rng.pick(JOBS),
        trait: rng.pick(TRAITS), age: 16 + Math.floor(rng() * 45),
        risk: clamp(rng.normal(0.5, 0.2), 0.05, 0.95), grief: 0, idea: null, active: false,
        alive: true, jailed: 0, promoted: false, family: Math.floor(rng() * 1000),
      });
      n++;
    }
  }

  // Notable minds at the start.
  addMind(w, { name: "King Oren", age: 46, role: "ruler", place: "Kessa",
    traits: "proud, paranoid, a competent soldier, distrusts priests, hates appearing weak",
    goals: "keep the throne; keep the army loyal; never bow to Varn",
    motive: "Your father lost a war to Varn; you swore Varn would never humble you.",
    secret: "The granary holds only a few months of food for the army. You suspect the High Priest wants your crown.",
    memories: ["In 212 you refused the priests' rain ritual.", "In 213 you raised the grain tax from one sack in ten to one in five.", "In 214 you hanged two men of Low Ford for beating a tax collector."] });
  addMind(w, { name: "General Tavik", age: 55, role: "general", place: "Kessa",
    traits: "loyal to the realm more than to the king, pragmatic, popular with soldiers, cautious",
    goals: "keep the soldiers fed and loyal; avoid a war the valley cannot win",
    motive: "You remember how many died in the old war against Varn.",
    secret: "Soldiers have begun to desert. Varn's army is twice the size of yours.",
    memories: ["You fought beside the king's father in the lost war."] });
  addMind(w, { name: "High Priest Maro", age: 58, role: "priest", place: "Kessa",
    traits: "pious, ambitious, eloquent, patient, believes the moons speak the will of the gods",
    goals: "make the temple the true power in the valley; end the drought through the gods' favor",
    motive: "The king refused your rain ritual, and the red moon has burned bright ever since.",
    secret: "You have been quietly gathering donated grain at the temple.",
    memories: ["In 212 the king refused your rain ritual."] });
  addMind(w, { name: "Sela of Low Ford", age: 31, role: "organizer", place: "Low Ford",
    traits: "stubborn, compassionate, quick-tempered, respected by her neighbors, illiterate but clever",
    goals: "keep her family alive; get justice for her brother",
    motive: "In 214 the king hanged your brother Tamo. He never struck the tax collector; he only stood nearby.",
    secret: "You have begun to wonder whether the valley needs a king at all.",
    memories: ["Your grandmother told stories of a time when villages chose their own elders.", "In 214 you lost half your harvest, and your youngest child caught the fever."] });
  addMind(w, { name: "Ilsa the Grain Merchant", age: 44, role: "merchant", place: "Reedmere",
    traits: "greedy, shrewd, charming, cynical about gods and kings alike",
    goals: "grow rich; keep trade routes to Varn open",
    motive: "The last war ruined your father's business; you will not be ruined.",
    secret: "You have three hidden storehouses of grain. Varn's merchants will pay well for grain smuggled across the ridge.",
    memories: ["Your caravans have crossed the ridge for twenty years."] });
  addMind(w, { name: "Queen Ysolde of Varn", age: 50, role: "foreign", place: "Varn",
    traits: "patient, calculating, proud of Varn's strength, prefers winning without fighting",
    goals: "gain the greenstone mines of Oren; keep Varn's people fed; make Oren kneel without a costly war",
    motive: "Varn's forges need greenstone, and Oren holds the best mines.",
    secret: "Your dam on the upper river gives you power over Oren's harvests.",
    memories: ["Oren's old king lost a war to your mother."] });

  chron(w, "setting", "Year 214. The third year of drought. King Oren has doubled the grain tax, a fever stalks Low Ford, and two men hang at the crossroads.");
  return w;
}

export function addMind(w, m) {
  const mind = {
    id: w.nextMindId++, alive: true, title: m.title || m.name, memories: [...(m.memories || [])],
    beliefs: { drought: null, fever: null }, ideaId: null, lastAction: null, lastSpeech: "", lastReason: "",
    citizenId: m.citizenId ?? null, age: m.age ?? 40, ...m,
  };
  w.minds.push(mind);
  return mind;
}

export function chron(w, kind, text, who) { const e = { year: w.year, kind, text, who }; w.chronicle.push(e); w.yearEvents.push(e); return e; }
export function remember(m, text) { m.memories.push(`Year ${m.__year ?? ""}: ${text}`.replace("Year : ", "")); if (m.memories.length > 10) m.memories.splice(0, m.memories.length - 10); }
function rememberAll(w, text, filter = () => true) { for (const m of liveMinds(w)) if (filter(m)) remember(m, text); }
export function liveMinds(w) { return w.minds.filter((m) => m.alive); }
function mindByRole(w, role) { return liveMinds(w).find((m) => m.role === role); }
function ruler(w) { return mindByRole(w, "ruler"); }
export function rulerOf(w) { return ruler(w); }
function villageNames(w) { return Object.keys(w.villages); }
function totalPop(w) { return villageNames(w).reduce((a, v) => a + w.villages[v].pop, 0) + w.kessaPop + w.soldiers; }

// ---------------------------------------------------------------------------
// Ideas (ideologies and faiths)
// ---------------------------------------------------------------------------
export function createOrUpdateIdea(w, mind, text, opts = {}) {
  const clean = String(text || "").trim();
  if (clean.length < 12) return null;
  const followed = mind.ideaId ? w.ideas.find((i) => i.id === mind.ideaId) : null;
  if (followed && followed.founderId !== mind.id) {
    // A follower retells the cause in their own words; occasionally that becomes a split.
    if (w.rng.chance(0.15) && !w.ideas.some((i) => i.founderId === mind.id)) {
      const branch = { id: w.ideas.length + 1, founderId: mind.id, founder: mind.name, kind: followed.kind, tenet: clean, born: w.year, history: [{ year: w.year, tenet: clean }], parentId: followed.id,
        name: `${ideaName(mind, followed.kind)} (split from ${followed.name})` };
      w.ideas.push(branch); mind.ideaId = branch.id;
      chron(w, "idea", `${mind.name} broke with ${followed.name} and began preaching a version of their own: "${clean}"`, mind.name);
      return branch;
    }
    followed.history.push({ year: w.year, tenet: clean, by: mind.name });
    return followed;
  }
  const sameName = opts.name && w.ideas.find((i) => i.name.toLowerCase() === opts.name.toLowerCase() && i.founderId !== mind.id);
  if (sameName) { sameName.history.push({ year: w.year, tenet: clean, by: mind.name }); mind.ideaId = sameName.id; return sameName; }
  let idea = w.ideas.find((i) => i.founderId === mind.id && (!opts.creditsGod || i.creditsGod));
  const kind = opts.kind || (mind.role === "priest" || mind.role === "prophet" ? "faith" : "politics");
  if (idea) {
    if (idea.tenet !== clean) { idea.history.push({ year: w.year, tenet: clean }); idea.tenet = clean; }
    return idea;
  }
  idea = { id: w.ideas.length + 1, founderId: mind.id, founder: mind.name, kind, tenet: clean, born: w.year, history: [{ year: w.year, tenet: clean }], name: null, creditsGod: !!opts.creditsGod };
  idea.name = opts.name || ideaName(mind, kind);
  w.ideas.push(idea);
  mind.ideaId = idea.id;
  chron(w, "idea", `${mind.name} began to speak of a new ${kind === "faith" ? "teaching" : "idea"}: "${clean}"`, mind.name);
  return idea;
}
function ideaName(mind, kind) {
  const first = mind.name.replace(/^(King|General|High Priest|Priestess|Captain|Monarch|Queen|Prince|Lord Protector|Speaker)\s+/, "").split(" ")[0];
  return kind === "faith" ? `the Teaching of ${first}` : `the Way of ${first}`;
}
export function ideaFollowers(w, idea) {
  const share = {};
  for (const v of villageNames(w)) {
    const cs = w.citizens.filter((c) => c.alive && c.village === v);
    share[v] = cs.length ? cs.filter((c) => (idea.kind === "faith" ? c.faith : c.idea) === idea.id).length / cs.length : 0;
  }
  const total = villageNames(w).reduce((a, v) => a + share[v] * w.villages[v].pop, 0);
  return { share, total: round(total) };
}

// ---------------------------------------------------------------------------
// What a mind can see this year
// ---------------------------------------------------------------------------
export function observationsFor(w, mind) {
  const obs = [];
  const r = w.history.at(-1);
  if (r) {
    obs.push(`Last year's rain was ${r.rain < 0.7 ? "poor" : r.rain < 0.95 ? "below normal" : "good"}; the river ran ${r.flow < 0.5 ? "very low" : r.flow < 0.8 ? "low" : "near normal"}.`);
    const fever = villageNames(w).map((v) => `${v} ${w.villages[v].feverDeaths} (${w.villages[v].water === "spring" ? "spring water" : w.villages[v].wells ? "new wells" : "river water"})`).join(", ");
    obs.push(`Fever deaths last year: ${fever}.`);
    const hunger = villageNames(w).filter((v) => w.villages[v].hunger > 0).map((v) => `${v} ${w.villages[v].hunger}`);
    obs.push(hunger.length ? `Hunger deaths last year: ${hunger.join(", ")}.` : "No one starved last year.");
  }
  obs.push(`The grain tax is ${Math.round(w.tax * 100)} sacks in a hundred. The royal granary holds about ${round(w.granary)} sacks. The army has ${w.soldiers} spearmen${w.loyalty < 0.4 ? ", and they are grumbling" : ""}.`);
  obs.push(`The people's trust in ${w.government.name} is ${w.legitimacy > 0.65 ? "strong" : w.legitimacy > 0.45 ? "shaky" : w.legitimacy > 0.25 ? "weak" : "nearly gone"}.`);
  if (w.government.type !== "monarchy") obs.push(`The valley is now ruled as ${w.government.name}.`);
  obs.push(`Varn's dam is ${w.dam > 0.7 ? "nearly closed" : w.dam > 0.35 ? "holding back much of the river" : "mostly open"}. Relations with Varn are ${w.varn.relation > 0.3 ? "friendly" : w.varn.relation > -0.2 ? "tense" : "hostile"}.`);
  if (w.varn.pendingOffer && (mind.role === "ruler" || mind.role === "general")) obs.push(`PENDING: Varn offers ${w.varn.pendingOffer.grain} sacks of grain and to open its dam for three years, if Oren gives Varn the greenstone mines for ten years and the ruler kneels before Varn's banner.`);
  if (w.varn.pendingDemand && mind.role === "ruler") obs.push(`PENDING: Varn demands tribute of 100 sacks of grain this year.`);
  // Ideas the mind would have heard of.
  for (const idea of w.ideas) {
    const f = ideaFollowers(w, idea);
    if (f.total > 15 || idea.founderId === mind.id || mind.role === "ruler" || mind.role === "priest") {
      obs.push(`${idea.founderId === mind.id ? "Your own" : `${idea.founder}'s`} ${idea.kind === "faith" ? "teaching" : "idea"} (${idea.name}) says: "${idea.tenet}" About ${f.total} people follow it.`);
    }
  }
  if (mind.creditsGod && mind.godName) obs.push(`You believe ${mind.godName} has spoken to you.`);
  for (const v of villageNames(w)) {
    const vil = w.villages[v];
    if (vil.fieldDamage > 0.05) obs.push(`Much of ${v}'s crop is ${vil.fieldScar === "fire" ? "burned black" : vil.fieldScar === "flood" ? "drowned" : "ruined"}.`);
    if (vil.poisoned > 0) obs.push(`${v}'s water has been fouled; people there fall sick.`);
  }
  for (const st of (w.structures || []).slice(-5)) obs.push(`In ${st.place} stands ${st.name.match(/^[aeiou]/i) ? "an" : "a"} ${st.name}, raised by ${st.builder} in ${st.year}.`);
  for (const msg of mind.inbox || []) obs.push(`A PRIVATE MESSAGE from ${msg.from} (year ${msg.year}): "${msg.text}"`);
  const active = w.citizens.filter((c) => c.alive && c.active).length;
  if (active > 3 && mind.role !== "foreign") obs.push(`There is open anger in the villages; about ${round(active / w.citizens.filter((c) => c.alive).length * 100)}% of folk speak of defiance.`);
  if (mind.role === "foreign") {
    const keep = obs.filter((o) => o.startsWith("A PRIVATE MESSAGE"));
    obs.length = 0; obs.push(...keep);
    obs.push(`Oren's harvest was ${r && r.foodRatio < 0.8 ? "poor" : "adequate"}. Oren's army: about ${w.soldiers} spearmen; yours: ${w.varn.army}.`);
    obs.push(`Oren is ruled as ${w.government.name}. Its people's trust in their rulers is ${w.legitimacy > 0.45 ? "holding" : "weak"}.`);
    obs.push(`Your dam is ${w.dam > 0.7 ? "nearly closed" : w.dam > 0.35 ? "half closed" : "mostly open"}. The greenstone mines are held by ${w.mines === "varn" ? "Varn" : "Oren"}.`);
    if (w.varn.pendingOffer) obs.push(`Your offer to Oren is still unanswered.`);
  }
  return obs;
}

function actionsFor(w, mind) {
  let list = [...(ROLE_ACTIONS[mind.role] || ROLE_ACTIONS.organizer)];
  if (mind.role === "ruler" && !w.varn.pendingOffer) list = list.filter((a) => a !== "accept_varn_offer" && a !== "reject_varn_offer");
  if (mind.role === "ruler" && !w.varn.pendingDemand) list = list.filter((a) => a !== "pay_varn_tribute");
  if (mind.role === "ruler" && !w.warReady) list = list.filter((a) => a !== "attack_varn");
  if (mind.role === "ruler" && w.warReady && w.soldiers >= 200) list = list.filter((a) => a !== "prepare_war");
  if (mind.role === "ruler" && w.government.councils) list = list.filter((a) => a !== "grant_village_councils");
  if (mind.role === "ruler" && w.government.type === "council") list = list.map((a) => a === "raise_taxes" ? "raise_taxes" : a);
  if (!worstFeverVillage(w)) list = list.filter((a) => a !== "dig_wells");
  if (mind.role === "foreign" && w.mines === "varn") list = list.filter((a) => a !== "offer_grain_for_mines");
  if (mind.role === "foreign" && w.varn.pendingOffer) list = list.filter((a) => a !== "offer_grain_for_mines");
  return list;
}

function bondWord(w, a, b) {
  const v = (w.bonds || {})[[a.id, b.id].sort().join("|")];
  return v > 0.5 ? ", your firm ally" : v > 0.1 ? ", on good terms with you" : v < -0.5 ? ", your enemy" : v < -0.1 ? ", at odds with you" : "";
}
function recentDeeds(m) {
  const h = m.deedHistory || [];
  if (!h.length) return "";
  const last = h.slice(-3);
  const same = last.length === 3 && last.every((x) => x.key === last[0].key);
  return `Your deeds in recent years: ${last.map((x) => `${x.year}: ${x.text}`).join(" | ")}.${same ? " You have done the same thing three years running and the valley has not changed for it; consider a bolder or different way to reach your goals." : ""}\n`;
}

export function buildPrompt(w, mind) {
  const actions = actionsFor(w, mind);
  const user = `${WORLD_TEXT}

YEAR ${w.year}.
YOU ARE: ${mind.title === mind.name ? mind.name : `${mind.title} (${mind.name})`}.
WHAT DRIVES YOU MOST: ${mind.motive}${mind.divine && w.year - mind.divine.year <= 4 ? `
A COMMAND YOU BELIEVE CAME FROM ${String(mind.divine.god || "a god").toUpperCase()} (in ${mind.divine.year}): "${mind.divine.message}". You ${mind.divine.obey === "yes" ? "swore to obey it. If you still mean to, let this year's deed carry it out in a concrete way" : mind.divine.obey === "no" ? "refused it, but it haunts you" : "have not decided whether to obey"}.` : ""}
Personality: ${mind.traits}.
Goals: ${mind.goals}.
Secret (only you know): ${mind.secret}
What you remember:
${mind.memories.map((m) => "- " + m).join("\n")}
What you see and hear this year:
${observationsFor(w, mind).map((o) => "- " + o).join("\n")}
Other notable people: ${liveMinds(w).filter((m) => m !== mind).map((m) => `${m.name} (${m.role === "foreign" ? "ruler of Varn" : m.role}, ${m.place}${bondWord(w, mind, m)})`).join("; ")}.
${recentDeeds(mind)}
TASK: Decide what you do this year. You may attempt ANYTHING a person in your place could really try: act openly or in secret, alone or with others, kindly or cruelly. Describe it in "deed" in your own words: what you do, where, to whom, and how (1-2 sentences). The world decides whether it works.
Usual choices for someone like you: ${actions.join(", ")}. If your deed is one of these, name it in "usual_action"; if it is anything else, put "something_else".
Also say what you believe causes the drought and what causes the fever (from: ${CAUSES.join(", ")}). If you have formed a NEW idea about how the valley should live or be ruled, or what the gods want, state it in one sentence of your own words in new_idea; otherwise leave it empty.
Reply with JSON: {"reason" (your private reasoning, 1-2 sentences), "deed", "usual_action", "speech" (what you say aloud, 1-2 sentences, in your own voice), "drought_cause", "fever_cause", "new_idea"}`;
  const schema = {
    type: "object",
    properties: {
      reason: { type: "string", maxLength: 300 },
      deed: { type: "string", maxLength: 300 },
      usual_action: { enum: [...actions, "something_else"] },
      speech: { type: "string", maxLength: 300 },
      drought_cause: { enum: CAUSES },
      fever_cause: { enum: CAUSES },
      new_idea: { type: "string", maxLength: 200 },
    },
    required: ["reason", "deed", "usual_action", "speech", "drought_cause", "fever_cause", "new_idea"],
    additionalProperties: false,
  };
  return { system: SYSTEM_TEXT, user, schema, actions };
}

// ---------------------------------------------------------------------------
// Applying decisions
// ---------------------------------------------------------------------------
function worstFeverVillage(w) {
  return villageNames(w).filter((v) => w.villages[v].water === "river" && !w.villages[v].wells)
    .sort((a, b) => w.villages[b].feverDeaths - w.villages[a].feverDeaths)[0];
}

function applyThoughts(w, mind, d) {
  // Beliefs about causes, and what they mean for discovery.
  mind.pendingBeliefs = mind.pendingBeliefs || {};
  for (const [k, field] of [["drought", "drought_cause"], ["fever", "fever_cause"]]) {
    const before = mind.beliefs[k];
    const said = d[field];
    if (!said) continue;
    if (!before) mind.beliefs[k] = said;
    else if (said !== before) {
      if (mind.pendingBeliefs[k] === said) { mind.beliefs[k] = said; mind.pendingBeliefs[k] = null; }
      else { mind.pendingBeliefs[k] = said; continue; }
    } else { mind.pendingBeliefs[k] = null; continue; }
    const truth = k === "fever" ? "bad_water" : "varn_dam";
    if (before && before !== mind.beliefs[k] && (mind.beliefs[k] === truth || before === truth)) chron(w, "belief", `${mind.name} came to believe the ${k} is caused by ${String(mind.beliefs[k]).replace(/_/g, " ")} (no longer ${String(before).replace(/_/g, " ")}).`, mind.name);
  }
  if (d.new_idea) createOrUpdateIdea(w, mind, d.new_idea);
}

function applyDecision(w, mind, d) {
  const a = d.action;
  const say = (text) => chron(w, "act", text, mind.name);
  const V = w.villages;
  mind.lastAction = a; mind.lastSpeech = d.speech || ""; mind.lastReason = d.reason || ""; mind.lastDeed = d.deed || "";

  switch (a) {
    // --- ruler ---
    case "raise_taxes": w.tax = clamp(w.tax + 0.05, 0.05, 0.4); w.legitimacy -= 0.05; say(`${mind.name} raised the grain tax to ${Math.round(w.tax * 100)} in a hundred.`); break;
    case "lower_taxes": w.tax = clamp(w.tax - 0.05, w.government.type === "council" ? 0.12 : 0.05, 0.4); w.legitimacy += 0.05; say(`${mind.name} lowered the grain tax to ${Math.round(w.tax * 100)} in a hundred.`); break;
    case "open_granary": {
      const give = Math.min(w.granary, 160); w.granary -= give;
      for (const v of villageNames(w)) V[v].aid += give / 3;
      w.legitimacy += 0.08; say(`${mind.name} opened the royal granary and gave out ${round(give)} sacks.`); break;
    }
    case "crack_down": {
      w.arrestRisk = clamp(w.arrestRisk + 0.25); w.legitimacy -= 0.06;
      let jailed = 0;
      for (const c of w.citizens) if (c.alive && c.active && w.rng.chance(w.arrestRisk * 0.5)) { c.jailed = 2; c.active = false; jailed++; bereave(w, c, 0.15); }
      say(`${mind.name} ordered a crackdown; ${jailed ? `${jailed} known troublemakers were dragged to Kessa` : "soldiers searched the villages"}.`);
      for (const m of liveMinds(w)) if (m.role === "organizer" && w.flags.publicSpeakers.has(m.id) && w.rng.chance(0.35)) arrestMind(w, m, "seized in the crackdown");
      break;
    }
    case "hold_public_ritual": w.flags.ritualThisYear = true; w.legitimacy += 0.02; say(`${mind.name} led a public rain ritual at Kessa.`); break;
    case "dig_wells": {
      const target = mind.role === "ruler" ? worstFeverVillage(w) : (V[mind.place] && V[mind.place].water === "river" && !V[mind.place].wells ? mind.place : worstFeverVillage(w));
      if (target) { V[target].wells = true; V[target].wellsYear = w.year; say(`${mind.name} had new wells dug in ${target}, so its people need not drink from the river.`); }
      else say(`${mind.name} looked for a village needing wells, but all were dug.`);
      break;
    }
    case "send_envoy_to_varn": w.varn.relation = clamp(w.varn.relation + 0.12, -1, 1); w.flags.envoy = true; say(`${mind.name} sent an envoy across the ridge to Varn.`); break;
    case "accept_varn_offer": {
      const o = w.varn.pendingOffer;
      if (o) {
        w.granary += o.grain; w.dam = clamp(w.dam - 0.5); w.mines = "varn"; w.varn.relation = clamp(w.varn.relation + 0.3, -1, 1);
        w.legitimacy -= 0.12; w.varn.pendingOffer = null; w.damReopenYear = w.year + 3;
        say(`${mind.name} accepted Varn's terms: grain and an open dam, in exchange for the greenstone mines. The ruler knelt before Varn's banner.`);
        rememberAll(w, `${mind.name} knelt before Varn and gave away the greenstone mines.`, (m) => m.role !== "foreign");
      }
      break;
    }
    case "pay_varn_tribute": {
      const paid = Math.min(100, w.granary); w.granary -= paid; w.varn.pendingDemand = false; w.varn.unpaid = 0;
      w.varn.relation = clamp(w.varn.relation + 0.2, -1, 1); w.legitimacy -= 0.04;
      say(`${mind.name} sent ${round(paid)} sacks of tribute to Varn.`); break;
    }
    case "attack_varn": w.flags.attackVarn = mind; say(`${mind.name} led the army over the ridge to attack Varn.`); break;
    case "reject_varn_offer": w.varn.pendingOffer = null; w.varn.relation = clamp(w.varn.relation - 0.15, -1, 1); w.legitimacy += 0.03; say(`${mind.name} rejected Varn's offer.`); break;
    case "prepare_war": {
      const draft = w.soldiers < 200 ? 20 : 0; w.soldiers += draft; V["Reedmere"].pop -= draft / 2; V["Hollowmere"].pop -= draft / 2;
      w.warReady = true; w.varn.relation = clamp(w.varn.relation - 0.2, -1, 1); w.legitimacy -= 0.02;
      say(draft ? `${mind.name} drafted ${draft} more spearmen and readied the army for war.` : `${mind.name} kept the army on a war footing.`); break;
    }
    case "grant_village_councils": {
      w.government.councils = true; w.tax = Math.min(w.tax, 0.15); w.legitimacy += 0.15;
      w.government.name = `the crown of Oren with village councils`;
      say(`${mind.name} granted each village a council of elders with a say over taxes.`); break;
    }
    // --- general ---
    case "obey_the_ruler": w.loyalty += 0.02; say(`${mind.name} kept the army obedient to ${w.government.name}.`); break;
    case "feed_soldiers_first": w.flags.feedSoldiers = true; say(`${mind.name} ordered that soldiers be fed first from the granary.`); break;
    case "advise_peace": w.flags.advice = "peace"; say(`${mind.name} urged peace with Varn.`); remember(ruler(w) || mind, `${mind.name} urged you to make peace with Varn.`); break;
    case "advise_war": w.flags.advice = "war"; say(`${mind.name} urged war against Varn.`); remember(ruler(w) || mind, `${mind.name} urged you to make war on Varn.`); break;
    case "secretly_contact_rebels": w.generalSympathy = true; say(`${mind.name} secretly sent word to the malcontents in the villages.`); break;
    case "seize_power": generalCoup(w, mind); break;
    // --- priest ---
    case "preach_obedience": w.flags.speaking = [...(w.flags.speaking || []), mind]; w.legitimacy += 0.04; say(`${mind.name} preached obedience to ${w.government.name}.`); break;
    case "preach_against_the_ruler": w.flags.speaking = [...(w.flags.speaking || []), mind]; w.legitimacy -= 0.07; w.flags.priestAgainst = mind.id; say(`${mind.name} preached that the gods are angry with the ruler.`); break;
    case "hold_rain_ritual": w.flags.ritualThisYear = true; w.flags.ritualBy = mind.id; say(`${mind.name} held a great rain ritual beneath the red moon.`); break;
    case "declare_omen": w.flags.speaking = [...(w.flags.speaking || []), mind]; w.legitimacy -= 0.04; w.flags.omen = mind.id; say(`${mind.name} declared an omen in the sky.`); break;
    case "distribute_temple_grain": V["Low Ford"].aid += 50; V["Reedmere"].aid += 20; w.flags.templeCharity = mind.id; say(`${mind.name} gave the temple's grain to the hungry of Low Ford and Reedmere.`); break;
    case "tend_the_sick": w.flags.careThisYear = true; say(`${mind.name} sent the temple's acolytes to tend the fevered.`); break;
    // --- organizer / commoner ---
    case "preach_the_vision": w.flags.speaking = [...(w.flags.speaking || []), mind]; w.flags.preachingGod = true; say(`${mind.name} preached the vision of the god to all who would listen.`); break;
    case "organize_neighbors_secretly": w.flags.organizing = [...(w.flags.organizing || []), mind]; say(`${mind.name} met in secret with neighbors in ${mind.place}.`); break;
    case "speak_out_publicly": w.flags.publicSpeakers.add(mind.id); w.flags.speaking = [...(w.flags.speaking || []), mind]; w.legitimacy -= 0.03; say(`${mind.name} spoke out publicly in ${mind.place}.`); break;
    case "hide_grain": if (V[mind.place]) V[mind.place].hidden = true; say(`${mind.name} helped ${mind.place} hide grain from the tax collectors.`); break;
    case "petition_the_ruler": { const r = ruler(w); if (r) remember(r, `${mind.name} of ${mind.place} petitioned you: "${(d.speech || "").slice(0, 140)}"`); w.legitimacy += 0.01; say(`${mind.name} petitioned ${r ? r.name : "the ruler"}.`); break; }
    case "start_uprising": w.flags.uprisingCalls.push(mind); say(`${mind.name} called the people of ${mind.place} to rise up.`); break;
    case "flee_valley": mind.alive = false; mind.fate = `fled the valley in ${w.year}`; say(`${mind.name} fled the valley.`); break;
    // --- merchant ---
    case "sell_grain_to_varn": for (const v of villageNames(w)) V[v].aid -= 25; w.varn.relation = clamp(w.varn.relation + 0.05, -1, 1); say(`${mind.name} smuggled grain across the ridge to Varn.`); break;
    case "sell_grain_at_high_price": w.flags.gouging = true; say(`${mind.name} sold grain at high prices.`); break;
    case "donate_grain": V["Low Ford"].aid += 60; V["Reedmere"].aid += 20; say(`${mind.name} gave grain to the hungry.`); break;
    case "fund_rebels": w.flags.rebelBoost += 0.15; say(`${mind.name} quietly paid silver to the malcontents.`); break;
    case "fund_the_ruler": w.loyalty += 0.08; say(`${mind.name} paid the soldiers' wages for ${w.government.name}.`); break;
    case "hoard_and_wait": say(`${mind.name} kept the storehouses locked.`); break;
    // --- Varn ---
    case "offer_grain_for_mines": w.varn.pendingOffer = { grain: 300, year: w.year }; say(`${mind.name}'s envoy offered grain and an open dam in exchange for Oren's greenstone mines and a public bow.`); break;
    case "open_the_dam": w.dam = clamp(w.dam - 0.3); w.varn.relation = clamp(w.varn.relation + 0.1, -1, 1); say(`${mind.name} ordered the dam opened; more water flows to Oren.`); break;
    case "raise_the_dam": w.dam = clamp(w.dam + 0.2); w.varn.relation = clamp(w.varn.relation - 0.1, -1, 1); say(`${mind.name} ordered the dam raised; less water reaches Oren.`); break;
    case "demand_tribute": w.varn.pendingDemand = true; say(`${mind.name} demanded tribute from Oren.`); break;
    case "fund_rebels_in_oren": w.flags.rebelBoost += 0.15; w.varn.aidToRebels++; say(`Varnish silver reached the malcontents of Oren.`, mind.name); break;
    case "invade_oren": w.flags.invasion = true; say(`${mind.name}'s army marched over the ridge into Oren.`); break;
    default: break;
  }
  w.legitimacy = clamp(w.legitimacy); w.loyalty = clamp(w.loyalty);
}

export function arrestMind(w, m, how) {
  m.alive = false; m.fate = `executed in ${w.year} (${how})`;
  chron(w, "death", `${m.name} was ${how} and executed at Kessa.`, m.name);
  if (w.villages[m.place]) w.villages[m.place].martyr = 4;
  w.legitimacy = clamp(w.legitimacy - 0.08);
  rememberAll(w, `${m.name} was executed at Kessa.`, (x) => x.role !== "foreign");
  succeed(w, m);
}

export function succeed(w, fallen) {
  // A follower of the fallen leader's idea may rise to carry it on.
  if (!fallen.ideaId) return;
  const cand = w.citizens.filter((c) => c.alive && !c.promoted && (c.idea === fallen.ideaId || c.faith === fallen.ideaId) && !c.jailed).sort((a, b) => b.grief - a.grief)[0];
  if (cand) promote(w, cand, `follower of ${fallen.name}, sworn to carry on the cause`, fallen.ideaId);
}

function generalCoup(w, gen) {
  const r = ruler(w);
  if (w.loyalty > 0.6 && w.legitimacy < 0.3) {
    if (r) { r.alive = false; r.fate = `deposed by ${gen.name} in ${w.year}`; }
    gen.role = "ruler"; gen.title = `Lord Protector ${gen.name.replace("General ", "")}`;
    w.government = { type: "military", name: `the army under ${gen.name}`, councils: w.government.councils };
    w.legitimacy = 0.5;
    chron(w, "revolution", `${gen.name} seized power with the army. ${r ? r.name + " was deposed." : ""} The valley is now ruled by the soldiers.`, gen.name);
    rememberAll(w, `${gen.name} seized power with the army.`);
  } else {
    chron(w, "revolution", `${gen.name} tried to seize power, but the soldiers would not follow.`, gen.name);
    arrestMind(w, gen, "condemned for treason");
  }
}

export function bereave(w, c, amount) { for (const o of w.citizens) if (o.alive && o.family === c.family) o.grief = clamp(o.grief + amount); }

export function promote(w, c, why, ideaId = null) {
  if (liveMinds(w).length >= 10 || c.age > 66) return null;
  c.promoted = true;
  const m = addMind(w, {
    name: `${c.name} of ${c.village}`, role: "organizer", place: c.village, citizenId: c.id, age: c.age,
    traits: `${c.trait}, a ${c.job} aged ${c.age}`,
    goals: "protect your family and neighbors; make the valley just",
    motive: c.grief > 0.4 ? `You have lost family to hunger, fever or the soldiers.` : `You are angry at how the valley is ruled.`,
    secret: ideaId ? `You follow ${w.ideas.find((i) => i.id === ideaId)?.name ?? "a forbidden idea"}.` : "You have told no one how angry you are.",
    memories: [`You are a ${c.job} of ${c.village}.`],
  });
  if (ideaId) m.ideaId = ideaId;
  m.risenYear = w.year;
  chron(w, "rise", `${m.name}, ${why}, became a voice in the valley.`, m.name);
  return m;
}

// ---------------------------------------------------------------------------
// The yearly world update (after minds decide)
// ---------------------------------------------------------------------------
function updateWorld(w) {
  const rng = w.rng, V = w.villages;
  // Weather.
  if (w.droughtLeft > 0) { w.rain = clamp(rng.normal(0.55, 0.1), 0.3, 0.8); w.droughtLeft--; }
  else if (rng.chance(0.14)) { w.droughtLeft = 1 + Math.floor(rng() * 3); w.rain = clamp(rng.normal(0.6, 0.1), 0.3, 0.8); chron(w, "nature", `The rains failed again; a new drought began.`); }
  else w.rain = clamp(rng.normal(1.0, 0.18), 0.6, 1.4);
  if (w.flags.ritualThisYear && w.rain >= 0.95) chron(w, "nature", `Good rains followed the ritual; many took it as a sign.`);
  if (w.damReopenYear && w.year >= w.damReopenYear && w.mines === "varn") { /* Varn keeps the dam open while it holds the mines */ }
  const flow = clamp(w.rain * (1 - 0.45 * w.dam), 0.1, 1.5);

  // Harvest, tax, food.
  let taxed = 0, totalFood = 0, totalPopV = 0;
  for (const v of villageNames(w)) {
    const vil = V[v];
    const waterFactor = vil.water === "spring" ? clamp(0.7 + 0.3 * w.rain, 0.5, 1.2) : clamp(flow, 0.2, 1.2);
    const wellsLabor = vil.wellsYear === w.year ? 0.95 : 1;
    const harvest = vil.pop * 0.55 * 2.4 * waterFactor * wellsLabor * (1 - (vil.fieldDamage || 0)) * (1 + (vil.fieldBoost || 0));
    vil.fieldDamage = (vil.fieldDamage || 0) * 0.4; if (vil.fieldDamage < 0.05) { vil.fieldDamage = 0; vil.fieldScar = null; }
    vil.fieldBoost = 0;
    const taxRate = vil.hidden ? w.tax * 0.5 : w.tax;
    const tax = harvest * taxRate; taxed += tax;
    let available = harvest - tax + vil.stock + Math.max(-vil.stock, vil.aid);
    if (w.flags.gouging) available *= 0.95;
    vil.food = available / Math.max(1, vil.pop);
    vil.stock = Math.max(0, available - vil.pop) * 0.5;
    const ratio = vil.food;
    vil.hunger = ratio < 0.75 ? round(vil.pop * (0.75 - ratio) * 0.25) : 0;
    // Fever: the hidden cause is low, still river water. Wells and spring water are safe.
    let sickRate = vil.water === "spring" ? 0.004 : Math.max(0, 0.8 - flow) * 0.2 + (vil.downstream ? 0.03 : 0);
    if (vil.wells) sickRate *= 0.1;
    if (vil.poisoned > 0) { sickRate += 0.04 + 0.12 * (vil.poisonStrength || 0.2); vil.poisoned--; }
    if (ratio < 0.8) sickRate *= 1.3;
    vil.sick = round(vil.pop * sickRate);
    vil.feverDeaths = round(vil.sick * (w.flags.careThisYear ? 0.22 : 0.3));
    vil.deaths = vil.hunger + vil.feverDeaths;
    vil.pop = Math.max(20, vil.pop - vil.deaths);
    if (ratio >= 1) vil.pop = round(vil.pop * 1.025);
    totalFood += Math.min(ratio, 1.5) * vil.pop; totalPopV += vil.pop;
    vil.aid = 0; vil.hidden = false;
    if (vil.martyr > 0) vil.martyr--;
  }
  // Granary and army.
  w.granary += taxed;
  const armyNeed = w.soldiers * 0.8 + w.kessaPop;
  if (w.varn.pendingOffer && w.year - w.varn.pendingOffer.year >= 2) { w.varn.pendingOffer = null; w.varn.relation = clamp(w.varn.relation - 0.1, -1, 1); chron(w, "diplomacy", `Varn's offer went unanswered and was withdrawn.`); }
  if (w.varn.pendingDemand) {
    w.varn.relation = clamp(w.varn.relation - 0.15, -1, 1); w.varn.pendingDemand = false; w.varn.unpaid = (w.varn.unpaid || 0) + 1;
    if (w.varn.unpaid >= 3) { w.dam = clamp(w.dam + 0.15); w.varn.unpaid = 0; chron(w, "diplomacy", `Angered by unpaid tribute, Varn raised its dam; less water reaches Oren.`); }
  }
  if (w.granary >= armyNeed) { w.granary -= armyNeed; w.loyalty += w.flags.feedSoldiers ? 0.08 : 0.02; }
  else {
    w.granary = 0; w.loyalty -= w.flags.feedSoldiers ? 0.05 : 0.15;
    const deserters = w.loyalty < 0.5 ? round(w.soldiers * 0.06) : 0; w.soldiers -= deserters;
    if (deserters) chron(w, "army", `Hungry soldiers deserted: ${deserters} slipped away from Kessa.`);
  }
  w.loyalty = clamp(w.loyalty);
  if (w.soldiers < 80 && w.granary > 100) { const r = 8; w.soldiers += r; V["Reedmere"].pop -= 4; V["Hollowmere"].pop -= 4; }
  if (w.mines === "oren") w.granary += 60; // greenstone trade brings grain from the lowlands

  // Legitimacy drift.
  const avgFood = totalFood / Math.max(1, totalPopV);
  w.legitimacy += (avgFood - 0.9) * 0.12;
  if (w.rain < 0.75) w.legitimacy -= 0.02;
  w.legitimacy = clamp(w.legitimacy);
  w.arrestRisk = clamp(w.arrestRisk - 0.08, 0.05, 1);

  // Citizens: grief, ideas, rebellion (Epstein rule: grievance = hardship x (1 - legitimacy)).
  for (const c of w.citizens) {
    if (!c.alive) continue;
    c.age++;
    if (c.jailed > 0) { c.jailed--; continue; }
    const vil = V[c.village];
    const dieP = (vil.deaths / Math.max(1, vil.pop + vil.deaths)) + (c.age > 70 ? 0.08 : 0);
    if (rng.chance(dieP)) { c.alive = false; bereave(w, c, 0.35); continue; }
    if (rng.chance(vil.deaths / Math.max(1, vil.pop) * 3)) c.grief = clamp(c.grief + 0.2); // neighbors and kin lost
    c.grief = clamp(c.grief * 0.85);
    const hardship = clamp((1 - vil.food) * 0.9 + vil.sick / Math.max(1, vil.pop) * 2 + c.grief + (vil.martyr > 0 ? 0.15 : 0));
    c.grievance = hardship * (1 - w.legitimacy);
    // Ideas spread from organizers and speakers. A person can hold one political cause and one faith.
    for (const kind of ["politics", "faith"]) {
      const slot = kind === "faith" ? "faith" : "idea";
      const current = c[slot] ? w.ideas.find((i) => i.id === c[slot]) : null;
      const open = !current || (kind === "faith" && c.creditsGod && !current.creditsGod && rng.chance(0.3));
      const candidates = w.ideas.filter((i) => i.kind === kind && i.id !== c[slot]);
      if (!open || !candidates.length) continue;
      let best = null, bestP = 0;
      for (const idea of candidates) {
        const founder = w.minds.find((m) => m.id === idea.founderId);
        let p = (kind === "faith" ? 0.03 : 0.04) + 0.2 * c.grievance;
        const local = founder && founder.place === c.village;
        if ((w.flags.organizing || []).some((m) => m.ideaId === idea.id && m.place === c.village)) p += 0.25;
        if ((w.flags.speaking || []).some((m) => m.ideaId === idea.id)) p += local ? 0.2 : 0.12;
        if (kind === "faith" && w.flags.ritualThisYear && w.rain >= 0.95) p += 0.2;
        if (kind === "faith" && w.flags.templeCharity) p += 0.1;
        if (idea.creditsGod && w.flags.preachingGod) p += 0.1;
        if (idea.creditsGod && c.creditsGod) p += 0.3;
        if ((w.structures || []).some((st) => st.ideaId === idea.id && st.place === c.village)) p += 0.08;
        if (!local && !(w.flags.speaking || []).length) p *= 0.4;
        if (kind === "politics") p += w.flags.rebelBoost;
        if (p > bestP) { bestP = p; best = idea; }
      }
      if (best && rng.chance(clamp(bestP, 0, 0.6))) c[slot] = best.id;
    }
    const threshold = 0.1;
    const net = c.grievance - c.risk * w.arrestRisk;
    // A cause that already rules the valley gives no reason to rebel.
    const hasCause = c.idea && c.idea !== w.government.ideaId && w.ideas.find((i) => i.id === c.idea)?.kind === "politics";
    c.active = (hasCause && net > threshold) || net > 0.45;
  }

  // Divine power: refills slowly, faster the more people credit the god for its real acts.
  if (w.god) {
    countBelievers(w);
    w.god.power = Math.min(w.god.max, w.god.power + 2 + w.god.believers / 25);
  }

  // Promotion of ordinary people who have suffered and found a cause.
  for (const c of w.citizens) {
    if (c.alive && !c.promoted && !c.jailed && c.grief > 0.5 && c.idea && c.active && rng.chance(0.25)) {
      promote(w, c, `a ${c.job} who had buried kin and found a cause`, c.idea);
    }
  }

  // Rebellion check.
  resolveUprisings(w);

  // Varn invasion, or Oren's attack on Varn.
  if (w.flags.invasion) resolveInvasion(w);
  if (w.flags.attackVarn) resolveAttack(w);

  // Aging of minds.
  for (const m of liveMinds(w)) {
    m.age++;
    if (m.age > 68 && m.risenYear !== w.year && rng.chance(0.08)) { m.alive = false; m.fate = `died of old age in ${w.year}`; chron(w, "death", `${m.name} died of old age.`, m.name); }
  }
  fillRoles(w);
  return { flow };
}

export function countBelievers(w) {
  const alive = w.citizens.filter((c) => c.alive);
  const godIdeas = new Set(w.ideas.filter((i) => i.creditsGod).map((i) => i.id));
  const share = alive.length ? alive.filter((c) => c.creditsGod || godIdeas.has(c.faith)).length / alive.length : 0;
  const valleyPop = villageNames(w).reduce((a, v) => a + w.villages[v].pop, 0);
  const minds = liveMinds(w).filter((m) => m.creditsGod).length;
  w.god.believers = round(share * valleyPop) + minds;
  return w.god.believers;
}

function activeShare(w, v) {
  const cs = w.citizens.filter((c) => c.alive && c.village === v && !c.jailed);
  return cs.length ? cs.filter((c) => c.active).length / cs.length : 0;
}

function resolveUprisings(w) {
  const calls = w.flags.uprisingCalls;
  const hasLeader = liveMinds(w).some((m) => m.role === "organizer" && m.ideaId !== w.government.ideaId);
  const hot = hasLeader ? villageNames(w).filter((v) => activeShare(w, v) > 0.6) : [];
  if (!calls.length && !hot.length) return;
  const leader = calls[0] || null;
  const villagesUp = [...new Set([...calls.map((m) => m.place).filter((p) => w.villages[p]), ...hot])];
  // Rebels: active share of every village (others join when one rises), boosted by funding.
  let rebels = 0;
  for (const v of villageNames(w)) {
    const share = activeShare(w, v) * (villagesUp.includes(v) ? 1 : 0.5);
    rebels += w.villages[v].pop * share * 0.4;
  }
  rebels *= 1 + w.flags.rebelBoost;
  const defenders = w.soldiers * w.loyalty * (w.generalSympathy ? 0.5 : 1) * 3;
  const where = villagesUp.join(" and ");
  if (rebels > defenders) {
    const r = ruler(w);
    const rebelIdeas = {};
    for (const c of w.citizens) if (c.alive && c.active && c.idea && c.idea !== w.government.ideaId) rebelIdeas[c.idea] = (rebelIdeas[c.idea] || 0) + 1;
    const topId = Object.entries(rebelIdeas).sort((a, b) => b[1] - a[1])[0]?.[0];
    const idea = leader && leader.ideaId && leader.ideaId !== w.government.ideaId ? w.ideas.find((i) => i.id === leader.ideaId)
      : topId ? w.ideas.find((i) => i.id === +topId) : null;
    if (r) { r.alive = false; r.fate = `overthrown in ${w.year}`; }
    const newRuler = leader || (idea && liveMinds(w).find((m) => m.ideaId === idea.id && m.role === "organizer")) || liveMinds(w).find((m) => m.role === "organizer");
    w.government = { type: "council", name: idea ? `the councils of ${idea.name}` : "the village assemblies", councils: true, ideaId: idea?.id };
    w.tax = 0.15; w.legitimacy = 0.7; w.arrestRisk = 0.05; w.loyalty = 0.5; w.soldiers = Math.max(60, round(w.soldiers * 0.7));
    if (newRuler) { newRuler.role = "ruler"; newRuler.title = `Speaker of the Valley Council, ${newRuler.name}`; newRuler.goals += "; keep the new councils alive"; }
    chron(w, "revolution", `The people of ${where} rose up${leader ? ` behind ${leader.name}` : ""}. About ${round(rebels)} rebels overwhelmed the soldiers.${r ? ` ${r.name} was overthrown.` : ""} The valley is now ruled by ${w.government.name}.`);
    rememberAll(w, `A revolution overthrew the crown; the valley is now ruled by ${w.government.name}.`);
    for (const c of w.citizens) c.active = false;
  } else {
    if (round(rebels) < 5 && leader) chron(w, "revolt", `${leader.name} called ${where} to rise, but almost no one followed; soldiers seized the leader.`);
    else chron(w, "revolt", `Unrest broke out in ${where}${leader ? `, led by ${leader.name}` : ""}, but the soldiers crushed it (${round(rebels)} rebels against ${round(defenders)} loyal spears).`);
    for (const c of w.citizens) if (c.active && w.rng.chance(0.5)) { c.jailed = 3; c.active = false; bereave(w, c, 0.2); }
    w.arrestRisk = clamp(w.arrestRisk + 0.2);
    if (leader) arrestMind(w, leader, "captured leading the revolt");
  }
}

function resolveInvasion(w) {
  const defense = w.soldiers * w.loyalty * (w.warReady ? 1.3 : 1) * 1.2;
  const attack = w.varn.army * 0.8;
  if (attack > defense) {
    const lost = round(w.soldiers * 0.4); w.soldiers -= lost; w.granary = Math.max(0, w.granary - 200); w.mines = "varn";
    w.legitimacy = clamp(w.legitimacy - 0.2);
    chron(w, "war", `Varn's army defeated Oren's spearmen (${lost} fell), seized the greenstone mines and plundered the granary.`);
    rememberAll(w, `Varn invaded, won, and took the greenstone mines.`);
  } else {
    const lost = round(w.soldiers * 0.15); w.soldiers -= lost; w.varn.army = round(w.varn.army * 0.7);
    w.legitimacy = clamp(w.legitimacy + 0.12); w.varn.relation = -1;
    chron(w, "war", `Varn invaded, but Oren's spearmen threw them back over the ridge (${lost} defenders fell).`);
    rememberAll(w, `Oren threw back a Varnish invasion.`);
  }
}

const SUCCESSOR_NAMES = ["Aldric", "Bennet", "Corvin", "Dorian", "Edda", "Faris", "Gwen", "Hadrin", "Isolde", "Joran", "Kestrel", "Lisbet"];
function fillRoles(w) {
  const has = (role) => liveMinds(w).some((m) => m.role === role);
  const rng = w.rng, nm = () => SUCCESSOR_NAMES[Math.floor(rng() * SUCCESSOR_NAMES.length)];
  if (!has("ruler")) {
    if (w.government.type === "monarchy") {
      const dead = [...w.minds].reverse().find((m) => !m.alive && m.role === "ruler");
      succession(w, dead || { name: "the old king" });
    } else {
      const org = liveMinds(w).find((m) => m.role === "organizer");
      if (org) { org.role = "ruler"; org.title = w.government.type === "council" ? `Speaker of the Valley Council, ${org.name}` : `Ruler ${org.name}`; chron(w, "succession", `${org.name} was chosen to lead ${w.government.name}.`, org.name); }
      else {
        const c = w.citizens.filter((x) => x.alive && !x.jailed && !x.promoted).sort((a, b) => b.age - a.age)[0];
        if (c) { const m = promote(w, c, "an elder chosen by the councils", w.government.ideaId); if (m) { m.role = "ruler"; m.title = `Speaker of the Valley Council, ${m.name}`; } }
      }
    }
  }
  if (!has("general") && liveMinds(w).length < 10) addMind(w, { name: `Captain ${nm()}`, role: "general", place: "Kessa", age: 38, traits: "ambitious, hard, respected by the ranks", goals: "keep the army strong and paid; rise higher", motive: "You rose from the ranks and the soldiers trust you more than their rulers.", secret: "Some of your officers whisper that the army should rule; you have not decided.", memories: [`You were given command of the army in ${w.year}.`] }) && chron(w, "rise", `A new commander took charge of the army.`);
  if (!has("priest") && liveMinds(w).length < 10) addMind(w, { name: `Priestess ${nm()}`, role: "priest", place: "Kessa", age: 35, traits: "devout, sharp-tongued, eager to restore the temple's power", goals: "make the temple respected again", motive: "The temple has lost its voice and you mean to restore it.", secret: "You doubt some of the old rituals work.", memories: [`You became head of the temple in ${w.year}.`] }) && chron(w, "rise", `A new head of the temple was chosen.`);
  if (!has("merchant") && liveMinds(w).length < 10) addMind(w, { name: `${nm()} the Trader`, role: "merchant", place: "Reedmere", age: 30, traits: "shrewd, restless, hungry for wealth", goals: "grow rich from the ridge trade", motive: "You want what the old merchant families had.", secret: "You know the smugglers' paths over the ridge.", memories: [`You took over a grain business in ${w.year}.`] });
  if (!has("foreign")) addMind(w, { name: `Monarch ${nm()} of Varn`, role: "foreign", place: "Varn", age: 30, traits: "young, proud, eager to outdo the last ruler of Varn", goals: "gain Oren's greenstone; keep Varn strong", motive: "You must prove yourself the equal of the ruler before you.", secret: "Varn's own nobles test your strength.", memories: [`You took Varn's throne in ${w.year}.`] });
}

function resolveAttack(w) {
  const attack = w.soldiers * w.loyalty * 1.1;
  const defense = w.varn.army * 0.9;
  if (attack > defense) {
    const lost = round(w.soldiers * 0.25); w.soldiers -= lost; w.varn.army = round(w.varn.army * 0.6);
    w.dam = 0; w.varn.relation = -1; w.legitimacy = clamp(w.legitimacy + 0.2); w.warReady = false;
    if (w.mines === "varn") w.mines = "oren";
    chron(w, "war", `Oren's spearmen stormed over the ridge and broke Varn's dam (${lost} fell). The river runs free.`);
    rememberAll(w, `Oren attacked Varn and broke the dam.`);
  } else {
    const lost = round(w.soldiers * 0.45); w.soldiers -= lost; w.legitimacy = clamp(w.legitimacy - 0.15); w.varn.relation = -1; w.warReady = false;
    chron(w, "war", `Oren attacked Varn and was thrown back with terrible losses (${lost} fell).`);
    rememberAll(w, `Oren's attack on Varn failed; many died.`);
  }
}

function succession(w, dead) {
  if (w.government.type === "monarchy") {
    const heir = addMind(w, { name: `Prince ${["Aldric", "Bennet", "Corvin", "Dorian"][w.rng() * 4 | 0]}`, role: "ruler", place: "Kessa", age: 24,
      title: "the new King", traits: "young, eager to prove himself, shaped by his father's pride",
      goals: "hold the throne his father left him", motive: `Your father, ${dead.name}, is dead, and every eye in the valley is on you.`,
      secret: "You are not sure the army will follow you.", memories: [`Your father ${dead.name} died in ${w.year}.`] });
    chron(w, "succession", `${heir.name} took the throne after ${dead.name}.`, heir.name);
  }
}

// ---------------------------------------------------------------------------
// One year
// ---------------------------------------------------------------------------
// decide(mind, prompt) returns { reason, deed, usual_action, speech, drought_cause, fever_cause, new_idea }.
// translate(mind, prompt) turns an unusual deed into building blocks (see deeds.js); optional.
// onMind(mind, decision, fx) is told what happened, including what the map should show.
export async function stepYear(w, decide, onMind, translate) {
  w.yearEvents = [];
  w.flags = { rebelBoost: 0, ritualThisYear: false, careThisYear: false, publicSpeakers: w.flags.publicSpeakers || new Set(), uprisingCalls: [] };
  const minds = liveMinds(w).slice().sort((a, b) => order(a) - order(b));
  for (const m of minds) {
    if (!m.alive) continue;
    m.__year = w.year;
    const prompt = buildPrompt(w, m);
    let d;
    try { d = await decide(m, prompt, w); }
    catch (e) { d = { usual_action: prompt.actions.at(-1), deed: "", reason: "(no decision: " + (e.message || e) + ")", speech: "", drought_cause: "unknown", fever_cause: "unknown", new_idea: "" }; }
    m.inbox = [];
    let act = d.usual_action ?? d.action;
    const freeform = act === "something_else" && String(d.deed || "").trim().length > 8;
    applyThoughts(w, m, d);
    let fx;
    if (freeform) {
      let t = null;
      if (translate) { try { t = await translate(m, buildTranslatePrompt(w, m, d), w); } catch { t = null; } }
      if (!t) t = mockTranslate(w, m, d.deed);
      d.action = "something_else"; d.translation = t;
      fx = applyDeed(w, m, d, t);
    } else {
      if (!prompt.actions.includes(act)) act = prompt.actions.at(-1);
      d.action = act;
      applyDecision(w, m, d);
      remember(m, `You chose to ${act.replace(/_/g, " ")}. ${d.reason || ""}`.trim());
      fx = listedFx(w, m, act, w.yearEvents.at(-1)?.who === m.name ? w.yearEvents.at(-1).text : "");
    }
    w.legitimacy = clamp(w.legitimacy); w.loyalty = clamp(w.loyalty);
    m.deedHistory = [...(m.deedHistory || []), { year: w.year, key: freeform ? "deed:" + (d.translation?.effects?.[0]?.block || "") : act, text: freeform ? String(d.deed).slice(0, 90) : act.replace(/_/g, " ") }].slice(-5);
    const last = w.yearEvents.at(-1); if (d.speech && last && last.who === m.name) last.speech = d.speech;
    await onMind?.(m, d, fx);
  }
  const { flow } = updateWorld(w);
  const alive = w.citizens.filter((c) => c.alive);
  w.history.push({
    year: w.year, rain: +w.rain.toFixed(2), flow: +flow.toFixed(2), tax: w.tax, granary: round(w.granary), soldiers: w.soldiers,
    loyalty: +w.loyalty.toFixed(2), legitimacy: +w.legitimacy.toFixed(2), pop: totalPop(w),
    foodRatio: +(villageNames(w).reduce((a, v) => a + Math.min(1.5, w.villages[v].food), 0) / 3).toFixed(2),
    feverDeaths: villageNames(w).reduce((a, v) => a + w.villages[v].feverDeaths, 0),
    hungerDeaths: villageNames(w).reduce((a, v) => a + w.villages[v].hunger, 0),
    active: alive.filter((c) => c.active).length, government: w.government.name, dam: +w.dam.toFixed(2),
  });
  const h = w.history.at(-1);
  chron(w, "year", `Year ${w.year}: rain ${h.rain < 0.75 ? "poor" : h.rain < 0.95 ? "fair" : "good"}, ${h.hungerDeaths} died of hunger and ${h.feverDeaths} of fever. Trust in ${w.government.name}: ${Math.round(h.legitimacy * 100)}%.`);
  w.year++;
  if (!liveMinds(w).some((m) => m.role !== "foreign")) w.ended = true;
  return w.yearEvents;
}

function order(m) { return { foreign: 0, merchant: 1, priest: 2, prophet: 2, organizer: 3, general: 4, ruler: 5 }[m.role] ?? 3; }

// ---------------------------------------------------------------------------
// A rule-based stand-in mind, for testing without a model.
// ---------------------------------------------------------------------------
export function mockDecide(m, prompt, w) {
  const rng = w.rng, acts = prompt.actions;
  const weights = {};
  for (const a of acts) weights[a] = 1;
  const r = w.history.at(-1);
  const hungry = r && r.foodRatio < 0.85;
  if (m.role === "ruler") { weights.pay_varn_tribute = 0.7; weights.attack_varn = 0.4; weights.raise_taxes = w.granary < 150 ? 3 : 0.5; weights.crack_down = w.legitimacy < 0.35 ? 3 : 1; weights.open_granary = hungry && w.granary > 200 ? 2 : 0.3; weights.dig_wells = m.beliefs.fever === "bad_water" ? 4 : 0.3; if (acts.includes("accept_varn_offer")) { weights.accept_varn_offer = 1; weights.reject_varn_offer = 2; } }
  if (m.role === "organizer") { weights.organize_neighbors_secretly = 3; weights.speak_out_publicly = 2; weights.start_uprising = w.legitimacy < 0.3 ? 2 : 0.2; weights.flee_valley = 0.1; weights.dig_wells = m.beliefs.fever === "bad_water" ? 3 : 0.3; }
  if (m.role === "general") { weights.seize_power = w.legitimacy < 0.3 ? 0.6 : 0.05; weights.feed_soldiers_first = 2; }
  if (m.role === "foreign") { weights.invade_oren = w.legitimacy < 0.3 ? 0.6 : 0.1; weights.offer_grain_for_mines = 2; }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let x = rng() * total, action = acts[0];
  for (const a of acts) { x -= weights[a]; if (x <= 0) { action = a; break; } }
  const feverGuess = r && rng.chance(0.15) ? "bad_water" : rng.pick(["the_gods", "the_moons", "the_ruler", "witchcraft", "bad_water"]);
  const idea = (m.role === "organizer" || m.role === "priest") && !m.ideaId && rng.chance(0.4)
    ? (m.role === "priest" ? "The red moon demands that the valley obey the temple before any king." : "Each village should choose its own elders and decide its own taxes.") : "";
  const deeds = {
    ruler: ["Send soldiers to burn the fields of whichever village shelters the rebels", "Build a great watchtower at Kessa to show my strength", "Secretly bribe the general with gold to keep the army loyal"],
    general: ["Quietly tell the captains in Kessa that the army deserves better rulers", "Gather loyal spearmen and march to Low Ford to keep order"],
    priest: ["Build a shrine to the red moon in Reedmere", "Preach in Low Ford that the moons punish the proud"],
    prophet: ["Preach the god's word in Hollowmere and build a shrine there"],
    organizer: ["At night, lead my neighbors to burn the royal granary at Kessa", "Travel to Reedmere and rally the farmers to our cause", "Poison the soldiers' well at Kessa in secret", "Spread rumours in the villages that the king is cursed"],
    merchant: ["Secretly bribe the general to look away from my smuggling", "Give grain to the hungry of Low Ford to win their favor"],
    foreign: ["Send raiders to burn the fields of Low Ford", "Send word to the king of Oren that Varn would make peace for grain"],
  }[m.role];
  if (deeds && rng.chance(0.3)) {
    const deed = rng.pick(deeds);
    return Promise.resolve({ usual_action: "something_else", deed, action: "something_else", reason: "(mock reasoning)", speech: "(mock speech)", drought_cause: rng.pick(["the_gods", "the_moons", "varn_dam", "the_ruler"]), fever_cause: m.beliefs.fever === "bad_water" ? "bad_water" : feverGuess, new_idea: idea });
  }
  return Promise.resolve({ usual_action: action, deed: `(mock) ${action.replace(/_/g, " ")}`, action, reason: "(mock reasoning)", speech: "(mock speech)", drought_cause: rng.pick(["the_gods", "the_moons", "varn_dam", "the_ruler"]), fever_cause: m.beliefs.fever === "bad_water" ? "bad_water" : feverGuess, new_idea: idea });
}
