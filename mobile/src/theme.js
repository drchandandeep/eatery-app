// theme.js
// Central design tokens. Warm, appetite-driven palette instead of the
// generic red/white pizza-chain look -- charcoal base, a spiced-paprika
// accent, and a fresh basil green for "go/success" states.

export const colors = {
  bg: '#171512',
  surface: '#211E1A',
  surfaceAlt: '#2B2721',
  border: '#3A352C',
  text: '#F5F0E6',
  textMuted: '#B8AF9E',
  accent: '#E0652F', // paprika
  accentSoft: '#F4A56A',
  success: '#7FA650', // basil
  danger: '#D95555',
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
  price: { fontSize: 15, fontWeight: '700', color: colors.accentSoft },
};

export default { colors, spacing, radius, type };
