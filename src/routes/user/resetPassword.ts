import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import crypto from 'crypto';
import { User } from '@/entity/User';
import { isLoggedIn } from '@/middleware/loginCheck';
import dotenv from 'dotenv';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_SAME_PASSWORD_IMPOSSIBLE,
} from '@/message/error';

dotenv.config();

const router = express.Router();

// resetPassword page password reset router
router.post(
  '/',
  isLoggedIn,
  (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const newPassword = req.body.password;

    if (user?.tempPassword) {
      const salt = Buffer.from(user.salt, 'hex');

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

          const userPassword = Buffer.from(user.password, 'hex');

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
                    loginFailedCount: 0,
                  })
                  .where('id = :id', { id: user.id })
                  .execute();

                return res.status(201).json({
                  success: true,
                  message: null,
                });
              } catch (error) {
                return next(error);
              }
            }
          );
        }
      );
    } else {
      // wrong access without logged in with a temporary password
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }
  }
);

export default router;
