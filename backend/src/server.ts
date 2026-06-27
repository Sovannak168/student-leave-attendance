import { createServer } from 'http';
import app from './app';
import { initSocketServer } from './services/socket';
import { testConnection } from './db';
import { runGeofenceAudit } from './services/geofenceService';

const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

async function startServer() {
  try {
    // 1. Test database connection & PostGIS installation
    await testConnection();

    // 2. Initialize Socket.IO server with the HTTP server
    await initSocketServer(httpServer);

    // 3. Start geofence audit cron logic (checks every 5 minutes)
    // Run initial execution, then setup interval
    await runGeofenceAudit();
    setInterval(async () => {
      console.log('[Cron] Running geofence permission audit...');
      await runGeofenceAudit();
    }, 5 * 60 * 1000);

    // 4. Start listening
    httpServer.listen(PORT, () => {
      console.log(`[Server] Core API and WebSockets running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Bootstrapping failed:', error);
    process.exit(1);
  }
}

startServer();
