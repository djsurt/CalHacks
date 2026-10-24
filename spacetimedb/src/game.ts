// Game rules: round setup, the per-tick simulation, spawning, damage and fixes.
// Helpers take the ship row by reference and mutate it; callers write it back once.

import { SenderError } from 'spacetimedb/server';
import {
  ALARMS, BASE_POWER, COLORS, DESTINATION, LANES, MAX_HULL, MAX_SHIELD_PIPS, OVERDRIVE_POWER,
  SECTIONS, STATIONS, SYNC_MAX, sectorFor, type Section, type Station,
} from './shared/catalog';
import { correctAction, generateManual, makeRng, type CondKind, type Difficulty } from './shared/manual';
import type { Ctx, Hazard, Player, Room, Ship } from './schema';

// ---------- tuning knobs ----------
const PUZZLE_DEADLINE = { easy: 250, hard: 200 }; // ticks
const ENEMY_DEADLINE = { easy: 200, hard: 150 };
const DUO_DEADLINE = 200;
const DUO_HOLD_TICKS = 30;
const FIRE_TAPS = 8;
const LEAK_SWIPES = 6;
const DRAIN_EVERY = 20; // fires/leaks cost 1 hull every 2s
const SYNC_PER_FIX = 12;
const SYNC_PER_MISTAKE = 20;
const SYNC_BOOST_TICKS = 100;
const JUMP_PROGRESS = DESTINATION / 10;
const MAX_FIRES = 3;

// Per-tick spawn chances by sector (index 0 unused). Easy multiplies by 0.7.
const ASTEROID_CHANCE = [0, 1 / 22, 1 / 16, 1 / 12];
const PUZZLE_CHANCE = [0, 0, 1 / 90, 1 / 60];
const ENEMY_CHANCE = [0, 0, 1 / 100, 1 / 70];
const DUO_CHANCE = [0, 0, 0, 1 / 250];

// ---------- small helpers ----------
// ctx.random is seeded from the reducer timestamp and its first draw per call is
// badly skewed (often exactly 0 at 100ms spacing), so we hash the timestamp into
// our own PRNG instead. Still deterministic, which reducers require.
const rngs = new WeakMap<Ctx, ReturnType<typeof makeRng>>();
function rng(ctx: Ctx) {
  let r = rngs.get(ctx);
  if (!r) {
    const micros = ctx.timestamp.microsSinceUnixEpoch;
    r = makeRng(Number(micros & 0xffffffffn) ^ Number((micros >> 32n) & 0xffffffffn));
    rngs.set(ctx, r);
  }
  return r;
}
const pick = <T>(ctx: Ctx, arr: readonly T[]): T => rng(ctx).pick(arr);
const chance = (ctx: Ctx, p: number) => rng(ctx).next() < p;
const intIn = (ctx: Ctx, min: number, max: number) => min + rng(ctx).int(max - min + 1);

export function logEvent(ctx: Ctx, roomId: number, tick: number, kind: string, station: string, text: string) {
  ctx.db.event.insert({ id: 0n, roomId, tick, kind, station, text });
}

export function freshShip(roomId: number): Ship {
  return {
    roomId, tick: 0, hull: MAX_HULL, progress: 0,
    lane: 2, throttle: 2,
    powerEngines: 3, powerWeapons: 2, powerShields: 3, overdrive: false, heat: 0, patchReadyTick: 0,
    shieldFore: 1, shieldAft: 0, shieldPort: 1, shieldStarboard: 1, shieldFreq: 1,
    weaponReadyTick: 0,
    sync: 0, syncBoostUntil: 0, jumpUsed: false,
  };
}

const PIP_FIELDS: Record<Section, 'shieldFore' | 'shieldAft' | 'shieldPort' | 'shieldStarboard'> = {
  fore: 'shieldFore', aft: 'shieldAft', port: 'shieldPort', starboard: 'shieldStarboard',
};

