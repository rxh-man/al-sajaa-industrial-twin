import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { askQwen, MAX_ASK_BODY } from './server/ask';

/** POST /api/ask in dev/preview; production runs the same handler in worker/index.ts. */
function askTwin(env: Record<string, string>): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/ask') return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'method' });
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_ASK_BODY) req.destroy();
    });
    req.on('end', async () => {
      const { status, body } = await askQwen(env, raw);
      send(status, body);
    });
  };

  return {
    name: 'al-sajaa-twin-ask',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), askTwin(loadEnv(mode, process.cwd(), ''))],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing') || id.includes('camera-controls')) return 'r3f';
          return undefined;
        },
      },
    },
  },
}));
