import express, { Request, Response } from 'express';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (user) {
    if (user.tempPassword) {
      return res.status(200).json({
        success: true,
        message: 'needResetPassword',
        data: {
          nickname: user.nickname,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: null,
      data: {
        nickname: user.nickname,
      },
    });
  } else {
    return res.status(200).json({
      success: false,
      message: null,
      data: {
        nickname: null,
      },
    });
  }
});

export default router;
