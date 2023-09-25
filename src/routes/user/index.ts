import express from 'express';
import profile from './profile';
import login from './login';
import logout from './logout';
import signUp from './signUp';
import pwInquiry from './pwInquiry';
import resetPassword from './resetPassword';
import duplicateCheckNickname from './duplicateCheckNickname';

const router = express.Router();

router.use('/profile', profile);
router.use('/login', login);
router.use('/logout', logout);
router.use('/signUp', signUp);
router.use('/pwInquiry', pwInquiry);
router.use('/resetPassword', resetPassword);
router.use('/duplicateCheckNickname', duplicateCheckNickname);

export default router;