export function shieldTotal(ship: Ship) {
  return ship.shieldFore + ship.shieldAft + ship.shieldPort + ship.shieldStarboard;
}

// After Engineering lowers shield power, drain pips from the fullest sections.
export function clampShields(ship: Ship) {
  while (shieldTotal(ship) > ship.powerShields) {
    const fullest = SECTIONS.reduce((a, b) => (ship[PIP_FIELDS[b]] > ship[PIP_FIELDS[a]] ? b : a));
    ship[PIP_FIELDS[fullest]] -= 1;
  }
}

export function powerBudget(ship: Ship) {
  return ship.overdrive ? OVERDRIVE_POWER : BASE_POWER;
}

// Shield pips in the hit section soak up to 75% of the damage.
function damage(ctx: Ctx, ship: Ship, base: number, section: string | null, why: string) {
  let amount = base;
  if (section) {
    const pips = Math.min(ship[PIP_FIELDS[section as Section]] ?? 0, MAX_SHIELD_PIPS);
    amount = Math.max(1, Math.round(base * (1 - pips * 0.1875)));
  }
  ship.hull = Math.max(0, ship.hull - amount);
  logEvent(ctx, ship.roomId, ship.tick, 'hit', '', `${why} (-${amount} hull)`);
}

function addSync(ctx: Ctx, ship: Ship, delta: number) {
  ship.sync = Math.max(0, Math.min(SYNC_MAX, ship.sync + delta));
  if (ship.sync >= SYNC_MAX) {
    ship.sync = 0;
    ship.syncBoostUntil = ship.tick + SYNC_BOOST_TICKS;
    logEvent(ctx, ship.roomId, ship.tick, 'sync', '', 'CREW SYNC! Engines overdrive for 10 seconds');
  }
}

function hazardsIn(ctx: Ctx, roomId: number): Hazard[] {
  return [...ctx.db.hazard.roomId.filter(roomId)];
}

// ---------- round lifecycle ----------
function clearRoom(ctx: Ctx, roomId: number) {
  ctx.db.hazard.roomId.delete(roomId);
  ctx.db.asteroid.roomId.delete(roomId);
  ctx.db.event.roomId.delete(roomId);
  for (const rule of [...ctx.db.manualRule.by_room_combo.filter(roomId)]) ctx.db.manualRule.id.delete(rule.id);
  for (const p of ctx.db.player.roomId.filter(roomId)) {
    ctx.db.player.identity.update({ ...p, fixes: 0, mistakes: 0, holdingJump: false });
  }
}

export function startRound(ctx: Ctx, room: Room) {
  clearRoom(ctx, room.id);
  const seed = intIn(ctx, 1, 2_000_000_000);
  const round = room.round + 1;
  for (const rule of generateManual(seed, room.difficulty as Difficulty)) {
    ctx.db.manualRule.insert({ id: 0n, roomId: room.id, round, ...rule });
  }
  ctx.db.room.id.update({ ...room, status: 'running', seed, round });
  ctx.db.ship.roomId.update(freshShip(room.id));
  logEvent(ctx, room.id, 0, 'round', '', `Round ${round} started (${room.difficulty}). Reach the destination!`);
}

export function resetRound(ctx: Ctx, room: Room) {
  clearRoom(ctx, room.id);
  ctx.db.room.id.update({ ...room, status: 'lobby' });
  ctx.db.ship.roomId.update(freshShip(room.id));
}

// ---------- spawning ----------
export function spawnAsteroid(ctx: Ctx, ship: Ship) {
  const travel = 50 - ship.throttle * 10; // 4s / 3s / 2s
  ctx.db.asteroid.insert({
    id: 0n, roomId: ship.roomId,
    lane: intIn(ctx, 0, LANES - 1),
    section: pick(ctx, ['fore', 'fore', 'port', 'starboard']),
    big: chance(ctx, 0.3),
    spawnTick: ship.tick, arriveTick: ship.tick + travel,
  });
}

function otherStation(ctx: Ctx, station: Station): Station {
  return pick(ctx, STATIONS.filter(s => s !== station));
}

