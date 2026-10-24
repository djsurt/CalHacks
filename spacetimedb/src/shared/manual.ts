// Seeded ship-manual generator and rule evaluator. Pure: no spacetimedb imports.
//
// Every (station, color, alarm) combination has exactly one rule, so the
// computer never has to reason about rule priority. A rule may carry one
// condition that picks between two actions.

import { ACTIONS, ACTION_LABELS, ALARMS, COLORS, PUZZLE_TITLES, SECTIONS, STATIONS, type Station } from './catalog';

export type Difficulty = 'easy' | 'hard';
export type CondKind = 'none' | 'hull_below' | 'section_is' | 'code_odd';

export interface ManualRule {
  ruleNo: number;
  station: Station;
  color: string;
  alarm: string;
  title: string; // hazards matching this rule spawn with this name
  condKind: CondKind;
  condArg: string; // hull threshold ("40") or section name ("aft"); empty otherwise
  actionIf: string;
  actionElse: string; // same as actionIf when condKind is 'none'
  text: string;
}

export interface HazardFacts {
  section: string;
  code: string; // like "K-47"
}

// mulberry32: tiny deterministic PRNG so the manual depends only on the seed.
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(arr: readonly T[]): T => arr[int(arr.length)];
  return { next, int, pick };
}

export function generateManual(seed: number, difficulty: Difficulty): ManualRule[] {
  const rng = makeRng(seed);
  const combos: { station: Station; color: string; alarm: string }[] = [];
  for (const station of STATIONS)
    for (const color of COLORS)
      for (const alarm of ALARMS) combos.push({ station, color, alarm });

  // Shuffle rule numbers so neighbouring numbers are unrelated.
  const numbers = combos.map((_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  const conditionChance = difficulty === 'easy' ? 0.25 : 0.7;
  return combos.map((c, i) => {
    const actions = ACTIONS[c.station];
    const actionIf = rng.pick(actions);
    let condKind: CondKind = 'none';
    let condArg = '';
    let actionElse = actionIf;
    if (rng.next() < conditionChance) {
      condKind = difficulty === 'easy' ? 'hull_below' : rng.pick(['hull_below', 'section_is', 'code_odd'] as const);
      if (condKind === 'hull_below') condArg = String(rng.pick([30, 40, 50, 60]));
      if (condKind === 'section_is') condArg = rng.pick(SECTIONS);
      do actionElse = rng.pick(actions);
      while (actionElse === actionIf);
    }
    const title = rng.pick(PUZZLE_TITLES[c.station]);
    const rule: ManualRule = { ruleNo: numbers[i], ...c, title, condKind, condArg, actionIf, actionElse, text: '' };
    rule.text = renderRule(rule);
    return rule;
  });
}

function renderRule(r: ManualRule): string {
  const head = `Rule ${r.ruleNo} (${r.station.toUpperCase()}): ${r.color} ${r.title} with a ${r.alarm} alarm`;
  const a = ACTION_LABELS[r.actionIf];
  const b = ACTION_LABELS[r.actionElse];
  switch (r.condKind) {
    case 'none':
      return `${head}: ${a}.`;
    case 'hull_below':
      return `${head}: if hull is below ${r.condArg}%, ${a}; otherwise ${b}.`;
    case 'section_is':
      return `${head}: if it is in the ${r.condArg} section, ${a}; otherwise ${b}.`;
    case 'code_odd':
      return `${head}: if its code ends in an odd digit, ${a}; otherwise ${b}.`;
  }
}

export function conditionHolds(rule: Pick<ManualRule, 'condKind' | 'condArg'>, hazard: HazardFacts, hull: number): boolean {
  switch (rule.condKind) {
    case 'none':
      return true;
    case 'hull_below':
      return hull < Number(rule.condArg);
    case 'section_is':
      return hazard.section === rule.condArg;
    case 'code_odd':
      return Number(hazard.code.slice(-1)) % 2 === 1;
  }
}

export function correctAction(
  rule: Pick<ManualRule, 'condKind' | 'condArg' | 'actionIf' | 'actionElse'>,
  hazard: HazardFacts,
  hull: number,
): string {
  return conditionHolds(rule, hazard, hull) ? rule.actionIf : rule.actionElse;
}
