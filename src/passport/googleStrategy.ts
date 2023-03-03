import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

export default () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env['GOOGLE_CLIENT_ID'],
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
        callbackURL: process.env['GOOGLE_CALLBACK_URL'],
        passReqToCallback: true,
        scope: ['profile', 'email'],
      },
      async function (request, accessToken, refreshToken, profile, done) {
        // console.log('user profile ===>', profile);

        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(
            new Error('Google profile does not contain an email address.'),
            undefined,
            {
              success: false,
              message:
                '로그인한 계정에 이메일 정보가 없습니다. 이메일 정보를 등록해주세요.',
            }
          );
        }

        const userRepository = AppDataSource.getRepository(User);

        let user;

        try {
          user = await userRepository.findOne({ where: { email } });
        } catch (error) {
          return done(new Error('User information lookup error'));
        }

        // 이미 가입한 사용자 로그인
        if (user && user.signupType === 'google') {
          return done(null, user);
        }

        // 동일한 이메일의 다른 가입 정보가 있는 경우
        if (user && user.signupType === 'github') {
          return done(null, user, {
            success: false,
            message: 'duplicate',
            redirectUrl: `${process.env.ORIGIN_URL}/login?duplicate=true`,
          });
        }

        // 중복된 이메일이 없는 경우 DB저장(최초가입)
        if (!user) {
          const newUser = new User();
          newUser.email = email;
          newUser.signupType = 'google';

          let isSaved;

          try {
            isSaved = await userRepository.save(newUser);
          } catch (error) {
            return done(new Error('Error saving user information'));
          }

          if (isSaved) {
            return done(null, newUser);
          }
        }
      }
    )
  );
};
