// Module entry. Every named export here must be a reducer or lifecycle hook.
import { ScheduleAt } from 'spacetimedb';
import { SenderError, t } from 'spacetimedb/server';
import spacetimedb, { tickTimer, type Ctx } from './schema';
import { ACTIONS, LANES, MAX_HULL, MAX_SHIELD_PIPS, STATIONS, TICK_MICROS, type Station } from './shared/catalog';
import {
  clampShields, freshShip, logEvent, powerBudget, resetRound, resolvePuzzle, spawnAsteroid, spawnDuo,
  spawnPuzzle, spawnRepair, startRound, tickRoom, workRepair,
} from './game';

export default spacetimedb;

// ---------- helpers (not exported) ----------
function ensureTickTimer(ctx: Ctx) {
  if (ctx.db.tickTimer.count() === 0n) {
    ctx.db.tickTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS) });
  }
}

function roomById(ctx: Ctx, roomId: number) {
  const room = ctx.db.room.id.find(roomId);
  if (!room) throw new SenderError('Room not found');
  return room;
}

// The caller as a crew member in a running round, optionally at a specific station.
function crew(ctx: Ctx, station?: Station) {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Join a room first');
  if (station && player.station !== station) throw new SenderError(`Only ${station} can do that`);
  const room = roomById(ctx, player.roomId);
  if (room.status !== 'running') throw new SenderError('Round is not running');
  const ship = ctx.db.ship.roomId.find(room.id)!;
  return { player, room, ship };
}

function isStation(s: string): s is Station {
  return (STATIONS as readonly string[]).includes(s);
}

// ---------- lifecycle ----------
export const init = spacetimedb.init(ctx => {
  ensureTickTimer(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: true });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: false, holdingJump: false });
});

// ---------- the 10 Hz game loop ----------
export const tick = spacetimedb.reducer({ onSchedule: tickTimer }, { timer: tickTimer.rowType }, ctx => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('tick is internal');
  for (const room of [...ctx.db.room.iter()]) {
    if (room.status === 'running') tickRoom(ctx, room);
  }
});

// ---------- rooms and players ----------
// The client picks the code so it knows it without a return value; we reject duplicates.
export const createRoom = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  code = code.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) throw new SenderError('Room code must be 4 letters');
  if (ctx.db.room.code.find(code)) throw new SenderError('Room code taken');
  const room = ctx.db.room.insert({ id: 0, code, status: 'lobby', difficulty: 'easy', seed: 0, round: 0 });
  ctx.db.ship.insert(freshShip(room.id));
  ensureTickTimer(ctx);
});

export const joinRoom = spacetimedb.reducer(
  { code: t.string(), name: t.string(), isBot: t.bool() },
  (ctx, { code, name, isBot }) => {
    const room = ctx.db.room.code.find(code.trim().toUpperCase());
    if (!room) throw new SenderError('No room with that code');
    name = name.trim().slice(0, 16) || 'Crew';
    const existing = ctx.db.player.identity.find(ctx.sender);
    // Rejoining the same room keeps your station.
    if (existing && existing.roomId === room.id) {
      ctx.db.player.identity.update({ ...existing, name, isBot, online: true });
      return;
    }
    const taken = new Set(
      [...ctx.db.player.roomId.filter(room.id)].filter(p => p.online && p.station !== '').map(p => p.station)
    );
    const station = STATIONS.find(s => !taken.has(s)) ?? '';
    const row = {
      identity: ctx.sender, roomId: room.id, name, station, isBot, online: true,
      fixes: 0, mistakes: 0, holdingJump: false,
    };
    if (existing) ctx.db.player.identity.update(row);
    else ctx.db.player.insert(row);
    logEvent(ctx, room.id, 0, 'system', station, `${name} joined${station ? ` as ${station}` : ''}`);
  }
);

export const leaveRoom = spacetimedb.reducer(ctx => {
  ctx.db.player.identity.delete(ctx.sender);
});

