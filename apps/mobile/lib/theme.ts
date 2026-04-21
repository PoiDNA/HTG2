export const theme = {
  colors: {
    bg: "#0A0A0B",
    surface: "#141416",
    muted: "#2A2A2E",
    text: "#F5F5F5",
    subtle: "#A1A1AA",
    accent: "#D4AF37",
    danger: "#DC2626",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 6,
    md: 12,
    lg: 20,
    full: 9999,
  },
} as const;

export type Theme = typeof theme;
