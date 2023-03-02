import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

export default () => {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env['GITHUB_CLIENT_ID'] as string,
        clientSecret: process.env['GITHUB_CLIENT_SECRET'] as string,
        callbackURL: process.env['GITHUB_CALLBACK_URL'] as string,
        passReqToCallback: true,
        scope: ['user:email'],
      },
      async function (
        accessToken: any,
        refreshToken: any,
        profile: any,
        cb: any
      ) {
        // 라이브러리 scope 문제로 인해 아래방식 적용
        // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#scopes-for-oauth-applications
        // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/identifying-and-authorizing-users-for-github-apps
        console.log('github profile ===> ', profile);
        console.log('query ===>', accessToken.query.code);

        const code = accessToken.query.code;

        // return cb(null, );
      }
    )
  );
};