// Take a station if no online player holds it. Pass '' to step off your station.
export const chooseStation = spacetimedb.reducer({ station: t.string() }, (ctx, { station }) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Join a room first');
  if (station !== '' && !isStation(station)) throw new SenderError('Unknown station');
  if (station !== '') {
    for (const other of ctx.db.player.roomId.filter(player.roomId)) {
      if (other.station !== station || other.identity.equals(ctx.sender)) continue;
      if (other.online) throw new SenderError(`${station} is taken`);
      ctx.db.player.identity.update({ ...other, station: '' }); // bump an offline holder
    }
  }
  ctx.db.player.identity.update({ ...player, station });
});

// ---------- admin (corner cut: no auth, anyone with the room id can call these) ----------
export const adminStartRound = spacetimedb.reducer({ roomId: t.u32() }, (ctx, { roomId }) => {
  ensureTickTimer(ctx);
  startRound(ctx, roomById(ctx, roomId));
});

export const adminResetRound = spacetimedb.reducer({ roomId: t.u32() }, (ctx, { roomId }) => {
  resetRound(ctx, roomById(ctx, roomId));
});

export const adminSetDifficulty = spacetimedb.reducer(
  { roomId: t.u32(), difficulty: t.string() },
  (ctx, { roomId, difficulty }) => {
    if (difficulty !== 'easy' && difficulty !== 'hard') throw new SenderError('easy or hard');
    ctx.db.room.id.update({ ...roomById(ctx, roomId), difficulty });
  }
);

// kind: 'asteroid' | 'puzzle' | 'fire' | 'leak' | 'duo'. station is used for 'puzzle'.
export const adminSpawn = spacetimedb.reducer(
  { roomId: t.u32(), kind: t.string(), station: t.string() },
  (ctx, { roomId, kind, station }) => {
    const room = roomById(ctx, roomId);
    if (room.status !== 'running') throw new SenderError('Start the round first');
    const ship = ctx.db.ship.roomId.find(roomId)!;
    if (kind === 'asteroid') spawnAsteroid(ctx, ship);
    else if (kind === 'puzzle') spawnPuzzle(ctx, ship, room, isStation(station) ? station : 'engineering');
    else if (kind === 'fire' || kind === 'leak') spawnRepair(ctx, ship, kind, 'fore');
    else if (kind === 'duo') spawnDuo(ctx, ship);
    else throw new SenderError('Unknown hazard kind');
  }
);

// ---------- helm ----------
export const setLane = spacetimedb.reducer({ lane: t.u8() }, (ctx, { lane }) => {
  const { ship } = crew(ctx, 'helm');
  ctx.db.ship.roomId.update({ ...ship, lane: Math.min(lane, LANES - 1) });
});

export const setThrottle = spacetimedb.reducer({ throttle: t.u8() }, (ctx, { throttle }) => {
  const { ship } = crew(ctx, 'helm');
  ctx.db.ship.roomId.update({ ...ship, throttle: Math.max(1, Math.min(3, throttle)) });
});

// ---------- engineering ----------
export const setPower = spacetimedb.reducer(
  { engines: t.u8(), weapons: t.u8(), shields: t.u8() },
  (ctx, { engines, weapons, shields }) => {
    const { ship } = crew(ctx, 'engineering');
    if (engines + weapons + shields > powerBudget(ship)) throw new SenderError('Not enough reactor power');
    const next = { ...ship, powerEngines: engines, powerWeapons: weapons, powerShields: shields };
    clampShields(next);
    ctx.db.ship.roomId.update(next);
  }
);

