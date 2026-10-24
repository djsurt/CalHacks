import { useEffect, useState } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import Home from './Home';
import Play from './Play';
import Admin from './Admin';

// Hash routes: #/  #/play/CODE  #/admin/CODE
function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

export default function App() {
  const { isActive } = useSpacetimeDB();
  const [page, code = ''] = useHashRoute();
  if (!isActive) return <div className="screen center"><p className="blink">CONNECTING…</p></div>;
  if (page === 'play' && code) return <Play code={code.toUpperCase()} />;
  if (page === 'admin' && code) return <Admin code={code.toUpperCase()} />;
  return <Home />;
}
