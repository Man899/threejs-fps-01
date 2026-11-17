// The look plan, in one place. Six values carry the whole game: a dusk foundry yard —
// cold steel blue-greys, warm ember orange as the single accent, bone-white ink. The
// same six names are the CSS custom properties in index.html, and every material and
// every canvas texture in the game is mixed from these.
export const PALETTE = {
  canvas: '#10141a',
  surface: '#1c222b',
  hairline: '#333d49',
  ink: '#e9e6df',
  muted: '#8b98a5',
  accent: '#ff7a1a',
};

export const TEAM = {
  cobalt: '#3fa7ff',
  rust: '#ff5a3c',
};

export function shade(name) {
  return PALETTE[name];
}
