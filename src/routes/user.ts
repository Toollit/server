import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';
import crypto from 'crypto';
import passport from 'passport';
import {
  PassportLocalError,
  PassportLocalInfo,
  PassportLocalUser,
} from '../entity/types';

const router = express.Router();

router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'local',
    (
      err: PassportLocalError,
      user: PassportLocalUser,
      info: PassportLocalInfo
    ) => {
      // console.log({ err, user, info });

      if (err) {
        console.error(err);
        return next(err);
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: info?.message,
        });
      }

      return req.login(user, async (err) => {
        if (err) {
          console.error(err);
          return next(err);
        }

        if (typeof user === 'object' && user !== null) {
          if (user) {
            return res.status(200).json({
              success: true,
              message: 'login success',
              user: { email: user.email, nickname: user.nickname },
            });
          }
        }
      });
    }
  )(req, res, next);
});

router.post('/signup', function (req, res, next) {
  const { email, password, signupType } = req.body;

  const salt = crypto.randomBytes(16);
  crypto.pbkdf2(
    password,
    salt,
    310000,
    32,
    'sha256',
    async function (err, hashedPassword) {
      if (err) {
        return next(err);
      }

      const userRepository = AppDataSource.getRepository(User);
      const isExistedEmail = await userRepository.findOne({
        where: {
          email,
        },
      });

      if (isExistedEmail) {
        return res.status(400).json({
          success: false,
          message: '가입되어있는 이메일 입니다.',
        });
      }

      const saltString = salt.toString('hex');
      const hashedString = hashedPassword.toString('hex');

      const user = new User();
      user.email = email;
      user.password = hashedString;
      user.salt = saltString;
      user.signupType = signupType;

      try {
        const result = await userRepository.save(user);

        if (result) {
          return res.status(201).json({
            success: true,
            message: 'signup success',
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'signup error',
          errorCode: error,
        });
      }
    }
  );
});

export default router;
