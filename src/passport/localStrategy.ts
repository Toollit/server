import passport from 'passport';
import passportLocal from 'passport-local';
import crypto from 'crypto';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';
import {
  CLIENT_ERROR_EXIST_SIGNUP_SOCIAL_LOGIN,
  CLIENT_ERROR_MISMATCH_EMAIL_PASSWORD,
  CLIENT_ERROR_LOGIN_FAILED_COUNT,
  CLIENT_ERROR_LOGIN_LIMIT,
} from '@/message/error';

const LocalStrategy = passportLocal.Strategy;

const config = { usernameField: 'email', passwordField: 'password' };

export default () =>
  passport.use(
    new LocalStrategy(config, async function verify(email, password, cb) {
      const userRepository = AppDataSource.getRepository(User);

      try {
        const user = await userRepository.findOne({
          where: { email },
        });

        // not exist user
        if (!user) {
          return cb(null, false, {
            message: CLIENT_ERROR_MISMATCH_EMAIL_PASSWORD,
          });
        }

        // social login user
        if (user.signUpType !== 'email') {
          return cb(null, false, {
            message: CLIENT_ERROR_EXIST_SIGNUP_SOCIAL_LOGIN,
          });
        }

        // tempPassword login user
        if (user.tempPassword === password) {
          return cb(null, user, {
            message: 'resetPassword',
          });
        }

        // login failed more than 5 user
        if (user.loginFailedCount >= 5) {
          return cb(null, false, {
            message: CLIENT_ERROR_LOGIN_LIMIT,
          });
        }

        const salt = Buffer.from(user.salt, 'hex');

        crypto.pbkdf2(
          password,
          salt,
          310000,
          64,
          'sha512',
          async function (err, hashedPassword) {
            if (err) {
              return cb(err);
            }

            const userPassword = Buffer.from(user.password, 'hex');

            const isPasswordMatch = crypto.timingSafeEqual(
              userPassword,
              hashedPassword
            );

            if (isPasswordMatch) {
              // Resetting a temporary password if user received a temporary password but logged in with an existing password
              if (user.tempPassword) {
                try {
                  await AppDataSource.createQueryBuilder()
                    .update(User)
                    .set({
                      loginFailedCount: 0,
                      tempPassword: null,
                      lastLoginAt: new Date(),
                      updatedAt: () => 'updatedAt',
                    })
                    .where('id = :id', { id: user.id })
                    .execute();

                  return cb(null, user);
                } catch (error) {
                  return cb(error);
                }
              }

              // Logged in with the original password
              if (!user.tempPassword) {
                try {
                  await AppDataSource.createQueryBuilder()
                    .update(User)
                    .set({
                      loginFailedCount: 0,
                      lastLoginAt: new Date(),
                      updatedAt: () => 'updatedAt',
                    })
                    .where('id = :id', { id: user.id })
                    .execute();

                  return cb(null, user);
                } catch (error) {
                  return cb(error);
                }
              }
            }

            if (!isPasswordMatch) {
              try {
                await AppDataSource.createQueryBuilder()
                  .update(User)
                  .set({
                    loginFailedCount: () => 'loginFailedCount + 1',
                    updatedAt: () => 'updatedAt',
                  })
                  .where('id = :id', { id: user.id })
                  .execute();

                const loginTryUser = await AppDataSource.getRepository(User)
                  .createQueryBuilder('user')
                  .where('user.id = :id', { id: user.id })
                  .getOne();

                const loginFailedCount = loginTryUser?.loginFailedCount;

                return cb(null, false, {
                  message: CLIENT_ERROR_LOGIN_FAILED_COUNT.replace(
                    '{loginFailedCount}',
                    String(loginFailedCount)
                  ),
                });
              } catch (error) {
                return cb(error);
              }
            }
          }
        );
      } catch (error) {
        return cb(error);
      }
    })
  );
