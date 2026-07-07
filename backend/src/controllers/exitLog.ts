import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query, pool } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

interface QrDecodedPayload {
  permissionId: string;
  studentId: string;
  rollNumber: string;
  type: 'EXIT' | 'ENTRY';
  deviceUuid: string;
}

// SCAN & LOG ENTRY/EXIT (GUARD ONLY)
export const scanQrCode = async (req: Request, res: Response) => {
  const { qrToken } = req.body;
  const guardId = req.user?.id;

  if (!qrToken) {
    return res.status(400).json({ error: 'QR Token string is required' });
  }

  try {
    // 1. Verify and decode the JWT token
    let decoded: QrDecodedPayload;
    try {
      decoded = jwt.verify(qrToken, JWT_SECRET) as QrDecodedPayload;
    } catch (jwtErr: any) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(400).json({ 
          accessGranted: false,
          error: 'Access Denied: QR code expired. Refresh screen and scan again.' 
        });
      }
      return res.status(400).json({ 
        accessGranted: false, 
        error: 'Access Denied: Invalid QR code signature.' 
      });
    }

    const { permissionId, studentId, rollNumber, type: scanType, deviceUuid } = decoded;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Double-check deviceUUID binding consistency for student user
      const userRes = await client.query('SELECT email, device_uuid FROM users WHERE id = $1', [studentId]);
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ accessGranted: false, error: 'Student account not found' });
      }

      const user = userRes.rows[0];
      const studentName = user.email.split('@')[0];
      if (user.device_uuid !== deviceUuid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          accessGranted: false, 
          error: 'Access Denied: Token generated on unauthorized device.' 
        });
      }

      // 3. Double-check permission in DB is APPROVED and within active time bounds
      const permissionRes = await client.query(
        `SELECT id, exit_time, return_time, status 
         FROM permissions 
         WHERE id = $1 AND student_id = $2`,
        [permissionId, studentId]
      );

      if (permissionRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ accessGranted: false, error: 'Leave permission not found in system.' });
      }

      const dbPermission = permissionRes.rows[0];
      if (dbPermission.status !== 'APPROVED') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          accessGranted: false, 
          error: `Access Denied: Permission has not been approved (Status: ${dbPermission.status}).` 
        });
      }

      const currentTime = new Date();
      const exitTime = new Date(dbPermission.exit_time);
      const returnTime = new Date(dbPermission.return_time);

      if (currentTime < exitTime || currentTime > returnTime) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          accessGranted: false, 
          error: `Access Denied: Scan is outside permitted window (Allowed: ${exitTime.toLocaleTimeString()} - ${returnTime.toLocaleTimeString()}).` 
        });
      }

      // 4. Double check double scans (e.g. exit twice without entering)
      const lastLogRes = await client.query(
        `SELECT log_type FROM exit_logs 
         WHERE student_id = $1 
         ORDER BY logged_at DESC 
         LIMIT 1`,
        [studentId]
      );
      
      const lastLogType = lastLogRes.rows.length > 0 ? lastLogRes.rows[0].log_type : null;
      if (scanType === 'EXIT' && lastLogType === 'EXIT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          accessGranted: false, 
          error: 'Access Denied: Student is already registered as EXITED.' 
        });
      }
      if (scanType === 'ENTRY' && lastLogType === 'ENTRY') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          accessGranted: false, 
          error: 'Access Denied: Student is already registered as INSIDE.' 
        });
      }

      // 5. Insert Entry/Exit audit log
      await client.query(
        `INSERT INTO exit_logs (student_id, permission_id, guard_id, log_type) 
         VALUES ($1, $2, $3, $4)`,
        [studentId, permissionId, guardId, scanType]
      );

      // 6. Update student status inside geofence tracking metadata
      // EXIT => 'LEAVE' (Permitted exit), ENTRY => 'ACTIVE' (Returned inside)
      const targetStudentStatus = scanType === 'EXIT' ? 'LEAVE' : 'ACTIVE';
      await client.query(
        `UPDATE students 
         SET status = $1, updated_at = NOW() 
         WHERE user_id = $2`,
        [targetStudentStatus, studentId]
      );

      await client.query('COMMIT');

      console.log(`[Guard Scan] Student ${user.email} physically logged: ${scanType} by Guard ID ${guardId}`);

      return res.json({
        accessGranted: true,
        message: `Successfully verified and logged ${scanType === 'EXIT' ? 'physical exit' : 'physical entry'}.`,
        logDetails: {
          studentId,
          name: studentName,
          rollNumber,
          logType: scanType,
          loggedAt: new Date()
        }
      });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Scan QR Code Error]', error);
    return res.status(500).json({ accessGranted: false, error: 'Internal Server Error' });
  }
};

