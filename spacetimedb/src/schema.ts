import { schema, table, t, type Infer, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

// One row per game room. Phones join by `code`.
const room = table(
  { name: 'room', public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    code: t.string().unique(),
    status: t.string(), // 'lobby' | 'running' | 'won' | 'lost'
    difficulty: t.string(), // 'easy' | 'hard'
    seed: t.u32(),
    round: t.u32(),
  }
);

// The shared ship, one per room. Updated every tick while a round runs.
const ship = table(
  { name: 'ship', public: true },
  {
    roomId: t.u32().primaryKey(),
    tick: t.u32(),
    hull: t.i32(),
    progress: t.u32(),
    // helm
    lane: t.u8(),
    throttle: t.u8(), // 1..3
    // engineering: reactor power split
    powerEngines: t.u8(),
    powerWeapons: t.u8(),
    powerShields: t.u8(),
    overdrive: t.bool(),
    heat: t.u8(),
    patchReadyTick: t.u32(),
    // shields: pips per section, sum <= powerShields
    shieldFore: t.u8(),
    shieldAft: t.u8(),
    shieldPort: t.u8(),
    shieldStarboard: t.u8(),
    shieldFreq: t.u8(),
    // weapons
    weaponReadyTick: t.u32(),
    // crew sync meter: fills on correct fixes, triggers a speed boost
    sync: t.u8(),
    syncBoostUntil: t.u32(),
    jumpUsed: t.bool(),
  }
);

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    roomId: t.u32().index('btree'),
    name: t.string(),
    station: t.string(), // a Station, or '' when every station is taken
    isBot: t.bool(),
    online: t.bool(),
    fixes: t.u32(),
    mistakes: t.u32(),
    holdingJump: t.bool(),
  }
);

// Active hazards only; resolved hazards are deleted and recorded in `event`.
const hazard = table(
  { name: 'hazard', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u32().index('btree'),
    kind: t.string(), // HazardKind
    station: t.string(),
    partnerStation: t.string(), // duo hazards only
    shownOn: t.string(), // station whose screen shows the attributes (differs on hard)
    title: t.string(),
    color: t.string(),
    alarm: t.string(),
    section: t.string(),
    code: t.string(),
    spawnTick: t.u32(),
    deadlineTick: t.u32(), // 0 = no deadline
    progress: t.u8(),
    required: t.u8(),
    holdA: t.bool(),
    holdB: t.bool(),
  }
);

// Asteroids fly down Helm's lanes. Clients interpolate position from spawnTick/arriveTick.
const asteroid = table(
  { name: 'asteroid', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u32().index('btree'),
    lane: t.u8(),
    section: t.string(),
    big: t.bool(),
    spawnTick: t.u32(),
    arriveTick: t.u32(),
  }
);

// This round's ship manual. Public so the computer server can index it;
// phone clients simply don't subscribe (corner cut: not hidden from cheaters).
const manualRule = table(
  {
    name: 'manual_rule',
    public: true,
    indexes: [
      { accessor: 'by_room_combo', algorithm: 'btree', columns: ['roomId', 'station', 'color', 'alarm'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u32(),
    round: t.u32(),
    ruleNo: t.u32(),
    station: t.string(),
    color: t.string(),
    alarm: t.string(),
    title: t.string(),
    condKind: t.string(),
    condArg: t.string(),
    actionIf: t.string(),
    actionElse: t.string(),
    text: t.string(),
  }
);

const event = table(
  { name: 'event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u32().index('btree'),
    tick: t.u32(),
    kind: t.string(), // 'round' | 'spawn' | 'fixed' | 'failed' | 'hit' | 'mistake' | 'sync' | 'jump' | 'system'
    station: t.string(),
    text: t.string(),
  }
);

const tickTimer = table(
  { name: 'tick_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const spacetimedb = schema({ room, ship, player, hazard, asteroid, manualRule, event, tickTimer });
export default spacetimedb;
export { tickTimer };

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
export type Room = Infer<typeof room.rowType>;
export type Ship = Infer<typeof ship.rowType>;
export type Player = Infer<typeof player.rowType>;
export type Hazard = Infer<typeof hazard.rowType>;
