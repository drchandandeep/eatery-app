// theme.js
// Central design tokens. Clean white base with a rich purple accent --
// every screen pulls colors from here, so this is the single place to
// re-theme the whole app.

export const colors = {
  bg: '#FFFFFF',
  surface: '#F6F3FA',
  surfaceAlt: '#EDE6F7',
  border: '#DCD2EE',
  text: '#241B33',
  textMuted: '#786E8C',
  accent: '#7A3FE0', // rich purple
  accentSoft: '#B79AF0',
  success: '#3F9142',
  danger: '#D14343',
  white: '#FFFFFF',
};

export const spacing = (n) => n * 4;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const type = {
  display: { fontSize: 28, fontWeight: '800', color: colors.text },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  bodyMuted: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  price: { fontSize: 15, fontWeight: '700', color: colors.accent },
};

export default { colors, spacing, radius, type };
