import { query } from '../db';

interface GeofenceCheckResult {
  isInside: boolean;
  hasActivePermission: boolean;
  studentStatus: 'ACTIVE' | 'LEAVE' | 'OUT_OF_BOUNDS';
  studentName: string;
  rollNumber: string;
}

/**
 * Checks if a given coordinate (lat, lng) is inside any active geofences,
 * verifies student permissions, and updates student status accordingly.
 */
export async function processStudentLocation(
  studentId: string,
  lat: number,
  lng: number
): Promise<GeofenceCheckResult> {
  // 1. Check if the coordinate is inside any active geofence
  // ST_Point expects (longitude, latitude)
  const spatialQuery = `
    SELECT EXISTS (
      SELECT 1 FROM geofences 
      WHERE is_active = true 
      AND ST_Contains(polygon, ST_SetSRID(ST_Point($1, $2), 4326))
    ) AS inside;
  `;
  const spatialRes = await query(spatialQuery, [lng, lat]);
  const isInside = spatialRes.rows[0].inside;

  // 2. Insert into location history
  const historyQuery = `
    INSERT INTO location_history (student_id, coords, is_inside) 
    VALUES ($1, ST_SetSRID(ST_Point($2, $3), 4326), $4);
  `;
  await query(historyQuery, [studentId, lng, lat, isInside]);

  // 3. Check for approved and active permission (leave window)
  const permissionQuery = `
    SELECT id FROM permissions 
    WHERE student_id = $1 
    AND status = 'APPROVED' 
    AND NOW() BETWEEN exit_time AND return_time;
  `;
  const permissionRes = await query(permissionQuery, [studentId]);
  const hasActivePermission = permissionRes.rows.length > 0;

  // 4. Fetch student and user metadata
  const studentMetadataRes = await query(
    `SELECT u.email, s.roll_number, s.status 
     FROM users u 
     JOIN students s ON u.id = s.user_id 
     WHERE u.id = $1`,
    [studentId]
  );
  
  if (studentMetadataRes.rows.length === 0) {
    throw new Error('Student user metadata not found');
  }

  const { email, roll_number: rollNumber, status: currentStatus } = studentMetadataRes.rows[0];
  const studentName = email.split('@')[0]; // Fallback name display

  // Determine new status
  let newStatus: 'ACTIVE' | 'LEAVE' | 'OUT_OF_BOUNDS' = 'ACTIVE';
  if (!isInside) {
    newStatus = hasActivePermission ? 'LEAVE' : 'OUT_OF_BOUNDS';
  }

  // Update status in database if it has changed
  if (newStatus !== currentStatus) {
    await query(
      'UPDATE students SET status = $1, updated_at = NOW() WHERE user_id = $2',
      [newStatus, studentId]
    );
  }

  return {
    isInside,
    hasActivePermission,
    studentStatus: newStatus,
    studentName,
    rollNumber
  };
}

/**
 * Audit job to double check and flag students whose leave permissions have expired,
 * but who are still outside active geofences.
 */
export async function runGeofenceAudit(): Promise<void> {
  try {
    // Select students whose current status is LEAVE but who no longer have an active approved permission
    const expiredLeavesRes = await query(`
      SELECT s.user_id, u.email, lh.lat, lh.lng, lh.is_inside
      FROM students s
      JOIN users u ON s.user_id = u.id
      -- Get their last tracked location from location history using PostGIS coordinate extraction
      LEFT JOIN LATERAL (
        SELECT ST_Y(coords) as lat, ST_X(coords) as lng, is_inside
        FROM location_history
        WHERE student_id = s.user_id
        ORDER BY created_at DESC
        LIMIT 1
      ) lh ON true
      WHERE s.status = 'LEAVE'
      AND NOT EXISTS (
        SELECT 1 FROM permissions p
        WHERE p.student_id = s.user_id
        AND p.status = 'APPROVED'
        AND NOW() BETWEEN p.exit_time AND p.return_time
      );
    `);


    for (const student of expiredLeavesRes.rows) {
      // If student is recorded as outside or location history doesn't verify they came back, flag them
      if (student.is_inside === false) {
        await query(
          "UPDATE students SET status = 'OUT_OF_BOUNDS', updated_at = NOW() WHERE user_id = $1",
          [student.user_id]
        );
        console.log(`[Geofence Audit] Student ${student.email} flagged OUT_OF_BOUNDS due to expired permission.`);
      } else {
        // If they are actually inside, reset status to ACTIVE
        await query(
          "UPDATE students SET status = 'ACTIVE', updated_at = NOW() WHERE user_id = $1",
          [student.user_id]
        );
      }
    }
  } catch (error) {
    console.error('[Geofence Audit Error]', error);
  }
}
