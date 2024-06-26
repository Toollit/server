import passport from 'passport';
import passportLocal from 'passport-local';
import crypto from 'crypto';
import { AppDataSource } from '@/config/data-source';
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

        // Not exist user
        if (!user) {
          return cb(null, false, {
            message: CLIENT_ERROR_MISMATCH_EMAIL_PASSWORD,
          });
        }

        // User who has signed up by social login
        if (user.signupType !== 'email') {
          return cb(null, false, {
            message: CLIENT_ERROR_EXIST_SIGNUP_SOCIAL_LOGIN,
          });
        }

        // User logged in with temporary password
        if (user.tempPassword === password) {
          return cb(null, user, {
            message: 'resetPassword',
          });
        }

        // Do not count login failures for resume testing accounts
        if (email !== 'test@toollit.com') {
          // User who failed 5 or more login attempts
          if (user.signinFailedCount >= 5) {
            return cb(null, false, {
              message: CLIENT_ERROR_LOGIN_LIMIT,
            });
          }
        }

        // Perform the login logic below if email, password is correct
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

            try {
              if (isPasswordMatch) {
                // Resetting a temporary password if user received a temporary password but logged in with an existing password
                if (user.tempPassword) {
                  await AppDataSource.createQueryBuilder()
                    .update(User)
                    .set({
                      signinFailedCount: 0,
                      tempPassword: null,
                      lastSigninAt: new Date(),
                      updatedAt: () => 'updatedAt',
                    })
                    .where('id = :id', { id: user.id })
                    .execute();

                  return cb(null, user);
                }

                // Logged in with the original password
                if (!user.tempPassword) {
                  await AppDataSource.createQueryBuilder()
                    .update(User)
                    .set({
                      signinFailedCount: 0,
                      lastSigninAt: new Date(),
                      updatedAt: () => 'updatedAt',
                    })
                    .where('id = :id', { id: user.id })
                    .execute();

                  return cb(null, user);
                }
              }

              if (!isPasswordMatch) {
                await AppDataSource.createQueryBuilder()
                  .update(User)
                  .set({
                    signinFailedCount: () => 'signinFailedCount + 1',
                    updatedAt: () => 'updatedAt',
                  })
                  .where('id = :id', { id: user.id })
                  .execute();

                const loginTryUser = await AppDataSource.getRepository(User)
                  .createQueryBuilder('user')
                  .where('user.id = :id', { id: user.id })
                  .getOne();

                const signinFailedCount = loginTryUser?.signinFailedCount;

                return cb(null, false, {
                  message: CLIENT_ERROR_LOGIN_FAILED_COUNT.replace(
                    '{signinFailedCount}',
                    String(signinFailedCount)
                  ),
                });
              }
            } catch (err) {
              return cb(err);
            }
          }
        );
      } catch (err) {
        return cb(err);
      }
    })
  );
