import express from 'express';
import contact from './contact';
import deleteAccount from './deleteAccount';
import duplicateNicknameCheck from './duplicateNicknameCheck';
import signin from './signin';
import logout from './logout';
import profile from './profile';
import pwInquiry from './pwInquiry';
import resetPassword from './resetPassword';
import signup from './signup';

const router = express.Router();

router.use('/contact', contact);
router.use('/deleteAccount', deleteAccount);
router.use('/duplicateNicknameCheck', duplicateNicknameCheck);
router.use('/signin', signin);
router.use('/logout', logout);
router.use('/profile', profile);
router.use('/pwInquiry', pwInquiry);
router.use('/resetPassword', resetPassword);
router.use('/signup', signup);

export default router;
