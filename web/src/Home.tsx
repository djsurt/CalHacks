import { useState } from 'react';
import { useCall } from './game';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export default function Home() {
  const [code, setCode] = useState('');
  const { call, error } = useCall();

  const createRoom = () => {
    const newCode = randomCode();
    call(r => r.createRoom({ code: newCode }).then(() => { location.hash = `#/admin/${newCode}`; }));
  };

  return (
    <div className="screen center stack">
      <h1 className="logo">CREWFUN</h1>
      <p className="dim">FOUR PHONES. ONE SHIP. DON'T PANIC.</p>
      <form
        className="stack"
        onSubmit={e => {
          e.preventDefault();
          if (code.length === 4) location.hash = `#/play/${code.toUpperCase()}`;
        }}
      >
        <input
          className="input code-input"
          placeholder="ROOM CODE"
          value={code}
          maxLength={4}
          onChange={e => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
        />
        <button className="btn big primary" type="submit" disabled={code.length !== 4}>JOIN</button>
      </form>
      <button className="btn" onClick={createRoom}>NEW ROOM (CAPTAIN)</button>
      {error && <div className="toast">{error.toUpperCase()}</div>}
    </div>
  );
}
