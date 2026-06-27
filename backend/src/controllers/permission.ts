import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

// SUBMIT LEAVE REQUEST (STUDENT ONLY)
export const requestLeave = async (req: Request, res: Response) => {
  const { reason, exitTime, returnTime } = req.body;
  const studentId = req.user?.id;

  if (!reason || !exitTime || !returnTime) {
    return res.status(400).json({ error: 'Reason, exitTime, and returnTime are required' });
  }

  try {
    const exitDate = new Date(exitTime);
    const returnDate = new Date(returnTime);

    if (exitDate >= returnDate) {
      return res.status(400).json({ error: 'Exit time must be before return time' });
    }

    if (exitDate < new Date()) {
      return res.status(400).json({ error: 'Exit time cannot be in the past' });
    }

    const result = await query(
      `INSERT INTO permissions (student_id, reason, exit_time, return_time, status) 
       VALUES ($1, $2, $3, $4, 'PENDING') 
       RETURNING id, student_id, reason, exit_time, return_time, status, created_at`,
      [studentId, reason, exitDate, returnDate]
    );

    return res.status(201).json({
      message: 'Leave request submitted successfully',
      permission: result.rows[0]
    });
  } catch (error) {
    console.error('[Request Leave Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// LIST LEAVE REQUESTS (ADMIN, GUARD, STUDENT)
export const listPermissions = async (req: Request, res: Response) => {
  const { role, id: userId } = req.user!;

  try {
    let result;
    if (role === 'STUDENT') {
      // Students can only see their own requests
      result = await query(
        `SELECT id, reason, exit_time, return_time, status, approved_by, created_at 
         FROM permissions 
         WHERE student_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );
    } else {
      // Admins and Guards see all requests along with student metadata
      result = await query(
        `SELECT p.id, p.reason, p.exit_time, p.return_time, p.status, p.created_at, 
                u.email as student_email, s.roll_number, s.class_name, 
                admin_u.email as approved_by_email
         FROM permissions p
         JOIN users u ON p.student_id = u.id
         JOIN students s ON u.id = s.user_id
         LEFT JOIN users admin_u ON p.approved_by = admin_u.id
         ORDER BY p.created_at DESC`
      );
    }

    return res.json({ permissions: result.rows });
  } catch (error) {
    console.error('[List Permissions Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// APPROVE OR REJECT LEAVE (ADMIN ONLY)
export const approveRejectLeave = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // 'APPROVED' or 'REJECTED'
  const adminId = req.user?.id;

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be APPROVED or REJECTED' });
  }

  try {
    const checkRes = await query('SELECT id, student_id, status FROM permissions WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Permission request not found' });
    }

    // Permission exists and is valid — proceed with update
    const result = await query(
      `UPDATE permissions 
       SET status = $1, approved_by = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING id, student_id, reason, exit_time, return_time, status, approved_by, updated_at`,
      [status, adminId, id]
    );

    // If approved, update student status to 'LEAVE' if they are already out, 
    // or let the entry/exit scanner handle it when they physically scan out.
    // Here we just return the updated permission record.
    return res.json({
      message: `Leave request has been ${status.toLowerCase()} successfully`,
      permission: result.rows[0]
    });
  } catch (error) {
    console.error('[Approve/Reject Leave Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// GENERATE DYNAMIC LEAVE QR JWT (STUDENT ONLY)
export const generateQrCode = async (req: Request, res: Response) => {
  const studentId = req.user?.id;
  const deviceUuid = req.user?.device_uuid;

  try {
    // 1. Fetch active approved permission
    const permissionRes = await query(
      `SELECT id, exit_time, return_time 
       FROM permissions 
       WHERE student_id = $1 
       AND status = 'APPROVED' 
       AND NOW() BETWEEN exit_time AND return_time`,
      [studentId]
    );

    if (permissionRes.rows.length === 0) {
      return res.status(400).json({ 
        error: 'No active approved leave permission found for the current time.' 
      });
    }

    const activePermission = permissionRes.rows[0];

    // 2. Fetch student details
    const studentRes = await query(
      `SELECT roll_number FROM students WHERE user_id = $1`,
      [studentId]
    );
    const rollNumber = studentRes.rows[0].roll_number;

    // 3. Determine QR Type (EXIT or ENTRY) based on last logged scan
    const lastLogRes = await query(
      `SELECT log_type FROM exit_logs 
       WHERE student_id = $1 
       ORDER BY logged_at DESC 
       LIMIT 1`,
      [studentId]
    );
    
    // Default is EXIT. If last was EXIT, next must be ENTRY. If last was ENTRY, next must be EXIT.
    let qrType: 'EXIT' | 'ENTRY' = 'EXIT';
    if (lastLogRes.rows.length > 0 && lastLogRes.rows[0].log_type === 'EXIT') {
      qrType = 'ENTRY';
    }

    // 4. Generate dynamic JWT payload (30-second expiry to block screenshots/transfers)
    const qrPayload = {
      permissionId: activePermission.id,
      studentId,
      rollNumber,
      type: qrType,
      deviceUuid,
      timestamp: Date.now()
    };

    const qrToken = jwt.sign(qrPayload, JWT_SECRET, { expiresIn: '30s' });

    return res.json({
      qrToken,
      type: qrType,
      expiresIn: 30
    });
  } catch (error) {
    console.error('[Generate QR Error]', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
