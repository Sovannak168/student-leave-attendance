import { Router } from 'express';
import { scanQrCode, listExitLogs } from '../controllers/exitLog';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Scan and log physical exit/entry (GUARD only)
router.post('/scan', requireRole(['GUARD']), scanQrCode);

// Get physical log history audit trails (ADMIN & GUARD only)
router.get('/', requireRole(['ADMIN', 'GUARD']), listExitLogs);

export default router;
