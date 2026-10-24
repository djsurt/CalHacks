// Hazard cards shared by every station: manual puzzles, fires/leaks, duo holds,
// and "intel" cards when this screen shows another station's hazard specs (hard mode).
import { ACTIONS, prettyAction, type Station } from './game';
import { HAZARD_COLOR } from './pixel/sprites';
import type { DbConnection } from './module_bindings';
import type { Hazard } from './module_bindings/types';

type Call = (fn: (r: DbConnection['reducers']) => Promise<void>) => void;

export default function HazardCards({ hazards, station, tick, call }: {
  hazards: readonly Hazard[];
  station: Station;
  tick: number;
  call: Call;
}) {
  const mine = hazards.filter(h => h.station === station || h.partnerStation === station);
  const intel = hazards.filter(h => h.kind === 'puzzle' && h.shownOn === station && h.station !== station);
  if (mine.length === 0 && intel.length === 0) return null;
  return (
    <div className="hazard-cards">
      {mine.map(h => {
        if (h.kind === 'puzzle') return <PuzzleCard key={String(h.id)} h={h} station={station} tick={tick} call={call} />;
        if (h.kind === 'duo') return <DuoCard key={String(h.id)} h={h} station={station} tick={tick} call={call} />;
        return <RepairCard key={String(h.id)} h={h} call={call} />;
      })}
      {intel.map(h => (
        <div key={String(h.id)} className="card intel">
          <div className="card-title">INTEL FOR {h.station.toUpperCase()}</div>
          <Specs h={h} />
          <div className="hint">Read this out to {h.station}!</div>
        </div>
      ))}
    </div>
  );
}

function Countdown({ h, tick }: { h: Hazard; tick: number }) {
  if (h.deadlineTick === 0) return null;
  const left = Math.max(0, (h.deadlineTick - tick) / (h.deadlineTick - h.spawnTick));
  return (
    <div className="countdown">
      <b style={{ transform: `scaleX(${left})` }} className={left < 0.3 ? 'low' : ''} />
    </div>
  );
}

function Specs({ h }: { h: Hazard }) {
  return (
    <div className="specs">
      <span className="swatch" style={{ background: HAZARD_COLOR[h.color] }} />
      <span className="spec-main">{h.color.toUpperCase()} {h.title.toUpperCase()}</span>
      <span className={`alarm alarm-${h.alarm}`}>ALARM: {h.alarm.toUpperCase()}</span>
      <span>CODE {h.code}</span>
      <span>{h.section.toUpperCase()} SECTION</span>
    </div>
  );
}

function PuzzleCard({ h, station, tick, call }: { h: Hazard; station: Station; tick: number; call: Call }) {
  const visible = h.shownOn === station;
  return (
    <div className="card puzzle">
      <div className="card-title blink-slow">! {station === 'weapons' ? 'ENEMY INBOUND' : 'ANOMALY'} !</div>
      <Countdown h={h} tick={tick} />
      {visible ? (
        <Specs h={h} />
      ) : (
        <div className="specs hidden-specs">
          SPECS ON <b>{h.shownOn.toUpperCase()}</b>'S SCREEN. ASK THEM!
        </div>
      )}
      <div className="hint">Ask the computer what the manual says.</div>
      <div className="action-grid">
        {ACTIONS[station].map(a => (
          <button key={a} className="btn action" onClick={() => call(r => r.resolveHazard({ hazardId: h.id, action: a }))}>
            {prettyAction(a)}
          </button>
        ))}
      </div>
    </div>
  );
}

function RepairCard({ h, call }: { h: Hazard; call: Call }) {
  const isFire = h.kind === 'fire';
  return (
    <div className={`card repair ${h.kind}`}>
      <div className="card-title">{isFire ? 'FIRE' : 'HULL LEAK'} · {h.section.toUpperCase()}</div>
      <button
        className="btn mash"
        onPointerDown={() => call(r => r.workHazard({ hazardId: h.id }))}
      >
        {isFire ? 'TAP TAP TAP!' : 'SEAL IT!'}
        <span className="mash-progress" style={{ width: `${(h.progress / h.required) * 100}%` }} />
      </button>
    </div>
  );
}

function DuoCard({ h, station, tick, call }: { h: Hazard; station: Station; tick: number; call: Call }) {
  const partner = h.station === station ? h.partnerStation : h.station;
  const meHolding = h.station === station ? h.holdA : h.holdB;
  const themHolding = h.station === station ? h.holdB : h.holdA;
  const hold = (holding: boolean) => call(r => r.holdDuo({ hazardId: h.id, holding }));
  return (
    <div className="card duo">
      <div className="card-title blink-slow">{h.title.toUpperCase()}!</div>
      <Countdown h={h} tick={tick} />
      <div className="hint">
        HOLD WITH <b>{partner.toUpperCase()}</b> {themHolding ? '(HOLDING!)' : '(NOT YET)'}
      </div>
      <button
        className={`btn hold ${meHolding ? 'pressed' : ''}`}
        onPointerDown={() => hold(true)}
        onPointerUp={() => hold(false)}
        onPointerLeave={() => meHolding && hold(false)}
        onPointerCancel={() => hold(false)}
      >
        HOLD
        <span className="mash-progress" style={{ width: `${(h.progress / h.required) * 100}%` }} />
      </button>
    </div>
  );
}
