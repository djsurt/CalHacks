// End-to-end smoke test: drives the module through the real client SDK.
import { DbConnection, tables } from '../src/module_bindings';
import { correctAction } from '../../spacetimedb/src/shared/manual';

const code = 'E' + Array.from({ length: 3 }, () => 'ABCDEFGHJK'[Math.floor(Math.random() * 10)]).join('');
const conn: DbConnection = await new Promise((resolve, reject) => {
  DbConnection.builder().withUri('ws://localhost:3000').withDatabaseName('crewfun')
    .onConnect(c => resolve(c)).onConnectError((_c, e) => reject(e)).build();
});
await new Promise<void>(res => conn.subscriptionBuilder().onApplied(() => res()).subscribeToAllTables());
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const check = (ok: boolean, msg: string) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) process.exitCode = 1; };

await conn.reducers.createRoom({ code });
const room = [...conn.db.room.iter()].find(r => r.code === code)!;
check(!!room, `room ${code} created`);
await conn.reducers.joinRoom({ code, name: 'smoke', isBot: true });
const me = () => [...conn.db.player.iter()].find(p => p.identity.isEqual(conn.identity!))!;
check(me().station === 'helm', `assigned station ${me().station}`);
await conn.reducers.adminStartRound({ roomId: room.id });
await wait(500);
const ship = () => conn.db.ship.roomId.find(room.id)!;
check(ship().tick > 0, `ticking: tick=${ship().tick}`);
await conn.reducers.setLane({ lane: 4 });
await wait(150);
check(ship().lane === 4, 'setLane reflected via subscription');

await conn.reducers.adminSpawn({ roomId: room.id, kind: 'puzzle', station: 'helm' });
await wait(150);
const h = [...conn.db.hazard.iter()].find(x => x.roomId === room.id && x.kind === 'puzzle' && x.station === 'helm')!;
check(!!h, `helm puzzle: ${h?.color} ${h?.title} ${h?.alarm}`);
const rule = [...conn.db.manualRule.iter()].find(r => r.roomId === room.id && r.station === 'helm' && r.color === h.color && r.alarm === h.alarm)!;
console.log('  manual:', rule.text);
await conn.reducers.resolveHazard({ hazardId: h.id, action: correctAction(rule as any, h, ship().hull) });
await wait(150);
check(!conn.db.hazard.id.find(h.id), 'correct fix removed hazard');
check(me().fixes === 1 && ship().sync > 0, `fixes=${me().fixes} sync=${ship().sync}`);

try { await conn.reducers.setPower({ engines: 3, weapons: 3, shields: 2 }); check(false, 'non-engineer setPower rejected'); }
catch (e) { check(true, `non-engineer setPower rejected: ${(e as Error).message}`); }

await conn.reducers.adminResetRound({ roomId: room.id });
conn.disconnect();
process.exit();
