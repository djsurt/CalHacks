// HELM: dodge asteroids across 5 lanes and set the throttle.
import { useEffect, useRef, useState } from 'react';
import PixelCanvas from '../pixel/PixelCanvas';
import { drawSprite, PAL } from '../pixel/sprites';
import { LANES, useTickClock } from '../game';
import type { StationProps } from '../Play';

const W = 120;
const H = 170;
const LANE_W = W / LANES;
const SHIP_Y = 150;
const SPAWN_Y = -8;
const laneX = (lane: number) => LANE_W / 2 + lane * LANE_W;
const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (i * 53) % W, y: (i * 97) % H, z: 1 + (i % 3) }));

export default function Helm({ ship, asteroids, call }: StationProps) {
  const clock = useTickClock(ship.tick);
  // Move the ship locally right away; the server row catches up a moment later.
  const [lane, setLaneLocal] = useState(ship.lane);
  useEffect(() => setLaneLocal(ship.lane), [ship.lane]);
  const shipX = useRef(laneX(ship.lane));
  const shakeUntil = useRef(0);
  const lastHull = useRef(ship.hull);
  useEffect(() => {
    if (ship.hull < lastHull.current) shakeUntil.current = performance.now() + 300;
    lastHull.current = ship.hull;
  }, [ship.hull]);

  const move = (delta: number) => {
    const next = Math.max(0, Math.min(LANES - 1, lane + delta));
    if (next === lane) return;
    setLaneLocal(next);
    call(r => r.setLane({ lane: next }));
  };

  // Swipe or tap left/right of the ship.
  const downX = useRef(0);
  const onDown = (_e: unknown, x: number) => { downX.current = x; };
  const onUp = (_e: unknown, x: number) => {
    const dx = x - downX.current;
    if (Math.abs(dx) > 8) move(dx > 0 ? 1 : -1);
    else move(x > shipX.current ? 1 : -1);
  };

  const draw = (g: CanvasRenderingContext2D, now: number) => {
    const tickNow = clock();
    const shaking = now < shakeUntil.current;
    g.save();
    if (shaking) g.translate(Math.round(Math.random() * 4 - 2), Math.round(Math.random() * 4 - 2));

    g.fillStyle = PAL['0'];
    g.fillRect(-4, -4, W + 8, H + 8);
    // scrolling stars, faster with throttle
    for (const s of STARS) {
      const y = (s.y + (now / 1000) * 20 * s.z * ship.throttle) % H;
      g.fillStyle = s.z === 3 ? PAL['7'] : s.z === 2 ? PAL['6'] : PAL['5'];
      g.fillRect(s.x, Math.floor(y), 1, s.z === 3 ? 2 : 1);
    }
    // lane dividers
    g.fillStyle = PAL['1'];
    for (let i = 1; i < LANES; i++) {
      for (let y = Math.floor((now / 30) % 8); y < H; y += 8) g.fillRect(Math.round(i * LANE_W), y, 1, 4);
    }

    // asteroids, interpolated between server ticks
    let danger = false;
    for (const a of asteroids) {
      const t = (tickNow - a.spawnTick) / (a.arriveTick - a.spawnTick);
      if (t > 1.1) continue;
      const y = SPAWN_Y + (SHIP_Y - SPAWN_Y) * t;
      if (a.lane === lane && t > 0.55) danger = true;
      drawSprite(g, a.big ? 'rockBig' : 'rockSmall', laneX(a.lane), y);
    }
    // red warning strip under our lane when something is about to hit
    if (danger && Math.floor(now / 120) % 2 === 0) {
      g.fillStyle = PAL['8'];
      g.fillRect(lane * LANE_W + 2, H - 4, LANE_W - 4, 2);
    }

    // ship eases toward its lane
    shipX.current += (laneX(lane) - shipX.current) * 0.35;
    drawSprite(g, 'ship', shipX.current, SHIP_Y);
    drawSprite(g, Math.floor(now / 90) % 2 ? 'flame1' : 'flame2', shipX.current, SHIP_Y + 6 + ship.throttle);
    g.restore();
  };

  // Callout for the next rock in our lane, so Helm can warn Shields.
  const tickNow = ship.tick;
  const next = asteroids
    .filter(a => a.lane === lane && a.arriveTick > tickNow)
    .sort((a, b) => a.arriveTick - b.arriveTick)[0];

  return (
    <div className="helm">
      <PixelCanvas width={W} height={H} draw={draw} className="helm-field" onPointerDown={onDown} onPointerUp={onUp} />
      <div className={`callout ${next ? 'warn' : ''}`}>
        {next
          ? `INCOMING ${next.big ? 'BIG ROCK' : 'ROCK'} → ${next.section.toUpperCase()} IN ${((next.arriveTick - tickNow) / 10).toFixed(1)}s`
          : 'LANE CLEAR'}
      </div>
      <div className="helm-controls">
        <button className="btn big" onPointerDown={() => move(-1)}>◀</button>
        <div className="throttle">
          <span className="meter-label">THROTTLE</span>
          {[3, 2, 1].map(t => (
            <button
              key={t}
              className={`btn throttle-step ${ship.throttle === t ? 'on' : ''}`}
              onClick={() => call(r => r.setThrottle({ throttle: t }))}
            >
              {'▮'.repeat(t)}
            </button>
          ))}
        </div>
        <button className="btn big" onPointerDown={() => move(1)}>▶</button>
      </div>
    </div>
  );
}
