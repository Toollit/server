import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { Report } from '@/entity/Report';
import { isLoggedIn } from '@/middleware/loginCheck';
import {
  CLIENT_ERROR_DEFAULT,
  CLIENT_ERROR_EXIST_REPORT,
  CLIENT_ERROR_LOGIN_REQUIRED,
} from '@/message/error';

const router = express.Router();

interface ReportReqBody {
  postId: number;
  postType: 'project';
  reason: string;
  url: string;
}

// Report problematic post router
router.post(
  '/',
  isLoggedIn,
  async (
    req: Request<{}, {}, ReportReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const { postId, postType, reason, url } = req.body;
    const currentUser = req.user;

    if (!currentUser) {
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
      const problematicUser = await AppDataSource.createQueryBuilder()
        .relation(entity, 'user')
        .of(postId)
        .loadOne();

      const problematicPost = await AppDataSource.getRepository(entity).findOne(
        { where: { id: postId } }
      );

      if (!problematicUser) {
        throw new Error('Problematic user does not exist');
      }

      if (!problematicPost) {
        throw new Error('Problematic post does not exist');
      }

      // Check duplicate reports from the same user
      const existReport = await AppDataSource.getRepository(Report)
        .createQueryBuilder()
        .where('postId = :postId', { postId })
        .andWhere('postType = :postType', { postType })
        .andWhere('writerId = :writerId', { writerId: problematicUser.id })
        .andWhere('reporterId = :reporterId', { reporterId: currentUser.id })
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
            postType,
            postId,
            title: problematicPost.title,
            content: problematicPost.contentHTML,
            writerId: problematicUser.id,
            writerNickname: problematicUser.nickname,
            reporterId: currentUser.id,
            reporterNickname: currentUser.nickname,
            reason,
            url,
            updatedAt: () => 'updatedAt',
          },
        ])
        .execute();

      return res.status(200).json({
        success: true,
        message: null,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
