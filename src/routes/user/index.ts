import express from 'express';
import contact from './contact';
import deleteAccount from './deleteAccount';
import duplicateNicknameCheck from './duplicateNicknameCheck';
import signin from './signin';
import logout from './logout';
import profile from './profile';
import temporaryPassword from './temporaryPassword';
import updatePassword from './updatePassword';
import signup from './signup';

const router = express.Router();

router.use('/contact', contact);
router.use('/delete-account', deleteAccount);
router.use('/duplicate-nickname-check', duplicateNicknameCheck);
router.use('/signin', signin);
router.use('/logout', logout);
router.use('/profile', profile);
router.use('/temporary-password', temporaryPassword);
router.use('/update-password', updatePassword);
router.use('/signup', signup);

export default router;
