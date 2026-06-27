import { Router } from 'express';
import { createGeofence, listGeofences, getGeofenceById, updateGeofence, deleteGeofence } from '../controllers/geofence';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Geofence management requires authentication
router.use(authenticateToken);

// Create, Update, Delete are restricted to ADMIN
router.post('/', requireRole(['ADMIN']), createGeofence);
router.put('/:id', requireRole(['ADMIN']), updateGeofence);
router.delete('/:id', requireRole(['ADMIN']), deleteGeofence);

// Read-only geofence routes can be accessed by ADMIN, GUARD, and STUDENT
router.get('/', requireRole(['ADMIN', 'GUARD', 'STUDENT']), listGeofences);
router.get('/:id', requireRole(['ADMIN', 'GUARD', 'STUDENT']), getGeofenceById);

export default router;
