import { Request } from 'express';

export type UserRole = 'ADMIN' | 'GUARD' | 'STUDENT';

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  device_uuid?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
