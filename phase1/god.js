// The Demiurge – Phase 1: the player as a god who can speak to any inhabitant.
// Builds prompts for divine contact and for "thoughts on demand", and applies the results.
import { WORLD_TEXT, SYSTEM_TEXT, chron, remember, promote, createOrUpdateIdea, liveMinds, observationsFor, countBelievers } from "../phase0/sim.js";

export const GOD_COSTS = { dream: 10, sign: 25, voice: 40 };

const CHANNEL_TEXT = {
  dream: (msg) => `Tonight, as you sleep, you dream. In the dream, something speaks or shows you this: "${msg}". You wake before dawn, unsure whether it was more than a dream.`,
  sign: (msg) => `Today, in front of you and others nearby, something impossible happens: ${msg}. Everyone who saw it is shaken.`,
  voice: (msg) => `You are wide awake when a voice, not from any person, speaks clearly to you alone: "${msg}". There is no mistaking it; it was real.`,
};

function citizenProfile(w, c) {
  const v = w.villages[c.village];
  const idea = c.idea ? w.ideas.find((i) => i.id === c.idea) : null;
  const faith = c.faith ? w.ideas.find((i) => i.id === c.faith) : null;
  return `YOU ARE: ${c.name} of ${c.village}, a ${c.trait} ${c.job} aged ${c.age}.
Your life: ${c.grief > 0.5 ? "you have recently buried people you loved" : c.grief > 0.2 ? "you have lost neighbors to hunger and fever" : "you have kept your family alive so far"}. Your village ${v.food < 0.75 ? "is going hungry" : v.food < 0.95 ? "is getting by on little" : "has enough to eat"}; ${v.feverDeaths} died of fever there last year.
${idea ? `You follow ${idea.name}, which says: "${idea.tenet}"` : "You follow no political cause."} ${faith ? `Your faith is ${faith.name}: "${faith.tenet}"` : ""} ${c.active ? "You have begun to openly defy the rulers." : ""}
${c.creditsGod ? `You believe ${c.godName || "a god"} has spoken to you before.` : ""}
What you remember: ${(c.memories || []).slice(-5).join(" ") || "nothing out of the ordinary."}`;
}

function mindProfile(w, m) {
  return `YOU ARE: ${m.title === m.name ? m.name : `${m.title} (${m.name})`}.
WHAT DRIVES YOU MOST: ${m.motive}
Personality: ${m.traits}. Goals: ${m.goals}. Secret: ${m.secret}
What you remember:
${m.memories.slice(-8).map((x) => "- " + x).join("\n")}
What you see this year:
${observationsFor(w, m).map((o) => "- " + o).join("\n")}`;
}

export function godSchema() {
  return {
    type: "object",
    properties: {
      reaction: { type: "string", maxLength: 300 },
      reply: { type: "string", maxLength: 300 },
      interpretation: { type: "string", maxLength: 250 },
      believes_a_god_spoke: { type: "boolean" },
      god_name: { type: "string", maxLength: 40 },
      will_tell_others: { type: "boolean" },
      message_to_others: { type: "string", maxLength: 250 },
      will_obey: { enum: ["yes", "no", "unsure"] },
    },
    required: ["reaction", "reply", "interpretation", "believes_a_god_spoke", "god_name", "will_tell_others", "message_to_others", "will_obey"],
    additionalProperties: false,
  };
}

export function buildGodPrompt(w, target, channel, message) {
  message = String(message).trim().replace(/[.!?]+$/, "");
  const isMind = !!target.role;
  const profile = isMind ? mindProfile(w, target) : citizenProfile(w, target);
  const user = `${WORLD_TEXT}

YEAR ${w.year}.
${profile}

WHAT HAPPENS NOW: ${CHANNEL_TEXT[channel](message)}

TASK: React as yourself. You may believe, doubt, fear, refuse, bargain or demand proof; you may obey or not. If you think a god or spirit spoke, give it a name of your own (or leave god_name empty). Decide whether you will tell others, and what you would tell them.
Reply with JSON: {"reaction" (what you feel and do, 1-2 sentences), "reply" (what you say back or aloud, 1-2 sentences), "interpretation" (what you think this was), "believes_a_god_spoke" (true/false), "god_name", "will_tell_others" (true/false), "message_to_others" (what you would tell people, or ""), "will_obey" ("yes", "no" or "unsure")}`;
  return { system: SYSTEM_TEXT, user, schema: godSchema() };
}

