# CrewFun

Four phones, one ship. Real-time co-op spaceship game on SpacetimeDB, with a voice "ship computer" backed by Moss.

## Layout
- `spacetimedb/` — the SpacetimeDB module (TypeScript). All game state and the 10 Hz tick loop.
  - `src/schema.ts` tables · `src/index.ts` reducers · `src/game.ts` game rules
  - `src/shared/` pure code shared with the web client (catalog, manual generator)
- `web/` — Vite + React client. Routes: `#/` home, `#/play/CODE` phone, `#/admin/CODE` captain panel.

## Run it (Phase 1)
```sh
npm run server          # terminal 1: local SpacetimeDB on :3000
npm run publish         # build + publish the module as "crewfun"
npm run generate        # regenerate web/src/module_bindings after module changes
(cd web && npm i) && npm run web   # terminal 2: http://localhost:5173
npm test                # unit tests + typechecks
npm run smoke           # end-to-end check against the running server
```
If a publish fails on a breaking schema change, use `npm run publish:clean` (wipes data).

Phones on the same Wi-Fi: open `http://<laptop-LAN-IP>:5173`. Each browser tab is its own crew member
(identity is kept in sessionStorage), so you can test several stations in several tabs.
