import passport from 'passport';
import passportLocal from 'passport-local';
import crypto from 'crypto';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';

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
            message: '회원 이메일 또는 비밀번호가 일치하지 않습니다.',
          });
        }

        // social login user
        if (user.signUpType !== 'email') {
          return cb(null, false, {
            message: '소셜 로그인을 통해 가입이 이루어진 계정입니다.',
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
            message: `비밀번호 5회 연속 오류로 서비스 이용이 불가합니다.\n(*고객센터 - 공지사항 - 비밀번호 5회 연속 오류 공지 확인)`,
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
                  message: `비밀번호가 일치하지 않습니다.\n5회 이상 오류시 서비스 이용이 제한됩니다.\n(누적오류입력 ${loginFailedCount}회)`,
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
