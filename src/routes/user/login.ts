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

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

const router = express.Router();

const SUCCESS_REDIRECT = process.env.ORIGIN_URL;
const FAILURE_REDIRECT = `${process.env.ORIGIN_URL}/login?error=true`;
const DUPLICATE_REDIRECT = `${process.env.ORIGIN_URL}/login?duplicate=true`;
const EMPTY_REDIRECT = `${process.env.ORIGIN_URL}/login?hasEmailInfo=false`;
const FIRST_TIME_REDIRECT = `${process.env.ORIGIN_URL}/login?firstTime=true`;

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Login page. email login router
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
            message: null,
            data: {
              nickname: user.nickname,
              needResetPassword:
                info?.message === 'resetPassword' ? true : false,
            },
          });
        }
      });
    }
  )(req, res, next);
});

// Login page. social login with google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Login page. social login with google auth callback
router.get(
  '/auth/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      'google',
      (
        err: any,
        user: User,
        info: {
          message: 'empty' | 'duplicate' | 'error' | 'firstTime' | null;
        }
      ) => {
        if (err) {
          return next(err);
        }

        if (!user) {
          if (info.message === 'empty') {
            return res.redirect(EMPTY_REDIRECT);
          }
          if (info.message === 'duplicate') {
            return res.redirect(DUPLICATE_REDIRECT);
          }
          if (info.message === 'error') {
            return res.redirect(FAILURE_REDIRECT);
          }
        }

        return req.login(user, async (err) => {
          if (err) {
            return next(err);
          }

          // first time login user
          if (info.message === 'firstTime') {
            return res.redirect(FIRST_TIME_REDIRECT);
          }

          // exist user login
          if (info.message === null) {
            return res.redirect(SUCCESS_REDIRECT);
          }
        });
      }
    )(req, res, next);
  }
);

// Login page. social login with github
router.get('/github', (req, res, next) => {
  return res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user:email&redirect_uri=${GITHUB_CALLBACK_URL}`
  );
});

// Login page. social login with github auth callback
router.get('/auth/github/callback', async (req, res, next) => {
  const userCode = req.query.code;

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    const userIdentity = await axios.post(
      `https://github.com/login/oauth/access_token?client_id=${GITHUB_CLIENT_ID}&client_secret=${GITHUB_CLIENT_SECRET}&code=${userCode}`
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

    const email = userInfo.data.email;

    // No email information in the github account
    if (!email) {
      return res.redirect(EMPTY_REDIRECT);
    }

    // Email information in the github account
    if (email) {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      // User who already signed up with github login and run login logic.
      if (user && user.signUpType === 'github') {
        await AppDataSource.createQueryBuilder()
          .update(User)
          .set({ lastLoginAt: new Date(), updatedAt: null })
          .where('id = :id', { id: user.id })
          .execute();

        return req.login(user, async (err) => {
          if (err) {
            return next(err);
          }

          return res.redirect(SUCCESS_REDIRECT);
        });
      }

      // There is different registration information for the same email address.
      if (user && user.signUpType !== 'github') {
        return res.redirect(DUPLICATE_REDIRECT);
      }

      // Sign up logic. There are no duplicate emails. first time sign up.
      if (!user) {
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
            lastLoginAt: new Date(),
            profile: newProfile.identifiers[0].id,
          })
          .execute();

        const user = await queryRunner.manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: newUser.identifiers[0].id })
          .getOne();

        if (!user) {
          throw new Error('New user information is not queried');
        }

        await queryRunner.commitTransaction();

        return req.login(user, async (err) => {
          if (err) {
            return next(err);
          }

          return res.redirect(FIRST_TIME_REDIRECT);
        });
      }
    }
  } catch (err) {
    await queryRunner.rollbackTransaction();
    return res.redirect(FAILURE_REDIRECT);
  } finally {
    await queryRunner.release();
  }
});

export default router;
