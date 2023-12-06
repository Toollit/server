import { AppDataSource } from '@/data-source';
import { Bookmark } from '@/entity/Bookmark';
import { Profile } from '@/entity/Profile';
import { User } from '@/entity/User';
import { CLIENT_ERROR_ABNORMAL_ACCESS } from '@/message/error';
import { isLoggedIn } from '@/middleware/loginCheck';
import express, { NextFunction, Request, Response } from 'express';

const router = express.Router();

// Delete user account router
router.post(
  '/',
  isLoggedIn,
  async (req: Request, res: Response, next: NextFunction) => {
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const user = await queryRunner.manager
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.id = :id', { id: currentUser.id })
        .leftJoinAndSelect('user.profile', 'profile')
        .getOne();

      if (!user) {
        throw new Error('User does not exist.');
      }

      const profile = await queryRunner.manager
        .getRepository(Profile)
        .createQueryBuilder()
        .where('id = :id', { id: user?.profile.id })
        .getOne();

      if (!profile) {
        throw new Error('Profile does not exist.');
      }

      // Delete all user and related data except one to one relationship profile
      // Cascade not working one to one relation.
      // Github issue reference: https://github.com/typeorm/typeorm/issues/3218
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('id = :id', { id: currentUser.id })
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(Profile)
        .where('id = :id', { id: profile.id })
        .execute();

      await queryRunner.commitTransaction();

      return res.status(200).json({
        success: true,
        message: null,
      });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

export default router;
