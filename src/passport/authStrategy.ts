import passport from 'passport';
import localStrategy from './localStrategy';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

export default () => {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser<number>(async (id, done) => {
    try {
      const userRepository = AppDataSource.getRepository(User);

      const user = await userRepository.findOne({ where: { id } });
      done(null, user);
    } catch (err) {
      console.error(err);
      done(err);
    }
  });

  localStrategy();
};
