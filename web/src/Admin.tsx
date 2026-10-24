// Captain / demo-control panel: start and reset rounds, difficulty, spawn hazards on demand.
import { DESTINATION, STATIONS, useCall, useRoom, useRoomData } from './game';
import StatusBar from './StatusBar';

export default function Admin({ code }: { code: string }) {
  const { room, ready } = useRoom(code);
  const { ship, players, hazards, events } = useRoomData(room?.id);
  const { call, error } = useCall();
  if (!room) return <div className="screen center"><p>{ready ? `NO ROOM "${code}"` : 'LOADING…'}</p></div>;

  const roomId = room.id;
  const joinUrl = `${location.origin}${location.pathname}#/play/${room.code}`;
  const spawn = (kind: string, station = '') => call(r => r.adminSpawn({ roomId, kind, station }));
  const recent = [...events].sort((a, b) => Number(b.id - a.id)).slice(0, 14);

  return (
    <div className="screen admin">
      <h2 className="title">CAPTAIN · ROOM <span className="code">{room.code}</span></h2>
      <p className="dim small">JOIN: {joinUrl}</p>
      <div className="row">
        <span className="tag">STATUS: {room.status.toUpperCase()}</span>
        <span className="tag">ROUND {room.round}</span>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => call(r => r.adminStartRound({ roomId }))}>
          {room.status === 'lobby' ? 'LAUNCH' : 'RESTART'}
        </button>
        <button className="btn" onClick={() => call(r => r.adminResetRound({ roomId }))}>BACK TO LOBBY</button>
        {(['easy', 'hard'] as const).map(d => (
          <button key={d} className={`btn ${room.difficulty === d ? 'on' : ''}`} onClick={() => call(r => r.adminSetDifficulty({ roomId, difficulty: d }))}>
            {d.toUpperCase()}
          </button>
        ))}
      </div>

      {ship && <StatusBar ship={ship} hazards={hazards} players={players} />}

      <h3 className="subtitle">SPAWN</h3>
      <div className="row wrap">
        <button className="btn" onClick={() => spawn('asteroid')}>ASTEROID</button>
        {STATIONS.map(s => <button key={s} className="btn" onClick={() => spawn('puzzle', s)}>{s.toUpperCase()} PUZZLE</button>)}
        <button className="btn" onClick={() => spawn('fire')}>FIRE</button>
        <button className="btn" onClick={() => spawn('leak')}>LEAK</button>
        <button className="btn" onClick={() => spawn('duo')}>DUO</button>
      </div>

      <h3 className="subtitle">CREW</h3>
      {players.length === 0 && <p className="dim">NOBODY YET</p>}
      {players.map(p => (
        <div key={p.identity.toHexString()} className="end-row">
          <span>{p.station.toUpperCase() || 'RESERVE'}</span>
          <span>{p.name}{p.isBot ? ' (BOT)' : ''}</span>
          <span className={p.online ? '' : 'dim'}>{p.online ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      ))}

      {ship && (
        <p className="dim small">
          TICK {ship.tick} · PROGRESS {ship.progress}/{DESTINATION} · LANE {ship.lane} · THROTTLE {ship.throttle} ·
          POWER E{ship.powerEngines}/W{ship.powerWeapons}/S{ship.powerShields} · HEAT {ship.heat}
        </p>
      )}

      <h3 className="subtitle">EVENT LOG</h3>
      <div className="log">
        {recent.map(e => <div key={String(e.id)} className={`log-${e.kind}`}>[{(e.tick / 10).toFixed(1)}s] {e.text}</div>)}
      </div>
      {error && <div className="toast">{error.toUpperCase()}</div>}
    </div>
  );
}
