import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';

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

        // 이메일 정보가 없는 경우
        if (!email) {
          return done(null, undefined, { success: false, message: 'empty' });
        }

        const userRepository = AppDataSource.getRepository(User);

        try {
          const user = await userRepository.findOne({ where: { email } });

          // 이미 가입한 사용자 로그인
          if (user && user.signUpType === 'google') {
            const isUpdated = await AppDataSource.createQueryBuilder()
              .update(User)
              .set({ lastLoginAt: new Date(), updatedAt: null })
              .where('id = :id', { id: user.id })
              .execute();

            if (isUpdated) {
              return done(null, user, { success: true });
            }
          }

          // 동일한 이메일의 다른 가입 정보가 있는 경우
          if (user && user.signUpType !== 'google') {
            return done(null, user, { success: false, message: 'duplicate' });
          }

          // 중복된 이메일이 없는 경우 DB저장(최초가입)
          if (!user) {
            const atSignIndex = email.indexOf('@');
            const initialNickname = email.slice(0, atSignIndex);

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
                  email,
                  signUpType: 'google',
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
                return done(null, user, {
                  success: true,
                  message: 'firstTime',
                });
              }
            } catch (error) {
              await queryRunner.rollbackTransaction();

              return done(null, undefined, {
                success: false,
                message: 'error',
              });
            } finally {
              return await queryRunner.release();
            }
          }
        } catch (error) {
          return done(null, undefined, { success: false, message: 'error' });
        }
      }
    )
  );
};
