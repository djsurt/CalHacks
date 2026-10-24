// Pixel art defined as text grids. Each character is a palette key; '.' is transparent.
// Base palette is PICO-8, plus a few brighter hazard colors.

export const PAL: Record<string, string> = {
  '0': '#000000', '1': '#1D2B53', '2': '#7E2553', '3': '#008751',
  '4': '#AB5236', '5': '#5F574F', '6': '#C2C3C7', '7': '#FFF1E8',
  '8': '#FF004D', '9': '#FFA300', 'a': '#FFEC27', 'b': '#00E436',
  'c': '#29ADFF', 'd': '#83769C', 'e': '#FF77A8', 'f': '#FFCCAA',
};

// Hazard attribute colors as they appear on screen.
export const HAZARD_COLOR: Record<string, string> = {
  red: '#FF004D', orange: '#FFA300', yellow: '#FFEC27', green: '#00E436',
  cyan: '#29ADFF', blue: '#3A5BFF', purple: '#B455FF', white: '#FFF1E8',
};

export const SPRITES = {
  ship: [
    '.....7.....',
    '....767....',
    '....6c6....',
    '...66c66...',
    '...66666...',
    '..6666666..',
    '.866656668.',
    '88666566688',
    '8.66.5.66.8',
    '..5.....5..',
  ],
  flame1: ['..9.....9..', '..a.....a..'],
  flame2: ['..a.....a..', '..9.....9..', '..8.....8..'],
  rockSmall: [
    '..444..',
    '.45544.',
    '4455544',
    '4544454',
    '4455444',
    '.44454.',
    '..444..',
  ],
  rockBig: [
    '...4444....',
    '..445544...',
    '.44555444..',
    '4455544544.',
    '45554445544',
    '44544444554',
    '44455444444',
    '.4445544454',
    '..44444554.',
    '...444444..',
    '.....44....',
  ],
  planet: [
    '...cccc...',
    '..cc33cc..',
    '.cc3333cc.',
    'cc3bb33ccc',
    'c33bbb33cc',
    'cc33b333cc',
    'ccc33333cc',
    '.cccc33cc.',
    '..cccccc..',
    '...cccc...',
  ],
  miniShip: ['..7..', '.676.', '66c66', '8.6.8'],
};

export type SpriteName = keyof typeof SPRITES;

// Render each sprite once to an offscreen canvas, then blit it.
const cache = new Map<string, HTMLCanvasElement>();
function bake(name: SpriteName, tint?: string): HTMLCanvasElement {
  const key = tint ? `${name}:${tint}` : name;
  let c = cache.get(key);
  if (c) return c;
  const rows = SPRITES[name];
  c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = tint ?? PAL[ch];
      g.fillRect(x, y, 1, 1);
    })
  );
  cache.set(key, c);
  return c;
}

export function drawSprite(g: CanvasRenderingContext2D, name: SpriteName, x: number, y: number, tint?: string) {
  const c = bake(name, tint);
  g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
}

export function spriteSize(name: SpriteName) {
  return { w: SPRITES[name][0].length, h: SPRITES[name].length };
}
