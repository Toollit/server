import express from 'express';
import { AppDataSource } from '@/data-source';
import crypto from 'crypto';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// user signUp router
router.post('/', async (req, res, next) => {
  const { email, password, signUpType } = req.body;

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    await queryRunner.connect();

    await queryRunner.startTransaction();

    const atSignIndex = email.indexOf('@');
    const initialNickname = email.slice(0, atSignIndex);

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

          try {
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
                nickname: initialNickname,
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

            if (user) {
              return req.login(user, async (err) => {
                if (err) {
                  return next(err);
                }

                return res.status(201).json({
                  success: true,
                  message: 'signup success',
                });
              });
            }
          } catch (error) {
            await queryRunner.rollbackTransaction();

            return next(error);
          } finally {
            await queryRunner.release();
          }
        }
      );
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();

    return next(error);
  } finally {
    await queryRunner.release();
  }
});

export default router;
