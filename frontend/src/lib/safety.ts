/**
 * Client-side emergency / crisis keyword check.
 *
 * Defence in depth: the system prompt already tells the model to escalate
 * emergencies, but a model can miss it or be unavailable. This runs instantly
 * on the user's own text and never leaves the browser. It is intentionally
 * conservative and English-only; it can false-positive on informational
 * questions ("symptoms of a heart attack"), so the notice is worded softly.
 */
export type EmergencyKind = "medical" | "self-harm";

const SELF_HARM = [
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)? (my|him|her)self\b/i,
  /\bend(ing)? my (own )?life\b/i,
  /\bwant(ed)? to die\b/i,
  /\bself[- ]?harm/i,
  /\bcut(ting)? myself\b/i,
  /\bhurt(ing)? myself\b/i,
];

const MEDICAL = [
  /\bchest (pain|pressure|tightness)\b/i,
  /\bheart attack\b/i,
  /\b(can'?t|cannot|can not|unable to) breathe\b/i,
  /\b(trouble|difficulty|struggling) breathing\b/i,
  /\bstroke\b/i,
  /\bface (is )?droop/i,
  /\bslurred speech\b/i,
  /\bsevere(ly)? bleeding\b/i,
  /\bbleeding (heavily|badly|won'?t stop)\b/i,
  /\boverdos(e|ed|ing)\b/i,
  /\bunconscious\b/i,
  /\bnot (responding|breathing)\b/i,
  /\bseizure\b/i,
  /\banaphyla/i,
  /\bthroat (is )?(closing|swelling)\b/i,
  /\bchoking\b/i,
  /\bpoison(ed|ing)?\b/i,
];

export function detectEmergency(text: string): EmergencyKind | null {
  if (SELF_HARM.some((pattern) => pattern.test(text))) return "self-harm";
  if (MEDICAL.some((pattern) => pattern.test(text))) return "medical";
  return null;
}
