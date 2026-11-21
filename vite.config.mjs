import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'www',
    emptyOutDir: true,
  },
  plugins: [{
    name: 'copy-local-map-data',
    closeBundle() {
      fs.copyFileSync(path.resolve('app.js'), path.resolve('www/app.js'));
      fs.copyFileSync(path.resolve('style.css'), path.resolve('www/style.css'));
      fs.cpSync(path.resolve('data'), path.resolve('www/data'), { recursive: true });
      fs.cpSync(path.resolve('icons'), path.resolve('www/icons'), { recursive: true });
    },
  }],
});