// A manual puzzle for `station` (Weapons puzzles are incoming enemies).
export function spawnPuzzle(ctx: Ctx, ship: Ship, room: Room, station: Station) {
  const color = pick(ctx, COLORS);
  const alarm = pick(ctx, ALARMS);
  const rule = ctx.db.manualRule.by_room_combo.filter([room.id, station, color, alarm]).next().value;
  const difficulty = room.difficulty as Difficulty;
  const deadline = station === 'weapons' ? ENEMY_DEADLINE[difficulty] : PUZZLE_DEADLINE[difficulty];
  const hidden = difficulty === 'hard' && chance(ctx, 0.5);
  const h = ctx.db.hazard.insert({
    id: 0n, roomId: room.id, kind: 'puzzle', station, partnerStation: '',
    shownOn: hidden ? otherStation(ctx, station) : station,
    title: rule?.title ?? 'anomaly', color, alarm,
    section: pick(ctx, SECTIONS),
    code: `${pick(ctx, [...'ABCDEFGHJKLMNPRSTVWXZ'])}-${intIn(ctx, 10, 99)}`,
    spawnTick: ship.tick, deadlineTick: ship.tick + deadline,
    progress: 0, required: 1, holdA: false, holdB: false,
  });
  logEvent(ctx, room.id, ship.tick, 'spawn', station,
    `${station}: ${h.color} ${h.title}, ${h.alarm} alarm, code ${h.code}, ${h.section} section`);
}

export function spawnRepair(ctx: Ctx, ship: Ship, kind: 'fire' | 'leak', section: string) {
  const active = hazardsIn(ctx, ship.roomId).filter(h => h.kind === 'fire' || h.kind === 'leak');
  if (active.length >= MAX_FIRES) return;
  ctx.db.hazard.insert({
    id: 0n, roomId: ship.roomId, kind, station: 'engineering', partnerStation: '', shownOn: 'engineering',
    title: kind === 'fire' ? 'fire' : 'hull leak', color: '', alarm: '', section, code: '',
    spawnTick: ship.tick, deadlineTick: 0,
    progress: 0, required: kind === 'fire' ? FIRE_TAPS : LEAK_SWIPES, holdA: false, holdB: false,
  });
  logEvent(ctx, ship.roomId, ship.tick, 'spawn', 'engineering', `${kind === 'fire' ? 'Fire' : 'Hull leak'} in the ${section} section`);
}

export function spawnDuo(ctx: Ctx, ship: Ship) {
  const station = pick(ctx, STATIONS);
  const partner = otherStation(ctx, station);
  const title = pick(ctx, ['hull breach', 'core instability', 'gravity shear']);
  ctx.db.hazard.insert({
    id: 0n, roomId: ship.roomId, kind: 'duo', station, partnerStation: partner, shownOn: station,
    title, color: '', alarm: '', section: pick(ctx, SECTIONS), code: '',
    spawnTick: ship.tick, deadlineTick: ship.tick + DUO_DEADLINE,
    progress: 0, required: DUO_HOLD_TICKS, holdA: false, holdB: false,
  });
  logEvent(ctx, ship.roomId, ship.tick, 'spawn', station,
    `${title.toUpperCase()}! ${station} and ${partner} must hold together`);
}

