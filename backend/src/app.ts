import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import geofenceRoutes from './routes/geofence';
import permissionRoutes from './routes/permission';
import exitLogRoutes from './routes/exitLog';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/exit-logs', exitLogRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
