import { Router } from 'express';
import { scanQrCode, listExitLogs, studentScanQrCode } from '../controllers/exitLog';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Scan and log physical exit/entry (GUARD only)
router.post('/scan', requireRole(['GUARD']), scanQrCode);

// Student check themselves in/out by scanning school QR code (STUDENT only)
router.post('/student-scan', requireRole(['STUDENT']), studentScanQrCode);

// Get physical log history audit trails (ADMIN, GUARD & STUDENT)
router.get('/', requireRole(['ADMIN', 'GUARD', 'STUDENT']), listExitLogs);

export default router;