// ---------- player actions ----------
export function resolvePuzzle(ctx: Ctx, ship: Ship, room: Room, player: Player, h: Hazard, action: string) {
  const rule = ctx.db.manualRule.by_room_combo.filter([room.id, h.station, h.color, h.alarm]).next().value;
  if (!rule) throw new SenderError('No manual rule for this hazard');
  if (h.station === 'weapons') {
    if (ship.powerWeapons === 0) throw new SenderError('Weapons have no power');
    if (ship.tick < ship.weaponReadyTick) throw new SenderError('Weapons recharging');
    ship.weaponReadyTick = ship.tick + Math.max(5, 30 - ship.powerWeapons * 5);
  }
  if (action.startsWith('tune_')) ship.shieldFreq = Number(action.slice(5));

  if (action === correctAction({ ...rule, condKind: rule.condKind as CondKind }, h, ship.hull)) {
    ctx.db.hazard.id.delete(h.id);
    ctx.db.player.identity.update({ ...player, fixes: player.fixes + 1 });
    addSync(ctx, ship, SYNC_PER_FIX);
    logEvent(ctx, room.id, ship.tick, 'fixed', h.station, `${player.name} fixed the ${h.color} ${h.title} (rule ${rule.ruleNo})`);
  } else {
    // Wrong fixes make things worse: damage, less time, sync drops.
    ctx.db.hazard.id.update({ ...h, deadlineTick: Math.max(ship.tick + 30, h.deadlineTick - 30) });
    ctx.db.player.identity.update({ ...player, mistakes: player.mistakes + 1 });
    addSync(ctx, ship, -SYNC_PER_MISTAKE);
    logEvent(ctx, room.id, ship.tick, 'mistake', h.station, `${player.name} tried to ${action.replace(/_/g, ' ')} on the ${h.color} ${h.title}. Wrong!`);
    damage(ctx, ship, 4, null, 'Backfire');
  }
}

export function workRepair(ctx: Ctx, ship: Ship, player: Player, h: Hazard) {
  const progress = h.progress + 1;
  if (progress < h.required) {
    ctx.db.hazard.id.update({ ...h, progress });
    return;
  }
  ctx.db.hazard.id.delete(h.id);
  ctx.db.player.identity.update({ ...player, fixes: player.fixes + 1 });
  addSync(ctx, ship, SYNC_PER_FIX / 2);
  logEvent(ctx, ship.roomId, ship.tick, 'fixed', 'engineering', `${player.name} dealt with the ${h.title} in ${h.section}`);
}

