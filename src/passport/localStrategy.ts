import passport from 'passport';
import passportLocal from 'passport-local';
import crypto from 'crypto';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

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

        if (user.signupType !== 'email') {
          return cb(null, false, {
            message: '소셜 로그인을 통해 가입이 이루어진 계정입니다.',
          });
        }

        if (user.tempPassword === password) {
          return cb(null, user, {
            message: 'resetPassword',
          });
        }

        const salt = Buffer.from(user.salt, 'hex');

        crypto.pbkdf2(
          password,
          salt,
          310000,
          32,
          'sha256',
          async function (err, hashedPassword) {
            if (err) {
              return cb(err);
            }

            const userPassword = Buffer.from(user.password, 'hex');

            if (!crypto.timingSafeEqual(userPassword, hashedPassword)) {
              return cb(null, false, {
                message: '비밀번호가 일치하지 않습니다.',
              });
            } else {
              // 임시비밀번호를 받았지만 기존 비밀번호로 정상적으로 로그인한 경우 발급받은 임시비밀번호 초기화
              if (user.tempPassword) {
                user.tempPassword = null;
                const isSaved = await userRepository.save(user);
                if (isSaved) {
                  return cb(null, user);
                }
              } else {
                return cb(null, user);
              }
            }
          }
        );
      } catch (error) {
        console.error(error);
        cb(error);
      }
    })
  );
