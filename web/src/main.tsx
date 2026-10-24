import { createRoot } from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings';
import App from './App';
import './styles.css';

// Default to the machine serving this page, so phones on the LAN reach the laptop's server.
const HOST = import.meta.env.VITE_SPACETIMEDB_HOST || `ws://${location.hostname}:3000`;
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'crewfun';
// sessionStorage, not localStorage: each tab is its own crew member, so you can
// test several stations from one browser. A reload keeps the same identity.
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(sessionStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect((_conn, _identity, token) => sessionStorage.setItem(TOKEN_KEY, token))
  .onConnectError((_ctx, err) => console.error('SpacetimeDB connection error', err));

createRoot(document.getElementById('root')!).render(
  <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
    <App />
  </SpacetimeDBProvider>
);
