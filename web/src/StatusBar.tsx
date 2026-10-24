// The shared "how is the ship doing" strip at the top of every screen:
// route map to the destination, hull and crew-sync meters, and a light per station.
import { useEffect, useRef, useState } from 'react';
import PixelCanvas from './pixel/PixelCanvas';
import { drawSprite, PAL } from './pixel/sprites';
import { DESTINATION, MAX_HULL, STATIONS, SYNC_MAX, sectorFor, type Station } from './game';
import type { Hazard, Player, Ship } from './module_bindings/types';

const MAP_W = 160;
const MAP_H = 22;
const STARS = Array.from({ length: 24 }, (_, i) => ({ x: (i * 37) % MAP_W, y: (i * 11) % MAP_H, p: i % 3 }));
const LABEL: Record<Station, string> = { helm: 'HELM', weapons: 'WPN', shields: 'SHLD', engineering: 'ENG' };

export function stationAlert(hazards: readonly Hazard[], station: string) {
  return hazards.some(h => h.station === station || h.partnerStation === station);
}

export default function StatusBar({ ship, hazards, players, myStation }: {
  ship: Ship;
  hazards: readonly Hazard[];
  players: readonly Player[];
  myStation?: string;
}) {
  // Flash the hull meter whenever the hull drops.
  const [hit, setHit] = useState(false);
  const lastHull = useRef(ship.hull);
  useEffect(() => {
    if (ship.hull < lastHull.current) {
      setHit(true);
      const t = setTimeout(() => setHit(false), 350);
      lastHull.current = ship.hull;
      return () => clearTimeout(t);
    }
    lastHull.current = ship.hull;
  }, [ship.hull]);

  const progress = ship.progress / DESTINATION;
  const boosting = ship.tick < ship.syncBoostUntil;

  const drawMap = (g: CanvasRenderingContext2D, now: number) => {
    for (const s of STARS) {
      g.fillStyle = (Math.floor(now / 400) + s.p) % 3 === 0 ? PAL['6'] : PAL['5'];
      g.fillRect((s.x - (now / (60 - s.p * 15)) % MAP_W + MAP_W) % MAP_W, s.y, 1, 1);
    }
    const y = 11;
    const x0 = 6;
    const x1 = MAP_W - 16;
    // dotted route, solid where we've been
    for (let x = x0; x <= x1; x += 3) {
      g.fillStyle = x <= x0 + (x1 - x0) * progress ? PAL['c'] : PAL['5'];
      g.fillRect(x, y, 2, 1);
    }
    // sector gates at 30% and 70%
    for (const f of [0.3, 0.7]) {
      g.fillStyle = PAL['d'];
      g.fillRect(Math.round(x0 + (x1 - x0) * f), y - 3, 1, 7);
    }
    drawSprite(g, 'planet', MAP_W - 7, y);
    const bob = Math.round(Math.sin(now / 200));
    const sx = x0 + (x1 - x0) * progress;
    if (boosting) {
      g.fillStyle = Math.floor(now / 80) % 2 ? PAL['a'] : PAL['9'];
      g.fillRect(Math.round(sx) - 6, y + bob, 3, 1);
    }
    // mini ship points right
    g.save();
    g.translate(Math.round(sx), y + bob);
    g.rotate(Math.PI / 2);
    drawSprite(g, 'miniShip', 0, 0);
    g.restore();
  };

  const hullPct = ship.hull / MAX_HULL;
  const hullColor = hullPct > 0.6 ? 'var(--green)' : hullPct > 0.3 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div className="statusbar">
      <div className="statusbar-top">
        <span className="tag">SECTOR {sectorFor(ship.progress)}</span>
        <span className="tag dim">{Math.floor(progress * 100)}% TO DEST</span>
      </div>
      <PixelCanvas width={MAP_W} height={MAP_H} draw={drawMap} className="route-map" />
      <div className="meter-row">
        <span className="meter-label">HULL</span>
        <Segments value={hullPct} count={20} color={hullColor} className={hit ? 'flash' : ''} />
        <span className="meter-num">{ship.hull}</span>
      </div>
      <div className="meter-row">
        <span className="meter-label">SYNC</span>
        <Segments value={boosting ? 1 : ship.sync / SYNC_MAX} count={20} color="var(--cyan)" className={boosting ? 'glow' : ''} />
        <span className={`meter-num ${boosting ? 'blink' : ''}`}>{boosting ? 'MAX' : ship.sync}</span>
      </div>
      <div className="station-lights">
        {STATIONS.map(s => {
          const staffed = players.some(p => p.station === s && p.online);
          const alert = stationAlert(hazards, s);
          const state = !staffed ? 'empty' : alert ? 'alert' : 'ok';
          return (
            <div key={s} className={`light ${state} ${s === myStation ? 'mine' : ''}`}>
              <i />
              {LABEL[s]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Segments({ value, count, color, className }: { value: number; count: number; color: string; className?: string }) {
  const lit = Math.ceil(Math.max(0, Math.min(1, value)) * count);
  return (
    <div className={`segments ${className ?? ''}`}>
      {Array.from({ length: count }, (_, i) => (
        <b key={i} style={{ background: i < lit ? color : undefined }} />
      ))}
    </div>
  );
}
