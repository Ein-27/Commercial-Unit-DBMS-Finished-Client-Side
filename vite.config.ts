import { defineConfig } from 'vite'
import path from 'path'
import os from 'os'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

function getPreferredDisplayHost() {
  const explicitHost = process.env.VITE_API_HOST || process.env.PUBLIC_HOST || process.env.HOST;
  if (explicitHost && explicitHost !== '0.0.0.0' && explicitHost !== '::') {
    return explicitHost;
  }

  return Object.values(os.networkInterfaces())
    .flatMap(entries => entries ?? [])
    .find(entry => entry.family === 'IPv4' && !entry.internal)?.address || '127.0.0.1';
}

function serverInfoMiddleware() {
  return {
    name: 'server-info-middleware',
    configureServer(server) {
      server.middlewares.use('/api/server-info', (_req, res) => {
        const backendHost = process.env.VITE_API_HOST || process.env.PUBLIC_HOST || process.env.HOST || '127.0.0.1';
        const backendPort = process.env.PORT || process.env.VITE_API_PORT || '3001';
        const displayHost = getPreferredDisplayHost();
        const payload = {
          host: displayHost,
          port: Number(backendPort),
          bindHost: backendHost,
          url: `http://${displayHost}:${backendPort}`,
        };

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      });
    },
  };
}

const backendHost = process.env.VITE_API_HOST || '127.0.0.1';
const backendPort = process.env.PORT || '3001';

export default defineConfig({
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  plugins: [
    figmaAssetResolver(),
    serverInfoMiddleware(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: `http://${backendHost}:${backendPort}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://${backendHost}:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
