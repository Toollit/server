import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import crypto from 'crypto';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';
import { isLoggedIn } from '@/middleware/loginCheck';
import { CLIENT_ERROR_DEFAULT } from '@/message/error';

const router = express.Router();

// Email sign up router
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, signUpType } = req.body;

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (!email || !password || !signUpType) {
      throw new Error('The information required for sign up is missing');
    }

    const salt = crypto.randomBytes(64);

    // If it does not work asynchronously, queryRunner.release() written inside the finally block will work first, resulting in an error (ex. QueryRunnerAlreadyReleasedError: Query runner already released.)
    await new Promise(() => {
      crypto.pbkdf2(
        password,
        salt,
        310000,
        64,
        'sha512',
        async function (err, hashedPassword) {
          if (err) {
            return next(err);
          }

          const saltString = salt.toString('hex');
          const hashedString = hashedPassword.toString('hex');

          const newProfile = await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(Profile)
            .values({})
            .execute();

          const newUser = await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(User)
            .values({
              email,
              password: hashedString,
              salt: saltString,
              signUpType,
              updatedAt: null,
              lastLoginAt: new Date(),
              profile: newProfile.identifiers[0].id,
            })
            .execute();

          const user = await queryRunner.manager
            .getRepository(User)
            .createQueryBuilder('user')
            .where('user.id = :id', { id: newUser.identifiers[0].id })
            .getOne();

          await queryRunner.commitTransaction();

          if (!user) {
            throw new Error('New user information is not queried');
          }

          return req.login(user, async (err) => {
            if (err) {
              return next(err);
            }

            return res.status(201).json({
              success: true,
              message: null,
            });
          });
        }
      );
    });
  } catch (err) {
    await queryRunner.rollbackTransaction();
    return next(err);
  } finally {
    await queryRunner.release();
  }
});

// Social login user nickname setting router
router.post(
  '/settings/update/nickname',
  isLoggedIn,
  async (req: Request, res: Response, next: NextFunction) => {
    const { nickname } = req.body;
    const currentUser = req.user;

    if (!nickname) {
      res.status(400).json({
        success: false,
        message: CLIENT_ERROR_DEFAULT,
      });
    }

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set({
          nickname,
          updatedAt: null,
        })
        .where('id = :id', { id: currentUser?.id })
        .execute();

      await queryRunner.commitTransaction();

      return res.status(201).json({
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