// ---------- the tick ----------
export function tickRoom(ctx: Ctx, room: Room) {
  const ship = ctx.db.ship.roomId.find(room.id);
  if (!ship) return;
  ship.tick += 1;
  const sector = sectorFor(ship.progress);
  const ease = room.difficulty === 'easy' ? 0.7 : 1;

  // Reactor heat: overdrive heats up, otherwise cools down. Overheating overloads.
  if (ship.overdrive) {
    if (ship.tick % 2 === 0) ship.heat = Math.min(100, ship.heat + 1);
  } else {
    ship.heat = Math.max(0, ship.heat - 1);
  }
  if (ship.heat >= 100) {
    ship.overdrive = false;
    ship.heat = 50;
    let over = ship.powerEngines + ship.powerWeapons + ship.powerShields - BASE_POWER;
    for (const key of ['powerEngines', 'powerWeapons', 'powerShields'] as const) {
      const cut = Math.min(over, ship[key]);
      ship[key] -= cut;
      over -= cut;
    }
    clampShields(ship);
    damage(ctx, ship, 8, null, 'Reactor overload');
    spawnPuzzle(ctx, ship, room, 'engineering');
  }

  // Forward motion.
  const boost = ship.tick < ship.syncBoostUntil ? 1.5 : 1;
  ship.progress += Math.round((ship.throttle * 20 + ship.powerEngines * 5) * boost);

  // Asteroids arriving this tick.
  for (const a of [...ctx.db.asteroid.roomId.filter(room.id)]) {
    if (a.arriveTick > ship.tick) continue;
    ctx.db.asteroid.id.delete(a.id);
    if (a.lane !== ship.lane) continue;
    damage(ctx, ship, a.big ? 12 : 6, a.section, `${a.big ? 'Big asteroid' : 'Asteroid'} hit ${a.section}`);
    if (chance(ctx, 0.4)) spawnRepair(ctx, ship, pick(ctx, ['fire', 'leak'] as const), a.section);
  }

  // Hazards: deadlines, drains, duo holds.
  for (const h of hazardsIn(ctx, room.id)) {
    if (h.kind === 'fire' || h.kind === 'leak') {
      if ((ship.tick - h.spawnTick) % DRAIN_EVERY === 0) {
        ship.hull = Math.max(0, ship.hull - 1);
      }
      continue;
    }
    if (h.kind === 'duo' && h.holdA && h.holdB) {
      const progress = h.progress + 1;
      if (progress >= h.required) {
        ctx.db.hazard.id.delete(h.id);
        addSync(ctx, ship, SYNC_PER_FIX * 2);
        logEvent(ctx, room.id, ship.tick, 'fixed', h.station, `${h.station} and ${h.partnerStation} contained the ${h.title}!`);
        continue;
      }
      ctx.db.hazard.id.update({ ...h, progress });
    }
    if (h.deadlineTick !== 0 && ship.tick >= h.deadlineTick) {
      ctx.db.hazard.id.delete(h.id);
      logEvent(ctx, room.id, ship.tick, 'failed', h.station, `The ${h.color} ${h.title} was not handled`.replace('  ', ' '));
      if (h.station === 'weapons' && h.kind === 'puzzle') {
        damage(ctx, ship, 12, h.section, `Enemy ${h.title} struck ${h.section}`);
        if (chance(ctx, 0.5)) spawnRepair(ctx, ship, 'fire', h.section);
      } else if (h.kind === 'duo') {
        damage(ctx, ship, 15, null, `${h.title} tore through the ship`);
      } else {
        damage(ctx, ship, 10, null, `${h.title} damaged the ship`);
        if (h.station === 'engineering') spawnRepair(ctx, ship, 'fire', h.section);
      }
    }
  }

  // New threats. At most one active puzzle per station (two enemies for Weapons).
  if (chance(ctx, ASTEROID_CHANCE[sector] * ease * (0.6 + ship.throttle * 0.2))) spawnAsteroid(ctx, ship);
  const active = hazardsIn(ctx, room.id);
  const puzzlesFor = (s: Station) => active.filter(h => h.kind === 'puzzle' && h.station === s).length;
  // Tutorial puzzle about 20 seconds in, so sector 1 teaches the manual.
  if (ship.tick === 200) spawnPuzzle(ctx, ship, room, pick(ctx, ['helm', 'shields', 'engineering'] as const));
  if (chance(ctx, PUZZLE_CHANCE[sector] * ease)) {
    const station = pick(ctx, ['helm', 'shields', 'engineering'] as const);
    if (puzzlesFor(station) === 0) spawnPuzzle(ctx, ship, room, station);
  }
  if (chance(ctx, ENEMY_CHANCE[sector] * ease) && puzzlesFor('weapons') < 2) spawnPuzzle(ctx, ship, room, 'weapons');
  if (chance(ctx, DUO_CHANCE[sector] * ease) && !active.some(h => h.kind === 'duo')) spawnDuo(ctx, ship);

  // Emergency jump: every station staffed and holding at once.
  if (!ship.jumpUsed) {
    const crew = [...ctx.db.player.roomId.filter(room.id)].filter(p => p.online && p.station !== '');
    const holding = new Set(crew.filter(p => p.holdingJump).map(p => p.station));
    if (holding.size === STATIONS.length) {
      ship.jumpUsed = true;
      ship.progress += JUMP_PROGRESS;
      logEvent(ctx, room.id, ship.tick, 'jump', '', 'EMERGENCY JUMP! The whole crew punched it together');
    }
  }

  // Win / lose.
  if (ship.hull <= 0) {
    ctx.db.room.id.update({ ...room, status: 'lost' });
    logEvent(ctx, room.id, ship.tick, 'round', '', 'Hull breached. The ship is lost.');
  } else if (ship.progress >= DESTINATION) {
    ship.progress = DESTINATION;
    ctx.db.room.id.update({ ...room, status: 'won' });
    logEvent(ctx, room.id, ship.tick, 'round', '', 'Destination reached! The crew wins!');
  }
  ctx.db.ship.roomId.update(ship);
}