export function mockGodResponse(w, target, channel) {
  const believe = channel === "voice" ? w.rng.chance(0.8) : channel === "sign" ? w.rng.chance(0.6) : w.rng.chance(0.35);
  const tell = believe && w.rng.chance(channel === "dream" ? 0.3 : 0.6);
  return {
    reaction: believe ? "(mock) trembles and kneels." : "(mock) shakes it off as a trick of the mind.",
    reply: believe ? "(mock) I hear you." : "(mock) Who is there?",
    interpretation: believe ? "(mock) a god has spoken" : "(mock) a strange dream",
    believes_a_god_spoke: believe, god_name: believe ? "the Watcher" : "", will_tell_others: tell,
    message_to_others: tell ? "(mock) The Watcher sees us and has spoken to me." : "", will_obey: believe ? "yes" : "unsure",
  };
}

// Apply a divine contact. Returns a short summary for the UI.
export function applyGodAct(w, target, channel, message, r) {
  const cost = GOD_COSTS[channel];
  w.god.power = Math.max(0, w.god.power - cost);
  const isMind = !!target.role;
  const name = isMind ? target.name : `${target.name} of ${target.village}`;
  const act = { year: w.year, channel, message, target: name, response: r };
  w.god.acts.push(act);

  const channelWord = { dream: "a dream", sign: "a sign", voice: "a voice" }[channel];
  chron(w, "god", `The god sent ${channelWord} to ${name}: "${message}"`, name);
  const e = chron(w, "god", `${name}: ${r.reaction}`, name);
  if (r.reply) e.speech = r.reply;

  const memo = `${channel === "dream" ? "You dreamed" : channel === "sign" ? "You saw a sign" : "A voice spoke to you"}: "${message}". You took it to be ${r.interpretation}. You ${r.will_obey === "yes" ? "resolved to obey" : r.will_obey === "no" ? "refused it" : "were unsure what to do"}.`;
  if (isMind) remember(target, memo);
  else { target.memories = target.memories || []; target.memories.push(`In ${w.year}: ${memo}`); }

  if (r.believes_a_god_spoke) {
    target.creditsGod = true;
    if (r.god_name) target.godName = r.god_name;
    if (isMind && channel !== "sign") target.divine = { year: w.year, message, god: r.god_name || target.godName, obey: r.will_obey };
  }

  // A sign is seen by the whole village (or the fort).
  const place = isMind ? target.place : target.village;
  if (channel === "sign" && w.villages[place]) {
    let moved = 0;
    for (const c of w.citizens) if (c.alive && c.village === place && c !== target && w.rng.chance(0.35)) {
      c.creditsGod = true; c.godName = c.godName || r.god_name || "the Unseen"; moved++;
      c.memories = c.memories || []; c.memories.push(`In ${w.year}: you saw a sign: ${message}.`);
    }
    if (moved) chron(w, "god", `${moved} of the named folk of ${place} who saw the sign came to believe a god had shown itself.`);
  }

  // An ordinary person who is spoken to openly, or who means to spread the word, becomes a prophet.
  let speaker = isMind ? target : null;
  if (!isMind && r.believes_a_god_spoke && (channel === "voice" || r.will_tell_others)) {
    const m = promote(w, target, `who claimed ${r.god_name || "a god"} had spoken to them`);
    if (m) {
      m.role = "prophet"; m.title = `${m.name}, the prophet`; m.creditsGod = true; m.godName = r.god_name || "the Voice";
      m.motive = `${m.godName} spoke to you: "${message}".`;
      m.goals = `make the valley hear what ${m.godName} told you`;
      m.memories.push(memo);
      m.divine = { year: w.year, message, god: m.godName, obey: r.will_obey };
      speaker = m;
    }
  }

  // Spreading the word creates (or renews) a faith that credits the god.
  if (r.will_tell_others && r.message_to_others && speaker) {
    const godName = r.god_name || speaker.godName || "the Voice";
    const idea = createOrUpdateIdea(w, speaker, r.message_to_others, { kind: "faith", creditsGod: true, name: `the Faith of ${godName}` });
    if (idea) { speaker.ideaId = idea.id; act.ideaId = idea.id; }
  }
  countBelievers(w);
  return act;
}

// Thoughts on demand for an ordinary villager.
export function buildThoughtPrompt(w, c) {
  const user = `${WORLD_TEXT}

YEAR ${w.year}.
${citizenProfile(w, c)}

TASK: The player is watching you right now. What are you thinking in this moment?
Reply with JSON: {"thought" (1-2 sentences, in your own voice), "feeling" (one word)}`;
  const schema = { type: "object", properties: { thought: { type: "string", maxLength: 300 }, feeling: { type: "string", maxLength: 24 } }, required: ["thought", "feeling"], additionalProperties: false };
  return { system: SYSTEM_TEXT, user, schema };
}

export function believerSummary(w) {
  const prophets = liveMinds(w).filter((m) => m.creditsGod);
  const faiths = w.ideas.filter((i) => i.creditsGod);
  return { believers: w.god.believers, prophets, faiths };
}
