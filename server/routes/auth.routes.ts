import { Router } from 'express';
import { authLogin, authCallback, getAuthSession, authLogout } from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.get('/login', authLogin);
authRouter.get('/callback', authCallback);
authRouter.get('/session', getAuthSession);
authRouter.post('/logout', authLogout);

export default authRouter;
