import { Router } from 'express';
import { requestLeave, listPermissions, approveRejectLeave, generateQrCode } from '../controllers/permission';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Submit request (STUDENT only)
router.post('/', requireRole(['STUDENT']), requestLeave);

// List requests (ADMIN, GUARD, STUDENT)
router.get('/', requireRole(['ADMIN', 'GUARD', 'STUDENT']), listPermissions);

// Approve / Reject (ADMIN only)
router.put('/:id', requireRole(['ADMIN']), approveRejectLeave);

// Generate short-lived dynamic QR code (STUDENT only)
router.get('/active/qr', requireRole(['STUDENT']), generateQrCode);

export default router;
