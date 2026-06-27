import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, pool } from '../db';
import { UserRole } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

// REGISTER
export const register = async (req: Request, res: Response) => {
  const { email, password, phone, role, rollNumber, className, parentPhone, deviceUuid } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Email, password, and role are required' });
  }

  const allowedRoles: UserRole[] = ['ADMIN', 'GUARD', 'STUDENT'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid user role' });
  }

  if (role === 'STUDENT' && (!rollNumber || !className)) {
    return res.status(400).json({ error: 'Students must provide rollNumber and className' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user already exists
    const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const userInsertRes = await client.query(
      `INSERT INTO users (email, password_hash, phone, role, device_uuid) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, phone, role, device_uuid`,
      [email, passwordHash, phone, role, deviceUuid || null]
    );
    const newUser = userInsertRes.rows[0];

    // If student, insert into students table
    if (role === 'STUDENT') {
      // Check if roll number already exists
      const checkRoll = await client.query('SELECT user_id FROM students WHERE roll_number = $1', [rollNumber]);
      if (checkRoll.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Roll number already in use' });
      }

      await client.query(
        `INSERT INTO students (user_id, roll_number, class_name, parent_phone, status) 
         VALUES ($1, $2, $3, $4, 'ACTIVE')`,
        [newUser.id, rollNumber, className, parentPhone || null]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        deviceUuid: newUser.device_uuid
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Register Error]', error);
    return res.status(500).json({ error: 'Internal Server Error during registration' });
  } finally {
    client.release();
  }
};

// LOGIN
export const login = async (req: Request, res: Response) => {
  const { email, password, deviceUuid } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Fetch user details, join student details if STUDENT
    const userRes = await query(
      `SELECT u.*, s.roll_number, s.class_name, s.parent_phone, s.status 
       FROM users u 
       LEFT JOIN students s ON u.id = s.user_id 
       WHERE u.email = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    let activeDeviceUuid = user.device_uuid;

    // Handle device UUID binding for students and guards
    if (user.role === 'STUDENT' || user.role === 'GUARD') {
      if (!deviceUuid) {
        return res.status(400).json({ error: 'Device UUID required for Student/Guard login' });
      }

      if (!activeDeviceUuid) {
        // First login, bind device UUID
        await query('UPDATE users SET device_uuid = $1, updated_at = NOW() WHERE id = $2', [deviceUuid, user.id]);
        activeDeviceUuid = deviceUuid;
        console.log(`[Auth] Bound device UUID ${deviceUuid} to user ${user.email}`);
      } else if (activeDeviceUuid !== deviceUuid) {
        return res.status(403).json({ 
          error: 'This account is locked to another mobile device. Please contact administration to reset binding.' 
        });
      }
    }

    // Generate JWT
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      device_uuid: activeDeviceUuid
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        deviceUuid: activeDeviceUuid,
        ...(user.role === 'STUDENT' && {
          rollNumber: user.roll_number,
          className: user.class_name,
          parentPhone: user.parent_phone,
          status: user.status
        })
      }
    });
  } catch (error) {
    console.error('[Login Error]', error);
    return res.status(500).json({ error: 'Internal Server Error during login' });
  }
};

// GET LOGGED IN USER DETAILS
export const getMe = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userRes = await query(
      `SELECT u.id, u.email, u.phone, u.role, u.device_uuid, s.roll_number, s.class_name, s.parent_phone, s.status 
       FROM users u 
       LEFT JOIN students s ON u.id = s.user_id 
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        deviceUuid: user.device_uuid,
        ...(user.role === 'STUDENT' && {
          rollNumber: user.roll_number,
          className: user.class_name,
          parentPhone: user.parent_phone,
          status: user.status
        })
      }
    });
  } catch (error) {
    console.error('[getMe Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// RESET DEVICE UUID (ADMIN ONLY)
export const resetDeviceUuid = async (req: Request, res: Response) => {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ error: 'Target user ID is required' });
  }

  try {
    const userRes = await query('SELECT id, email, role FROM users WHERE id = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await query('UPDATE users SET device_uuid = NULL, updated_at = NOW() WHERE id = $1', [targetUserId]);

    return res.json({
      message: `Device binding for user ${userRes.rows[0].email} has been reset successfully.`
    });
  } catch (error) {
    console.error('[Reset Device UUID Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
