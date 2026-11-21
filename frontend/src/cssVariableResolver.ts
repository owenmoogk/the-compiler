import type { CSSVariablesResolver } from '@mantine/core';

export const mantineCssVariableResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--primaryColor': '#0077e0',
    '--grey': 'rgb(72, 72, 72)',
    '--mantine-color-text': 'rgb(17,17,17)',
    // theme.ts gives Paper (and Modal, which is built on it) this background
    '--mantine-color-card': 'var(--mantine-color-white)',
  },
  dark: {
    '--primaryColor': '#9ad7ff',
    '--grey': 'lightgrey',
    '--mantine-color-card': 'var(--mantine-color-dark-6)',
  },
});