// GET EXIT LOGS HISTORY
export const listExitLogs = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  try {
    let result;
    if (role === 'STUDENT') {
      result = await query(
        `SELECT el.id, el.log_type, el.logged_at, 
                u.email as student_email, s.roll_number, s.class_name,
                guard_u.email as guard_email,
                p.reason as leave_reason
         FROM exit_logs el
         JOIN users u ON el.student_id = u.id
         JOIN students s ON u.id = s.user_id
         JOIN users guard_u ON el.guard_id = guard_u.id
         LEFT JOIN permissions p ON el.permission_id = p.id
         WHERE el.student_id = $1
         ORDER BY el.logged_at DESC`,
        [userId]
      );
    } else {
      result = await query(
        `SELECT el.id, el.log_type, el.logged_at, 
                u.email as student_email, s.roll_number, s.class_name,
                guard_u.email as guard_email,
                p.reason as leave_reason
         FROM exit_logs el
         JOIN users u ON el.student_id = u.id
         JOIN students s ON u.id = s.user_id
         JOIN users guard_u ON el.guard_id = guard_u.id
         LEFT JOIN permissions p ON el.permission_id = p.id
         ORDER BY el.logged_at DESC`
      );
    }
    return res.json({ exitLogs: result.rows });
  } catch (error) {
    console.error('[List Exit Logs Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// STUDENT SCAN & CHECK IN/OUT
export const studentScanQrCode = async (req: Request, res: Response) => {
  const studentId = req.user?.id;
  const { qrToken } = req.body; // Scanned QR code string/payload
  
  if (!qrToken) {
    return res.status(400).json({ error: 'Scanned QR Code data is required' });
  }

  try {
    // Parse type (ENTRY or EXIT) from scanned content
    let scanType: 'EXIT' | 'ENTRY' = 'EXIT';
    try {
      const parsed = JSON.parse(qrToken);
      if (parsed.type === 'ENTRY' || parsed.type === 'EXIT') {
        scanType = parsed.type;
      } else if (parsed.logType === 'ENTRY' || parsed.logType === 'EXIT') {
        scanType = parsed.logType;
      }
    } catch (e) {
      // Fallback if not JSON
      const upperToken = qrToken.toUpperCase();
      if (upperToken.includes('ENTRY') || upperToken.includes('IN')) {
        scanType = 'ENTRY';
      } else if (upperToken.includes('EXIT') || upperToken.includes('OUT')) {
        scanType = 'EXIT';
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch student info
      const userRes = await client.query('SELECT email, device_uuid FROM users WHERE id = $1', [studentId]);
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Student account not found' });
      }
      const user = userRes.rows[0];
      const studentName = user.email.split('@')[0];

      // 2. Fetch active approved leave permission
      const permissionRes = await client.query(
        `SELECT id, exit_time, return_time, status 
         FROM permissions 
         WHERE student_id = $1 AND status = 'APPROVED'
         AND NOW() BETWEEN exit_time AND return_time
         ORDER BY created_at DESC
         LIMIT 1`,
        [studentId]
      );

      let permissionId = null;
      if (permissionRes.rows.length > 0) {
        permissionId = permissionRes.rows[0].id;
      }

      // For EXIT, an active approved leave permission MUST exist
      if (scanType === 'EXIT' && !permissionId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Access Denied: No active approved leave permission found for the current time. Please request a leave pass first.' 
        });
      }

      // 3. Double check double scans
      const lastLogRes = await client.query(
        `SELECT log_type FROM exit_logs 
         WHERE student_id = $1 
         ORDER BY logged_at DESC 
         LIMIT 1`,
        [studentId]
      );
      
      const lastLogType = lastLogRes.rows.length > 0 ? lastLogRes.rows[0].log_type : null;
      if (scanType === 'EXIT' && lastLogType === 'EXIT') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Access Denied: You are already registered as EXITED (OFF CAMPUS).' 
        });
      }
      if (scanType === 'ENTRY' && lastLogType === 'ENTRY') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Access Denied: You are already registered as INSIDE (ON CAMPUS).' 
        });
      }

      // 4. Find a guard ID in system to satisfy DB foreign key
      const guardRes = await client.query(`SELECT id FROM users WHERE role = 'GUARD' LIMIT 1`);
      if (guardRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'System configuration error: No active guard account found to log scan.' });
      }
      const guardId = guardRes.rows[0].id;

      // 5. Insert Entry/Exit audit log
      await client.query(
        `INSERT INTO exit_logs (student_id, permission_id, guard_id, log_type) 
         VALUES ($1, $2, $3, $4)`,
        [studentId, permissionId, guardId, scanType]
      );

      // 6. Update student status inside geofence tracking metadata
      const targetStudentStatus = scanType === 'EXIT' ? 'LEAVE' : 'ACTIVE';
      await client.query(
        `UPDATE students 
         SET status = $1, updated_at = NOW() 
         WHERE user_id = $2`,
        [targetStudentStatus, studentId]
      );

      await client.query('COMMIT');

      console.log(`[Student Scan] Student ${user.email} physically logged: ${scanType}`);

      return res.json({
        accessGranted: true,
        message: `Successfully verified and logged ${scanType === 'EXIT' ? 'physical exit' : 'physical entry'}.`,
        logDetails: {
          studentId,
          name: studentName,
          logType: scanType,
          loggedAt: new Date()
        }
      });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Student Scan QR Code Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
