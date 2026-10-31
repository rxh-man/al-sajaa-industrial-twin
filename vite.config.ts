import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { askQwen, MAX_ASK_BODY } from './server/ask';
import { interpretGoal, MAX_GOAL_BODY } from './server/agentGoal';

/** POST /api/ask and /api/agent-goal in dev/preview (server-side keys from .env.local); both answer 503 without a key. */
function askTwin(env: Record<string, string>): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/ask' && req.url !== '/api/agent-goal') return next();
    const goal = req.url === '/api/agent-goal';
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'method' });
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > (goal ? MAX_GOAL_BODY : MAX_ASK_BODY)) req.destroy();
    });
    req.on('end', async () => {
      const { status, body } = goal ? await interpretGoal(env, raw) : await askQwen(env, raw);
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
