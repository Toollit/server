import express from 'express';
import user from './user';
import email from './email';

const router = express.Router();

router.use('/user', user);
router.use('/email', email);

export default router;
