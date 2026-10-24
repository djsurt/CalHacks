// Client-side data hooks and helpers shared by every screen.
import { useEffect, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from './module_bindings';
import type { Ship } from './module_bindings/types';

export * from '../../spacetimedb/src/shared/catalog';

export function useRoom(code: string) {
  const [rooms, ready] = useTable(tables.room.where(r => r.code.eq(code)));
  return { room: rooms[0], ready };
}

// Everything a station screen needs for one room. roomId 0 never exists,
// so passing it before the room loads just subscribes to nothing.
export function useRoomData(roomId: number | undefined) {
  const id = roomId ?? 0;
  const [ships] = useTable(tables.ship.where(r => r.roomId.eq(id)));
  const [players] = useTable(tables.player.where(r => r.roomId.eq(id)));
  const [hazards] = useTable(tables.hazard.where(r => r.roomId.eq(id)));
  const [asteroids] = useTable(tables.asteroid.where(r => r.roomId.eq(id)));
  const [events] = useTable(tables.event.where(r => r.roomId.eq(id)));
  const { identity } = useSpacetimeDB();
  const me = players.find(p => identity && p.identity.isEqual(identity));
  return { ship: ships[0] as Ship | undefined, players, hazards, asteroids, events, me };
}

// Reducer calls with errors surfaced as a short toast message.
export function useCall() {
  const { getConnection } = useSpacetimeDB();
  const [error, setError] = useState('');
  const timer = useRef<number>(0);
  function call(fn: (r: DbConnection['reducers']) => Promise<void>) {
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    fn(conn.reducers).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setError(''), 2500);
    });
  }
  return { call, error };
}

// The server ticks at 10 Hz; this estimates a fractional tick between updates
// so animations stay smooth. Read it inside requestAnimationFrame loops.
export function useTickClock(tick: number | undefined) {
  const ref = useRef({ tick: 0, at: 0 });
  useEffect(() => {
    if (tick !== undefined) ref.current = { tick, at: performance.now() };
  }, [tick]);
  return () => {
    const { tick: t, at } = ref.current;
    return t + Math.min(1.5, (performance.now() - at) / 100);
  };
}

export function prettyAction(action: string) {
  return action.replace(/_/g, ' ').toUpperCase();
}