export const setOverdrive = spacetimedb.reducer({ on: t.bool() }, (ctx, { on }) => {
  const { ship } = crew(ctx, 'engineering');
  const next = { ...ship, overdrive: on };
  if (!on) {
    // Dropping out of overdrive takes the extra pips away from engines first.
    let over = next.powerEngines + next.powerWeapons + next.powerShields - powerBudget(next);
    for (const key of ['powerEngines', 'powerWeapons', 'powerShields'] as const) {
      const cut = Math.max(0, Math.min(over, next[key]));
      next[key] -= cut;
      over -= cut;
    }
    clampShields(next);
  }
  ctx.db.ship.roomId.update(next);
});

// Patch the hull a little, once per second, only while nothing is burning or leaking.
export const patchHull = spacetimedb.reducer(ctx => {
  const { ship } = crew(ctx, 'engineering');
  const burning = [...ctx.db.hazard.roomId.filter(ship.roomId)].some(h => h.kind === 'fire' || h.kind === 'leak');
  if (burning) throw new SenderError('Deal with fires and leaks first');
  if (ship.tick < ship.patchReadyTick) return;
  ctx.db.ship.roomId.update({ ...ship, hull: Math.min(MAX_HULL, ship.hull + 1), patchReadyTick: ship.tick + 10 });
});

// ---------- shields ----------
export const setShields = spacetimedb.reducer(
  { fore: t.u8(), aft: t.u8(), port: t.u8(), starboard: t.u8() },
  (ctx, { fore, aft, port, starboard }) => {
    const { ship } = crew(ctx, 'shields');
    if ([fore, aft, port, starboard].some(p => p > MAX_SHIELD_PIPS)) throw new SenderError('Max 4 pips per section');
    if (fore + aft + port + starboard > ship.powerShields) throw new SenderError('Not enough shield power');
    ctx.db.ship.roomId.update({ ...ship, shieldFore: fore, shieldAft: aft, shieldPort: port, shieldStarboard: starboard });
  }
);

// ---------- hazards (any station) ----------
export const resolveHazard = spacetimedb.reducer({ hazardId: t.u64(), action: t.string() }, (ctx, { hazardId, action }) => {
  const { player, room, ship } = crew(ctx);
  const h = ctx.db.hazard.id.find(hazardId);
  if (!h || h.roomId !== room.id) throw new SenderError('Hazard already gone');
  if (h.kind !== 'puzzle') throw new SenderError('That hazard is not fixed with an action');
  if (player.station !== h.station) throw new SenderError(`That is a ${h.station} problem`);
  if (!ACTIONS[h.station as Station].includes(action)) throw new SenderError('Unknown action');
  resolvePuzzle(ctx, ship, room, player, h, action);
  ctx.db.ship.roomId.update(ship);
});

// One tap on a fire or one swipe on a leak.
export const workHazard = spacetimedb.reducer({ hazardId: t.u64() }, (ctx, { hazardId }) => {
  const { player, ship } = crew(ctx, 'engineering');
  const h = ctx.db.hazard.id.find(hazardId);
  if (!h || h.roomId !== ship.roomId) return; // already put out
  if (h.kind !== 'fire' && h.kind !== 'leak') throw new SenderError('Not a fire or leak');
  workRepair(ctx, ship, player, h);
  ctx.db.ship.roomId.update(ship);
});

export const holdDuo = spacetimedb.reducer({ hazardId: t.u64(), holding: t.bool() }, (ctx, { hazardId, holding }) => {
  const { player, room } = crew(ctx);
  const h = ctx.db.hazard.id.find(hazardId);
  if (!h || h.roomId !== room.id || h.kind !== 'duo') return;
  if (player.station === h.station) ctx.db.hazard.id.update({ ...h, holdA: holding });
  else if (player.station === h.partnerStation) ctx.db.hazard.id.update({ ...h, holdB: holding });
  else throw new SenderError('Not your hazard');
});

export const holdJump = spacetimedb.reducer({ holding: t.bool() }, (ctx, { holding }) => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) throw new SenderError('Join a room first');
  ctx.db.player.identity.update({ ...player, holdingJump: holding });
});
