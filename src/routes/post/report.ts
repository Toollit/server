import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { Report } from '@/entity/Report';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Report problematic posts api
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;

  // Check user login status
  if (!user) {
    return res.status(400).json({
      success: true,
      message: '로그인 후 이용 가능합니다.',
    });
  }

  const { postId, postType, title, writer, reason, url } = req.body;

  let entity;

  switch (postType) {
    case 'project':
      entity = Project;
      break;

    default:
      break;
  }

  if (!entity) {
    return res.status(500).json({
      success: false,
      message: null,
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
        message: null,
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
      return res.status(200).json({
        success: true,
        message: '이미 신고한 게시글 입니다.',
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
      message:
        '신고해 주셔서 감사합니다. 최대한 빠른 시간 내에 검토 후 조치하도록 하겠습니다.',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
