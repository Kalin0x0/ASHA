import http from 'node:http';
import { createLogger } from '@asha/logger';
import { WebSocketServer } from 'ws';
import { proxyEnv } from './env.js';
import { handleUpgrade } from './proxy.js';
import { SessionStore } from './session-store.js';

const log = createLogger('proxy');

async function main(): Promise<void> {
  log.info({ port: proxyEnv.port }, 'Asha connection-proxy starting');

  const store = new SessionStore();
  await store.connect();

  // HTTP server handles both health checks and WebSocket upgrades.
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      const redisOk = store.isHealthy();
      res.writeHead(redisOk ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: redisOk ? 'ok' : 'degraded', service: 'connection-proxy', redis: redisOk }));
      return;
    }
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: '@asha/connection-proxy', version: '0.1.0' }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    if (!url.startsWith('/session/')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleUpgrade(ws, req, store).catch((e) => {
        log.error({ err: (e as Error).message }, 'WebSocket handler threw');
        ws.close(1011, 'Internal error');
      });
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(proxyEnv.port, resolve));
  log.info({ port: proxyEnv.port }, 'Listening');

  const shutdown = async (): Promise<void> => {
    log.info('Shutting down');
    // Tell every live viewer this is a RESTART (1012), not a crash, so the
    // browser distinguishes it and auto-reconnects once the proxy is back —
    // important for the maintenance "restart terminal server" action.
    for (const client of wss.clients) {
      try {
        client.close(1012, 'Service restarting');
      } catch {
        /* already closing */
      }
    }
    wss.close();
    store.quit();
    httpServer.close();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
