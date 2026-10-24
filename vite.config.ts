import { defineConfig } from 'vite';
import { READER_SCRIPT_HASH } from './shared/reader-runtime.mjs';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react(), { name: 'novel-reader-csp', transformIndexHtml: html => html.replace('__NOVEL_READER_HASH__', READER_SCRIPT_HASH) }], base: './', server: { port: 5175, strictPort: true } });
