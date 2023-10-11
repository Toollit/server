import express, { Request, Response } from 'express';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  const nickname = user?.nickname;

  // login user
  if (user) {
    // login with tempPassword user
    if (user.tempPassword) {
      return res.status(200).json({
        success: true,
        message: null,
        data: { nickname, needResetPassword: true },
      });
    }

    // login with original Password user
    return res.status(200).json({
      success: true,
      message: null,
      data: { nickname, needResetPassword: false },
    });
  } else {
    // Not login user
    return res.status(200).json({
      success: false,
      message: null,
      data: { nickname: null, needResetPassword: false },
    });
  }
});

export default router;
