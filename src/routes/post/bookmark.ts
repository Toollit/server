import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';
import { Bookmark } from '@/entity/Bookmark';
import { isLoggedIn } from '@/middleware/loginCheck';
import { CLIENT_ERROR_LOGIN_REQUIRED } from '@/message/error';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Check bookmarks status of all posts router
router.get(
  '/bookmarksStatus',
  async (req: Request, res: Response, next: NextFunction) => {
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarks: null,
        },
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    try {
      const user = await userRepository.findOne({
        where: { id: currentUser.id },
        relations: { bookmarks: true },
      });

      const bookmarks = user?.bookmarks;

      if (!bookmarks) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: null,
          },
        });
      }

      const hashBookmark = bookmarks.length >= 1;

      const bookmarkIds = bookmarks.map((bookmark) => bookmark.projectId);

      if (hashBookmark) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: bookmarkIds,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarks: null,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

interface ProjectBookmarkReqBody {
  postId: string;
}

// Bookmark add or delete router
router.post(
  '/toggle',
  isLoggedIn,
  async (
    req: Request<{}, {}, ProjectBookmarkReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const postId = Number(req.body.postId);
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: CLIENT_ERROR_LOGIN_REQUIRED,
      });
    }

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const existBookmark = await queryRunner.manager
        .getRepository(Bookmark)
        .findOne({
          where: { userId: currentUser.id, projectId: postId },
        });

      // Cancel exist bookmark
      if (existBookmark) {
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Bookmark)
          .where('id = :id', { id: existBookmark.id })
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            status: 'cancel',
          },
        });
      }

      // Save new bookmark
      if (!existBookmark) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Bookmark)
          .values([{ userId: currentUser.id, projectId: postId }])
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            status: 'save',
          },
        });
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

// Check bookmark status router
router.get(
  '/bookmarkStatus/:postId',
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.params.postId);
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmark: false,
        },
      });
    }

    const bookmarkRepository = AppDataSource.getRepository(Bookmark);

    try {
      const isBookmarked = await bookmarkRepository.findOne({
        where: {
          userId: currentUser.id,
          projectId: postId,
        },
      });

      if (isBookmarked) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmark: true,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmark: false,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
