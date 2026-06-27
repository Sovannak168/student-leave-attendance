import { Router } from 'express';
import { register, login, getMe, resetDeviceUuid } from '../controllers/auth';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, getMe);
router.post('/reset-device', authenticateToken, requireRole(['ADMIN']), resetDeviceUuid);

export default router;
