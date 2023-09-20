import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import crypto from 'crypto';
import { User } from '@/entity/User';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// resetPassword page password reset router
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  const userInfo = req.user;
  const newPassword = req.body.password;

  if (userInfo?.tempPassword) {
    userInfo;
    const salt = Buffer.from(userInfo.salt, 'hex');

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

        const userPassword = Buffer.from(userInfo.password, 'hex');

        if (crypto.timingSafeEqual(userPassword, hashedPassword)) {
          return res.status(400).json({
            success: false,
            message: '이전과 동일한 비밀번호는 다시 사용할 수 없습니다.',
          });
        } else {
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
                    loginFailedCounts: 0,
                  })
                  .where('id = :id', { id: userInfo.id })
                  .execute();

                return res.status(201).json({
                  success: true,
                  message:
                    '비밀번호 변경이 완료되었습니다. 새로운 비밀번호로 다시 로그인해주세요.',
                });
              } catch (error) {
                return next(error);
              }
            }
          );
        }
      }
    );
  } else {
    // 임시 비밀번호로 로그인하지 않고 잘못된 접근으로 비밀번호 재설정을 하려는 경우
    return res.status(400).json({
      success: false,
      message: '잘못된 접근 입니다.',
    });
  }
});

export default router;
