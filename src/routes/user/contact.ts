import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import dotenv from 'dotenv';
import { isLoggedIn } from '@/middleware/loginCheck';
import { CLIENT_ERROR_ABNORMAL_ACCESS } from '@/message/error';
import { Contact } from '@/entity/Contact';

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const router = express.Router();

interface ContactReqBody {
  title: string;
  type: string;
  content: string;
}

// Contact router
router.post(
  '/',
  isLoggedIn,
  async (
    req: Request<{}, {}, ContactReqBody>,
    res: Response,
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
