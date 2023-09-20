import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import passport from 'passport';
import {
  PassportLocalError,
  PassportLocalInfo,
  PassportLocalUser,
} from '@/entity/types';
import axios from 'axios';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const successRedirect = process.env.ORIGIN_URL;
const failureRedirect = `${process.env.ORIGIN_URL}/login?error=true`;
const duplicateRedirect = `${process.env.ORIGIN_URL}/login?duplicate=true`;
const emptyRedirect = `${process.env.ORIGIN_URL}/login?hasEmailInfo=false`;
const firstTimeRedirect = `${process.env.ORIGIN_URL}/login?firstTime=true`;

// login page. user login router
router.post('/email', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'local',
    (
      err: PassportLocalError,
      user: PassportLocalUser,
      info: PassportLocalInfo
    ) => {
      if (err) {
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
          return next(err);
        }

        if (user) {
          return res.status(200).json({
            success: true,
            message:
              info?.message === 'resetPassword'
                ? 'resetPassword'
                : 'login success',
          });
        }
      });
    }
  )(req, res, next);
});

// login page. social login with google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// login page. social login with google auth callback
router.get(
  '/auth/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      'google',
      (
        err: any,
        user: User,
        info: {
          success: boolean;
          message: 'empty' | 'duplicate' | 'error' | 'firstTime';
        }
      ) => {
        if (err) {
          return next(err);
        }

        if (info.success) {
          return req.login(user, async (err) => {
            if (err) {
              return next(err);
            }

            if (user) {
              if (info.message === 'firstTime') {
                return res.redirect(firstTimeRedirect);
              }

              return res.redirect(successRedirect);
            }
          });
        } else {
          if (info.message === 'empty') {
            return res.redirect(emptyRedirect);
          }
          if (info.message === 'duplicate') {
            return res.redirect(duplicateRedirect);
          }
          if (info.message === 'error') {
            return res.redirect(failureRedirect);
          }
        }
      }
    )(req, res, next);
  }
);

// login page. social login with github
router.get('/github', (req, res, next) => {
  return res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&redirect_uri=${process.env.GITHUB_CALLBACK_URL}`
  );
});

// login page. social login with github auth callback
router.get('/auth/github/callback', async (req, res, next) => {
  const userCode = req.query.code;

  try {
    const userIdentity = await axios.post(
      `https://github.com/login/oauth/access_token?client_id=${process.env.GITHUB_CLIENT_ID}&client_secret=${process.env.GITHUB_CLIENT_SECRET}&code=${userCode}`
    );

    const userAuthorizeIdentityString = userIdentity.data;

    const userAccessData: {
      access_token: string;
      scope: string;
      token_type: string;
    } = userAuthorizeIdentityString
      .split('&')
      .reduce((acc: { [key: string]: string }, curr: string) => {
        const [key, value] = curr.split('=');
        acc[key] = decodeURIComponent(value); // %2로 오는 값 decodeURIComponent로 변환
        return acc;
      }, {});

    const userInfo = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `${userAccessData.token_type} ${userAccessData.access_token}`,
      },
    });

    const hasEmailInfo = userInfo.data.email;

    // github 계정에 등록된 이메일 정보가 없는경우
    if (!hasEmailInfo) {
      return res.redirect(emptyRedirect);
    }

    // github 계정에 등록된 이메일 정보가 있는 경우
    if (hasEmailInfo) {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: {
          email: userInfo.data.email,
        },
      });

      // 이미 가입한 사용자 로그인
      if (user && user.signUpType === 'github') {
        const isUpdated = await AppDataSource.createQueryBuilder()
          .update(User)
          .set({ lastLoginAt: new Date(), updatedAt: null })
          .where('id = :id', { id: user.id })
          .execute();

        if (isUpdated) {
          return req.login(user, async (err) => {
            if (err) {
              return next(err);
            }

            return res.redirect(successRedirect);
          });
        }
      }

      // 동일한 이메일의 다른 가입 정보가 있는 경우
      if (user && user.signUpType !== 'github') {
        return res.redirect(duplicateRedirect);
      }

      // 중복된 이메일이 없는 경우 DB저장(최초가입)
      if (!user) {
        const atSignIndex = userInfo.data.email.indexOf('@');
        const initialNickname = userInfo.data.email.slice(0, atSignIndex);

        const queryRunner = AppDataSource.createQueryRunner();

        try {
          await queryRunner.connect();
          await queryRunner.startTransaction();

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
              email: userInfo.data.email,
              signUpType: 'github',
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

              return res.redirect(firstTimeRedirect);
            });
          }
        } catch (error) {
          await queryRunner.rollbackTransaction();

          return res.redirect(failureRedirect);
        } finally {
          return await queryRunner.release();
        }
      }
    }
  } catch (error) {
    return res.redirect(failureRedirect);
  }
});

export default router;
