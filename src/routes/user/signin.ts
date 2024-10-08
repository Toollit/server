import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import passport from 'passport';
import {
  PassportLocalError,
  PassportLocalInfo,
  PassportLocalUser,
} from '@/types/passport';
import axios from 'axios';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';
import { getParameterStore } from '@/utils/awsParameterStore';

const router = express.Router();

// sign in page. email sign in router
router.post(
  '/email',
  (req: Request, res: CustomResponse, next: NextFunction) => {
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
            message: info ? info.message : null,
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
  }
);

// sign in page. social sign in with google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// sing in page. social sign in with google auth callback
router.get(
  '/auth/google/callback',
  async (req: Request, res: CustomResponse, next: NextFunction) => {
    const ORIGIN_URL = await getParameterStore({ key: 'ORIGIN_URL' }).catch(
      (err) => {
        throw new Error(
          `Error during aws getParameterStore ORIGIN_URL data fetch: ${err}`
        );
      }
    );
    const SUCCESS_REDIRECT = ORIGIN_URL;
    const FAILURE_REDIRECT = `${ORIGIN_URL}/signin?error=true`;
    const DUPLICATE_REDIRECT = `${ORIGIN_URL}/signin?duplicate=true`;
    const EMPTY_REDIRECT = `${ORIGIN_URL}/signin?hasEmailInfo=false`;
    const FIRST_TIME_REDIRECT = `${ORIGIN_URL}/signin?firstTime=true`;

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

          // first time sign in user
          if (info.message === 'firstTime') {
            return res.redirect(FIRST_TIME_REDIRECT);
          }

          // exist user sign in
          if (info.message === null) {
            return res.redirect(SUCCESS_REDIRECT);
          }
        });
      }
    )(req, res, next);
  }
);

// sign in page. social sign in with github
router.get('/github', async (req, res, next) => {
  const GITHUB_CLIENT_ID = await getParameterStore({
    key: 'GITHUB_CLIENT_ID',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore GITHUB_CLIENT_ID data fetch: ${err}`
    );
  });
  const GITHUB_CALLBACK_URL = await getParameterStore({
    key: 'GITHUB_CALLBACK_URL',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore GITHUB_CALLBACK_URL data fetch: ${err}`
    );
  });

  return res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user:email&redirect_uri=${GITHUB_CALLBACK_URL}`
  );
});

// sign in page. social sign in with github auth callback
router.get('/auth/github/callback', async (req, res, next) => {
  const GITHUB_CLIENT_ID = await getParameterStore({
    key: 'GITHUB_CLIENT_ID',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore GITHUB_CLIENT_ID data fetch: ${err}`
    );
  });
  const GITHUB_CLIENT_SECRET = await getParameterStore({
    key: 'GITHUB_CLIENT_SECRET',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore GITHUB_CLIENT_SECRET data fetch: ${err}`
    );
  });
  const ORIGIN_URL = await getParameterStore({ key: 'ORIGIN_URL' }).catch(
    (err) => {
      throw new Error(
        `Error during aws getParameterStore ORIGIN_URL data fetch: ${err}`
      );
    }
  );
  const SUCCESS_REDIRECT = ORIGIN_URL;
  const FAILURE_REDIRECT = `${ORIGIN_URL}/signin?error=true`;
  const DUPLICATE_REDIRECT = `${ORIGIN_URL}/signin?duplicate=true`;
  const EMPTY_REDIRECT = `${ORIGIN_URL}/signin?hasEmailInfo=false`;
  const FIRST_TIME_REDIRECT = `${ORIGIN_URL}/signin?firstTime=true`;

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

      // User who already signed up with github sign in and run sign in logic.
      if (user && user.signupType === 'github') {
        await AppDataSource.createQueryBuilder()
          .update(User)
          .set({ lastSigninAt: new Date(), updatedAt: null })
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
      if (user && user.signupType !== 'github') {
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
            signupType: 'github',
            lastSigninAt: new Date(),
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
