import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/entity/User';
import { Bookmark } from '@/entity/Bookmark';
import { isSignedIn } from '@/middleware/signinCheck';
import { CLIENT_ERROR_LOGIN_REQUIRED } from '@/message/error';

const router = express.Router();

// Check bookmarks status of all posts router
router.get(
  '/bookmarkIds',
  async (req: Request, res: CustomResponse, next: NextFunction) => {
    const loggedInUser = req.user;

    if (!loggedInUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarkIds: [],
        },
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    try {
      const user = await userRepository.findOne({
        where: { id: loggedInUser.id },
        relations: { bookmarks: true },
      });

      if (!user) {
        throw new Error('user not found');
      }

      const bookmarks = user.bookmarks;
      const hasBookmark = bookmarks.length >= 1;
      const bookmarkIds = bookmarks.map((bookmark) => bookmark.projectId);

      if (hasBookmark) {
        return res.status(200).json({
          success: true,
          message: null,
          data: { bookmarkIds },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarkIds: [],
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
  isSignedIn,
  async (
    req: Request<{}, {}, ProjectBookmarkReqBody>,
    res: CustomResponse,
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
  '/status/:postId',
  async (req: Request, res: CustomResponse, next: NextFunction) => {
    const postId = Number(req.params.postId);
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarkStatus: false,
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
            bookmarkStatus: true,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarkStatus: false,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
