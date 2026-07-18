import { Router } from 'express';
import { login, logout, refresh, register } from '../controllers/auth';
import { validate } from '../middlewares/validate';
import { loginSchema, refreshTokenSchema, registerSchema } from '../validators/auth';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/logout', validate(refreshTokenSchema), logout);
router.post('/refresh', validate(refreshTokenSchema), refresh);

export default router;
export { router as authRouter };
