/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/modal/**/*.{js,ts,tsx,html}',
    './src/popup.html',
    './src/popup.js',
    './src/popup.ts',
  ],
  // pr+ still uses a large prp-* design system; disable preflight conflicts
  // only for the modal host when needed — keep base for new utility styling.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        prp: {
          bg: 'var(--prp-bg)',
          fg: 'var(--prp-fg)',
          muted: 'var(--prp-fg-muted)',
          border: 'var(--prp-border)',
          accent: 'var(--prp-accent)',
          add: 'var(--prp-add, #1a7f37)',
          del: 'var(--prp-del, #cf222e)',
        },
      },
      fontFamily: {
        mono: 'var(--prp-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
        sans: 'var(--prp-font, system-ui, -apple-system, sans-serif)',
      },
    },
  },
  plugins: [],
};
