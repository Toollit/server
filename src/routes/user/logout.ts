import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
const router = express.Router();

// User logout router
router.post('/', (req: Request, res: CustomResponse, next: NextFunction) => {
  return req.logout(function (err) {
    if (err) {
      return next(err);
    }

    return res.status(200).json({
      success: true,
      message: null,
    });
  });
});

export default router;
