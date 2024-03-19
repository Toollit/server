import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/entity/User';
import { Profile } from '@/entity/Profile';
import { getParameterStore } from '@/utils/awsParamterStore';

export default async () => {
  const GOOGLE_CLIENT_ID = await getParameterStore({ key: 'GOOGLE_CLIENT_ID' });
  const GOOGLE_CLIENT_SECRET = await getParameterStore({
    key: 'GOOGLE_CLIENT_SECRET',
  });
  const GOOGLE_CALLBACK_URL = await getParameterStore({
    key: 'GOOGLE_CALLBACK_URL',
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        passReqToCallback: true,
        scope: ['profile', 'email'],
      },
      async function (request, accessToken, refreshToken, profile, done) {
        const email = profile.emails?.[0]?.value;

        // Profile does not have email info.
        if (!email) {
          return done(null, undefined, { message: 'empty' });
        }

        const queryRunner = AppDataSource.createQueryRunner();

        const userRepository = AppDataSource.getRepository(User);

        try {
          const user = await userRepository.findOne({ where: { email } });

          // User who already signed up with google login and run login logic.
          if (user && user.signUpType === 'google') {
            const isUpdated = await AppDataSource.createQueryBuilder()
              .update(User)
              .set({ lastLoginAt: new Date(), updatedAt: null })
              .where('id = :id', { id: user.id })
              .execute();

            if (isUpdated) {
              return done(null, user, { message: null });
            }
          }

          // There is different registration information for the same email address.
          if (user && user.signUpType !== 'google') {
            return done(null, undefined, { message: 'duplicate' });
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
                email,
                signUpType: 'google',
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
            return done(null, user, { message: 'firstTime' });
          }
        } catch (err) {
          await queryRunner.rollbackTransaction();
          return done(null, undefined, { message: 'error' });
        } finally {
          await queryRunner.release();
        }
      }
    )
  );
};
