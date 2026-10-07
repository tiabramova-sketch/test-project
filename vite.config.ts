/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production builds ship a strict Content-Security-Policy that forbids every
 * network connection (connect-src 'none'), so the built app cannot send data
 * anywhere even by accident. The dev server is left alone because Vite's HMR
 * needs an inline preamble and a websocket.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function offlineCsp(): Plugin {
  return {
    name: 'interview-lab-offline-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineCsp()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
