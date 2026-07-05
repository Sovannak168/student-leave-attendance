import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import { processStudentLocation } from './geofenceService';
import { query } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

let io: Server;

export async function initSocketServer(httpServer: HttpServer): Promise<Server> {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Optional Redis Adapter Setup for horizontal scaling
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => console.warn('[Socket.IO Redis] Pub Client Error:', err.message));
      subClient.on('error', (err) => console.warn('[Socket.IO Redis] Sub Client Error:', err.message));

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.IO] Redis adapter active.');
    } catch (error: any) {
      console.warn('[Socket.IO] Could not initialize Redis adapter, falling back to default memory adapter. Error:', error.message);
    }
  } else {
    console.log('[Socket.IO] No REDIS_URL provided. Using default in-memory adapter.');
  }

  // Socket.IO Handshake JWT Middleware
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
    const deviceUuid = socket.handshake.auth.deviceUuid || socket.handshake.headers['x-device-uuid'];

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      
      // Verify device binding for Students & Guards
      if (decoded.role === 'STUDENT' || decoded.role === 'GUARD') {
        const userRes = await query('SELECT device_uuid FROM users WHERE id = $1', [decoded.id]);
        if (userRes.rows.length === 0) {
          return next(new Error('User not found'));
        }
        
        const dbDeviceUuid = userRes.rows[0].device_uuid;
        if (dbDeviceUuid && decoded.device_uuid !== dbDeviceUuid) {
          return next(new Error('Device binding violation'));
        }

        // Optional: cross-check with socket connection handshake deviceUuid
        if (deviceUuid && deviceUuid !== decoded.device_uuid) {
          return next(new Error('Device UUID mismatch'));
        }
      }

      socket.data.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication failed: Invalid token'));
    }
  });

  // Client Connection Handler
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as JwtPayload;
    console.log(`[Socket.IO] User connected: ${user.email} (Role: ${user.role}) | Socket ID: ${socket.id}`);

    // Join rooms based on role
    if (user.role === 'ADMIN') {
      socket.join('admins');
      console.log(`[Socket.IO] User ${user.email} joined "admins" room`);
    } else if (user.role === 'GUARD') {
      socket.join('guards');
      console.log(`[Socket.IO] User ${user.email} joined "guards" room`);
    } else if (user.role === 'STUDENT') {
      socket.join(`student:${user.id}`);
      console.log(`[Socket.IO] Student ${user.email} joined private room "student:${user.id}"`);
    }

    // Listen for coordinate updates from students
    socket.on('location_update', async (data: { lat: number; lng: number }) => {
      if (user.role !== 'STUDENT') {
        return socket.emit('error_message', { message: 'Only students can send location updates' });
      }

      const { lat, lng } = data;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return socket.emit('error_message', { message: 'Latitude and Longitude must be numbers' });
      }

      try {
        // Run spatial and status calculations
        const result = await processStudentLocation(user.id, lat, lng);

        const locationDataPayload = {
          studentId: user.id,
          email: user.email,
          name: result.studentName,
          rollNumber: result.rollNumber,
          lat,
          lng,
          isInside: result.isInside,
          status: result.studentStatus,
          timestamp: new Date()
        };

        // Broadcast current location coordinates to all admins
        io.to('admins').emit('student_location', locationDataPayload);

        // If student is flagged OUT_OF_BOUNDS, emit a real-time warning alert
        if (result.studentStatus === 'OUT_OF_BOUNDS') {
          io.to('admins').emit('geofence_alert', {
            ...locationDataPayload,
            alertMessage: `Student ${result.studentName} (${result.rollNumber}) has left the geofenced area without permission!`
          });
          
          // Send back a direct alert event to the student socket to warn them
          socket.emit('student_geofence_warning', {
            message: 'WARNING: You have exited the permitted zone. Return immediately or contact administration.'
          });
        }
      } catch (err) {
        console.error('[Socket location_update handler error]', err);
        socket.emit('error_message', { message: 'Failed to process location update' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] User disconnected: ${user.email} | Socket ID: ${socket.id}`);
    });
  });

  return io;
}


export { io };
