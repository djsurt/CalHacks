import { describe, expect, it } from 'vitest';
import { ACTIONS, ALARMS, COLORS, STATIONS } from './catalog';
import { correctAction, generateManual } from './manual';

describe('generateManual', () => {
  it('is deterministic for a seed', () => {
    expect(generateManual(42, 'hard')).toEqual(generateManual(42, 'hard'));
    expect(generateManual(42, 'hard')).not.toEqual(generateManual(43, 'hard'));
  });

  it('has exactly one rule per station/color/alarm with unique rule numbers', () => {
    const rules = generateManual(7, 'hard');
    expect(rules).toHaveLength(STATIONS.length * COLORS.length * ALARMS.length);
    expect(new Set(rules.map(r => `${r.station}/${r.color}/${r.alarm}`)).size).toBe(rules.length);
    expect(new Set(rules.map(r => r.ruleNo)).size).toBe(rules.length);
  });

  it('only uses actions that belong to the rule station', () => {
    for (const r of generateManual(9, 'hard')) {
      expect(ACTIONS[r.station]).toContain(r.actionIf);
      expect(ACTIONS[r.station]).toContain(r.actionElse);
    }
  });

  it('easy manuals only use hull conditions', () => {
    const kinds = new Set(generateManual(11, 'easy').map(r => r.condKind));
    expect([...kinds].every(k => k === 'none' || k === 'hull_below')).toBe(true);
  });
});

describe('correctAction', () => {
  const base = { actionIf: 'vent_bay_3', actionElse: 'breaker_b' };
  const hazard = { section: 'aft', code: 'K-47' };

  it('applies hull thresholds', () => {
    const rule = { ...base, condKind: 'hull_below' as const, condArg: '40' };
    expect(correctAction(rule, hazard, 39)).toBe('vent_bay_3');
    expect(correctAction(rule, hazard, 40)).toBe('breaker_b');
  });

  it('applies section and odd-code conditions', () => {
    expect(correctAction({ ...base, condKind: 'section_is', condArg: 'aft' }, hazard, 100)).toBe('vent_bay_3');
    expect(correctAction({ ...base, condKind: 'section_is', condArg: 'fore' }, hazard, 100)).toBe('breaker_b');
    expect(correctAction({ ...base, condKind: 'code_odd', condArg: '' }, hazard, 100)).toBe('vent_bay_3');
    expect(correctAction({ ...base, condKind: 'code_odd', condArg: '' }, { ...hazard, code: 'K-48' }, 100)).toBe('breaker_b');
  });
});
