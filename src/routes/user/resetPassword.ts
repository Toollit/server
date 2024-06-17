import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import crypto from 'crypto';
import { User } from '@/entity/User';
import { isLoggedIn } from '@/middleware/loginCheck';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_SAME_PASSWORD_IMPOSSIBLE,
} from '@/message/error';

const router = express.Router();

// Reset password page password reset router
router.post(
  '/',
  isLoggedIn,
  (req: Request, res: CustomResponse, next: NextFunction) => {
    const currentUser = req.user;
    const newPassword = req.body.password;

    if (currentUser?.tempPassword) {
      const salt = Buffer.from(currentUser.salt, 'hex');

      crypto.pbkdf2(
        newPassword,
        salt,
        310000,
        64,
        'sha512',
        async function (err, hashedPassword) {
          if (err) {
            return next(err);
          }

          const userPassword = Buffer.from(currentUser.password, 'hex');

          if (crypto.timingSafeEqual(userPassword, hashedPassword)) {
            return res.status(400).json({
              success: false,
              message: CLIENT_ERROR_SAME_PASSWORD_IMPOSSIBLE,
            });
          }

          const newSalt = crypto.randomBytes(64);

          crypto.pbkdf2(
            newPassword,
            newSalt,
            310000,
            64,
            'sha512',
            async function (err, hashedPassword) {
              if (err) {
                return next(err);
              }

              const saltString = newSalt.toString('hex');
              const hashedString = hashedPassword.toString('hex');

              try {
                await AppDataSource.createQueryBuilder()
                  .update(User)
                  .set({
                    salt: saltString,
                    password: hashedString,
                    tempPassword: null,
                    signinFailedCount: 0,
                  })
                  .where('id = :id', { id: currentUser.id })
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
        }
      );
    } else {
      // Wrong access without logged in with a temporary password
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }
  }
);

export default router;
