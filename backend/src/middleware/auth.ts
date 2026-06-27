import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';
import { query } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token is missing' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token is invalid or expired' });
    }

    const payload = decoded as JwtPayload;
    req.user = payload;

    // Check device UUID binding for students and guards
    if (payload.role === 'STUDENT' || payload.role === 'GUARD') {
      try {
        const userRes = await query('SELECT device_uuid FROM users WHERE id = $1', [payload.id]);
        if (userRes.rows.length === 0) {
          return res.status(404).json({ error: 'User no longer exists' });
        }
        
        const dbDeviceUuid = userRes.rows[0].device_uuid;
        
        // If device is already bound, enforce matching
        if (dbDeviceUuid && payload.device_uuid !== dbDeviceUuid) {
          return res.status(403).json({ error: 'Device binding violation. Token registered to another device.' });
        }

        // Validate client x-device-uuid header to verify current device matches token
        const clientDeviceUuid = req.headers['x-device-uuid'];
        if (clientDeviceUuid && clientDeviceUuid !== payload.device_uuid) {
          return res.status(403).json({ error: 'Device UUID header does not match active token.' });
        }
      } catch (dbErr) {
        return res.status(500).json({ error: 'Database verification failed' });
      }
    }

    next();
  });
};

export const requireRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};
