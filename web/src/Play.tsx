// The phone screen: join -> lobby (pick a station) -> your station -> win/lose.
import { useState } from 'react';
import { STATIONS, useCall, useRoom, useRoomData, type Station } from './game';
import StatusBar from './StatusBar';
import HazardCards from './HazardCards';
import Helm from './stations/Helm';
import type { DbConnection } from './module_bindings';
import type { Asteroid, Hazard, Player, Room, Ship } from './module_bindings/types';

export interface StationProps {
  room: Room;
  ship: Ship;
  hazards: readonly Hazard[];
  asteroids: readonly Asteroid[];
  players: readonly Player[];
  me: Player;
  call: (fn: (r: DbConnection['reducers']) => Promise<void>) => void;
}

const NAME_KEY = 'crewfun:name';

export default function Play({ code }: { code: string }) {
  const { room, ready } = useRoom(code);
  const data = useRoomData(room?.id);
  const { call, error } = useCall();
  const { ship, me } = data;

  let body;
  if (!room) body = <div className="center"><p>{ready ? `NO ROOM "${code}"` : 'LOOKING FOR ROOM…'}</p><a className="btn" href="#/">BACK</a></div>;
  else if (!me) body = <JoinForm code={code} call={call} />;
  else if (!ship) body = <p className="center">…</p>;
  else if (room.status === 'lobby') body = <Lobby players={data.players} me={me} call={call} />;
  else {
    const props: StationProps = { room, ship, hazards: data.hazards, asteroids: data.asteroids, players: data.players, me, call };
    body = (
      <>
        <StatusBar ship={ship} hazards={data.hazards} players={data.players} myStation={me.station} />
        {room.status !== 'running' && <EndScreen room={room} players={data.players} />}
        <div className="station-head">
          <span className="station-name">{me.station ? me.station.toUpperCase() : 'RESERVE CREW'}</span>
          <span className="dim">{me.name} · ROOM {room.code}</span>
        </div>
        {me.station && <HazardCards hazards={data.hazards} station={me.station as Station} tick={ship.tick} call={call} />}
        <StationView {...props} />
        <JumpButton ship={ship} me={me} call={call} />
      </>
    );
  }
  return (
    <div className="screen play">
      {body}
      {error && <div className="toast">{error.toUpperCase()}</div>}
    </div>
  );
}

function StationView(props: StationProps) {
  switch (props.me.station) {
    case 'helm':
      return <Helm {...props} />;
    case '':
      return <p className="center dim">ALL STATIONS ARE CREWED. STAND BY.</p>;
    default:
      // Phase 2 replaces this with the real Weapons / Shields / Engineering screens.
      return <p className="center dim">STATION CONTROLS COMING IN PHASE 2. HAZARD CARDS ABOVE STILL WORK.</p>;
  }
}

function JoinForm({ code, call }: { code: string; call: StationProps['call'] }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  return (
    <form
      className="center stack"
      onSubmit={e => {
        e.preventDefault();
        localStorage.setItem(NAME_KEY, name);
        call(r => r.joinRoom({ code, name, isBot: false }));
      }}
    >
      <h1 className="logo">CREWFUN</h1>
      <p>ROOM {code}</p>
      <input className="input" placeholder="YOUR NAME" value={name} maxLength={16} onChange={e => setName(e.target.value)} autoFocus />
      <button className="btn big primary" type="submit">JOIN CREW</button>
    </form>
  );
}

function Lobby({ players, me, call }: { players: readonly Player[]; me: Player; call: StationProps['call'] }) {
  return (
    <div className="stack">
      <h2 className="title">CHOOSE YOUR STATION</h2>
      <div className="station-grid">
        {STATIONS.map(s => {
          const holder = players.find(p => p.station === s && p.online);
          const mine = me.station === s;
          return (
            <button
              key={s}
              className={`btn station-pick ${mine ? 'on' : ''}`}
              disabled={!!holder && !mine}
              onClick={() => call(r => r.chooseStation({ station: s }))}
            >
              <span>{s.toUpperCase()}</span>
              <small>{holder ? holder.name : 'OPEN'}</small>
            </button>
          );
        })}
      </div>
      <p className="center blink-slow">WAITING FOR THE CAPTAIN TO LAUNCH…</p>
    </div>
  );
}

function JumpButton({ ship, me, call }: { ship: Ship; me: Player; call: StationProps['call'] }) {
  if (ship.jumpUsed || !me.station) return null;
  const hold = (holding: boolean) => call(r => r.holdJump({ holding }));
  return (
    <button
      className={`btn jump ${me.holdingJump ? 'pressed' : ''}`}
      onPointerDown={() => hold(true)}
      onPointerUp={() => hold(false)}
      onPointerLeave={() => me.holdingJump && hold(false)}
      onPointerCancel={() => hold(false)}
    >
      EMERGENCY JUMP · ALL 4 HOLD
    </button>
  );
}

function EndScreen({ room, players }: { room: Room; players: readonly Player[] }) {
  const won = room.status === 'won';
  const mvp = [...players].sort((a, b) => b.fixes - a.fixes)[0];
  return (
    <div className={`end-screen ${won ? 'won' : 'lost'}`}>
      <h1>{won ? 'MISSION COMPLETE' : 'SHIP LOST'}</h1>
      {players.map(p => (
        <div key={p.identity.toHexString()} className="end-row">
          <span>{p.station.toUpperCase() || 'RESERVE'}</span>
          <span>{p.name}</span>
          <span>{p.fixes} FIX / {p.mistakes} OOPS</span>
        </div>
      ))}
      {mvp && mvp.fixes > 0 && <p className="blink-slow">MVP: {mvp.name}</p>}
    </div>
  );
}
