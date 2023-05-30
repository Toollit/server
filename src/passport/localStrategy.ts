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

        if (!user) {
          return cb(null, false, {
            message: '회원가입되어 있지 않은 이메일입니다.',
          });
        }

        if (user.signUpType !== 'email') {
          return cb(null, false, {
            message: '소셜 로그인을 통해 가입이 이루어진 계정입니다.',
          });
        }

        if (user.tempPassword === password) {
          return cb(null, user, {
            message: 'resetPassword',
          });
        }

        if (user.loginFailedCounts >= 5) {
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
              if (user.tempPassword) {
                // Resetting a temporary password if user received a temporary password but logged in with an existing password
                await AppDataSource.createQueryBuilder()
                  .update(User)
                  .set({
                    tempPassword: null,
                    lastLoginAt: new Date(),
                    updatedAt: () => 'updatedAt',
                  })
                  .where('id = :id', { id: user.id })
                  .execute();

                return cb(null, user);
              } else {
                // logged in with the original password
                await AppDataSource.createQueryBuilder()
                  .update(User)
                  .set({ lastLoginAt: new Date() })
                  .where('id = :id', { id: user.id })
                  .execute();

                return cb(null, user);
              }
            } else {
              await AppDataSource.createQueryBuilder()
                .update(User)
                .set({
                  loginFailedCounts: () => 'loginFailedCounts + 1',
                  updatedAt: () => 'updatedAt',
                })
                .where('id = :id', { id: user.id })
                .execute();

              const loginTryUser = await AppDataSource.getRepository(User)
                .createQueryBuilder('user')
                .where('user.id = :id', { id: user.id })
                .getOne();

              const loginFailedCounts = loginTryUser?.loginFailedCounts;

              return cb(null, false, {
                message: `비밀번호가 일치하지 않습니다.\n5회 이상 오류시 서비스 이용이 제한됩니다.\n(누적오류입력 ${loginFailedCounts}회)`,
              });
            }
          }
        );
      } catch (error) {
        cb(error);
      }
    })
  );
