import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import { isSignedIn } from '@/middleware/signinCheck';
import { CLIENT_ERROR_ABNORMAL_ACCESS } from '@/message/error';
import { Contact } from '@/entity/Contact';

const router = express.Router();

interface ContactReqBody {
  title: string;
  type: string;
  content: string;
}

// Contact router
router.post(
  '/',
  isSignedIn,
  async (
    req: Request<{}, {}, ContactReqBody>,
    res: CustomResponse,
    next: NextFunction
  ) => {
    const { title, type, content } = req.body;
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }

    try {
      await AppDataSource.createQueryBuilder()
        .insert()
        .into(Contact)
        .values({ title, type, content, writerId: currentUser.id })
        .execute();

      return res.status(201).json({
        success: true,
        message: null,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
