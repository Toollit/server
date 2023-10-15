import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { Report } from '@/entity/Report';
import { isLoggedIn } from '@/middleware/loginCheck';
import {
  CLIENT_ERROR_DEFAULT,
  CLIENT_ERROR_EXIST_REPORT,
  CLIENT_ERROR_LOGIN_REQUIRED,
  SERVER_ERROR_DEFAULT,
} from '@/message/error';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Report problematic posts api
router.post(
  '/',
  isLoggedIn,
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const { postId, postType, title, writer, reason, url } = req.body;

    // Check user login status
    if (!user) {
      return res.status(401).json({
        success: false,
        message: CLIENT_ERROR_LOGIN_REQUIRED,
      });
    }

    let entity;

    switch (postType) {
      case 'project':
        entity = Project;
        break;

      default:
        break;
    }

    if (!entity) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_DEFAULT,
      });
    }

    try {
      const problemUser = await AppDataSource.createQueryBuilder()
        .relation(entity, 'user')
        .of(postId)
        .loadOne();

      if (writer !== problemUser.nickname) {
        return res.status(500).json({
          success: false,
          message: SERVER_ERROR_DEFAULT,
        });
      }

      // Check duplicate reports from the same user
      const existReport = await AppDataSource.getRepository(Report)
        .createQueryBuilder()
        .where('postId = :postId', { postId })
        .andWhere('postType = :postType', { postType })
        .andWhere('writerId = :writerId', { writerId: problemUser.id })
        .andWhere('reporterId = :reporterId', { reporterId: user.id })
        .getOne();

      if (existReport) {
        return res.status(409).json({
          success: true,
          message: CLIENT_ERROR_EXIST_REPORT,
        });
      }

      await AppDataSource.createQueryBuilder()
        .insert()
        .into(Report)
        .values([
          {
            title,
            writerId: problemUser.id,
            writerNickname: writer,
            reporterId: user.id,
            reporterNickname: user.nickname ?? '',
            postType,
            postId,
            reason,
            url,
          },
        ])
        .execute();

      return res.status(200).json({
        success: true,
        message: null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
