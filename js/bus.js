// Tiny shared event bus to avoid circular imports between app.js and views.
export const bus = {
  navigate: (_route) => {},
  refresh: () => {},
  applyTheme: () => {},
};
export function setBus(obj) { Object.assign(bus, obj); }
