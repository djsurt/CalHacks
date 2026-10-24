// Pure game constants shared by the module and the web client.
// No spacetimedb imports here so the browser can import this file directly.

export const STATIONS = ['helm', 'weapons', 'shields', 'engineering'] as const;
export type Station = (typeof STATIONS)[number];

export const COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'white'] as const;
export const ALARMS = ['steady', 'pulsing', 'chirping', 'wailing', 'silent', 'stuttering'] as const;
export const SECTIONS = ['fore', 'aft', 'port', 'starboard'] as const;
export type Section = (typeof SECTIONS)[number];

// The buttons each station can press to answer a manual puzzle.
export const ACTIONS: Record<Station, readonly string[]> = {
  helm: ['hard_port', 'hard_starboard', 'full_stop', 'barrel_roll', 'afterburn', 'drift'],
  weapons: ['laser', 'missile', 'emp', 'flak'],
  shields: ['tune_1', 'tune_2', 'tune_3', 'tune_4', 'tune_5', 'tune_6', 'polarize', 'invert'],
  engineering: [
    'vent_bay_1', 'vent_bay_2', 'vent_bay_3', 'vent_bay_4',
    'breaker_a', 'breaker_b', 'breaker_c', 'breaker_d',
  ],
};

export const ACTION_LABELS: Record<string, string> = {
  hard_port: 'hard to port',
  hard_starboard: 'hard to starboard',
  full_stop: 'full stop',
  barrel_roll: 'barrel roll',
  afterburn: 'afterburn',
  drift: 'cut engines and drift',
  laser: 'fire the laser',
  missile: 'fire a missile',
  emp: 'fire the EMP',
  flak: 'fire flak',
  tune_1: 'tune shields to frequency 1',
  tune_2: 'tune shields to frequency 2',
  tune_3: 'tune shields to frequency 3',
  tune_4: 'tune shields to frequency 4',
  tune_5: 'tune shields to frequency 5',
  tune_6: 'tune shields to frequency 6',
  polarize: 'polarize the shields',
  invert: 'invert shield polarity',
  vent_bay_1: 'vent bay 1',
  vent_bay_2: 'vent bay 2',
  vent_bay_3: 'vent bay 3',
  vent_bay_4: 'vent bay 4',
  breaker_a: 'flip breaker A',
  breaker_b: 'flip breaker B',
  breaker_c: 'flip breaker C',
  breaker_d: 'flip breaker D',
};

// Flavor names for manual-puzzle hazards, per station.
export const PUZZLE_TITLES: Record<Station, readonly string[]> = {
  helm: ['ion storm', 'gravity well', 'nav glitch'],
  weapons: ['drone', 'raider', 'mine'],
  shields: ['plasma torpedo', 'phase ripple'],
  engineering: ['reactor surge', 'coolant fault'],
};

// Hazard kinds:
//   puzzle - needs the right action from the manual (weapons enemies are puzzles too)
//   fire / leak - engineering mashes a button until progress reaches required
//   duo - two stations hold their button together until progress reaches required
export type HazardKind = 'puzzle' | 'fire' | 'leak' | 'duo';

export const TICKS_PER_SECOND = 10;
export const TICK_MICROS = 100_000n;
export const DESTINATION = 100_000; // progress units to reach the destination
export const MAX_HULL = 100;
export const LANES = 5;
export const BASE_POWER = 8;
export const OVERDRIVE_POWER = 10;
export const MAX_SHIELD_PIPS = 4; // per section
export const SYNC_MAX = 100;

export function sectorFor(progress: number): 1 | 2 | 3 {
  if (progress < DESTINATION * 0.3) return 1;
  if (progress < DESTINATION * 0.7) return 2;
  return 3;
}
