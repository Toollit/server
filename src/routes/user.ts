import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';
import crypto from 'crypto';
import passport from 'passport';
import {
  PassportLocalError,
  PassportLocalInfo,
  PassportLocalUser,
} from '../entity/types';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import nodemailer from 'nodemailer';
import ejs from 'ejs';

const router = express.Router();

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  if (req.user) {
    const { email, nickname } = req.user;

    res.status(200).json({
      success: true,
      message: null,
      data: {
        email,
        nickname,
      },
    });
  } else {
    res.status(400).json({ success: false, message: 'Not logged in' });
  }
});

router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'local',
    (
      err: PassportLocalError,
      user: PassportLocalUser,
      info: PassportLocalInfo
    ) => {
      // console.log({ err, user, info });

      if (err) {
        console.error(err);
        return next(err);
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: info?.message,
        });
      }

      return req.login(user, async (err) => {
        if (err) {
          console.error(err);
          return next(err);
        }

        if (typeof user === 'object' && user !== null) {
          if (user) {
            const { email, nickname } = user;

            return res.status(200).json({
              success: true,
              message: 'login success',
              data: { email, nickname },
            });
          }
        }
      });
    }
  )(req, res, next);
});

router.post('/logout', function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }

    return res.status(302).redirect('/');
  });
});

router.post('/signup', function (req, res, next) {
  const { email, password, signupType } = req.body;

  const salt = crypto.randomBytes(16);
  crypto.pbkdf2(
    password,
    salt,
    310000,
    32,
    'sha256',
    async function (err, hashedPassword) {
      if (err) {
        return next(err);
      }

      const userRepository = AppDataSource.getRepository(User);
      const isExistedEmail = await userRepository.findOne({
        where: {
          email,
        },
      });

      if (isExistedEmail) {
        return res.status(400).json({
          success: false,
          message: '가입되어있는 이메일 입니다.',
        });
      }

      const saltString = salt.toString('hex');
      const hashedString = hashedPassword.toString('hex');

      const user = new User();
      user.email = email;
      user.password = hashedString;
      user.salt = saltString;
      user.signupType = signupType;

      try {
        const result = await userRepository.save(user);

        if (result) {
          return res.status(201).json({
            success: true,
            message: 'signup success',
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'signup error',
          errorCode: error,
        });
      }
    }
  );
});

router.get(
  '/login/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate(
    'google',
    {
      successRedirect: process.env.ORIGIN_URL,
      failureRedirect: `${process.env.ORIGIN_URL}/login`,
    },
    (err, user, info) => {
      if (info.message === 'duplicate') {
        return res.redirect(info.redirectUrl);
      }
    }
  )(req, res, next);
});

// 임시 중단
// router.get('/login/github', passport.authenticate('github'));

router.get('/auth/github/callback', async (req, res, next) => {
  const userCode = req.query.code;

  const userIdentity = await axios.post(
    `https://github.com/login/oauth/access_token?client_id=${process.env.GITHUB_CLIENT_ID}&client_secret=${process.env.GITHUB_CLIENT_SECRET}&code=${userCode}`
  );

  const userAuthorizeIdentityString = userIdentity.data;

  const userAccessData: {
    access_token: string;
    scope: string;
    token_type: string;
  } = userAuthorizeIdentityString
    .split('&')
    .reduce((acc: { [key: string]: string }, curr: string) => {
      const [key, value] = curr.split('=');
      acc[key] = decodeURIComponent(value); // %2로 오는 값 decodeURIComponent로 변환
      return acc;
    }, {});

  const userInfo = await axios.get('https://api.github.com/user', {
    headers: {
      Authorization: `${userAccessData.token_type} ${userAccessData.access_token}`,
    },
  });

  const hasEmailInfo = userInfo.data.email;

  // github 계정에 등록된 이메일 정보가 없는경우
  if (!hasEmailInfo) {
    return res.redirect(`${process.env.ORIGIN_URL}/login?hasEmailInfo=false`);
  }

  // github 계정에 등록된 이메일 정보가 있는 경우
  if (hasEmailInfo) {
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: {
        email: userInfo.data.email,
      },
    });

    // 이미 가입한 사용자 로그인
    if (user && user.signupType === 'github') {
      return req.login(user, async (err) => {
        if (err) {
          console.error(err);
          return next(err);
        }

        return res.redirect(`${process.env.ORIGIN_URL}`);
      });
    }

    // 동일한 이메일의 다른 가입 정보가 있는 경우
    if (user && user.signupType !== 'github') {
      return res.redirect(`${process.env.ORIGIN_URL}/login?duplicate=true`);
    }

    // 중복된 이메일이 없는 경우 DB저장(최초가입)
    if (!user) {
      const user = new User();
      user.email = userInfo.data.email;
      user.signupType = 'github';

      try {
        const userData = await userRepository.save(user);

        if (userData) {
          return req.login(user, async (err) => {
            if (err) {
              console.error(err);
              return next(err);
            }

            return res.redirect(`${process.env.ORIGIN_URL}`);
          });
        }
      } catch (error) {
        return res.redirect(`${process.env.ORIGIN_URL}/login?error=true`);
      }
    }
  }
});

router.post('/pwInquiry', async (req, res, next) => {
  const email = req.body.email;

  const userRepository = AppDataSource.getRepository(User);

  try {
    const user = await userRepository.findOne({
      where: {
        email,
      },
    });

    if (user) {
      const temPassword = uuidv4().slice(0, 8);
      user.tempPassword = temPassword;

      const isSave = await userRepository.save(user);

      if (!isSave) {
        return res.status(500).json({
          success: false,
          message: '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        });
      }

      const appDir = path
        .resolve(__dirname)
        .replace('routes', '/template/tempPasswordMail.ejs');

      let emailTemplate;
      ejs.renderFile(
        appDir,
        { temPasswordCode: temPassword },
        function (err, data) {
          if (err) {
            console.log(err);
          }
          emailTemplate = data;
        }
      );

      let transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.NODEMAILER_USER,
          pass: process.env.NODEMAILER_PASS,
        },
      });

      let mailOptions = {
        from: `Getit <${process.env.NODEMAILER_USER}>`,
        to: email,
        subject: 'Getit 로그인을위한 임시 비밀번호입니다.',
        html: emailTemplate,
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log('send mail error');
        }
        console.log('finish sending email : ' + info.response);
        res.status(201).json({
          success: true,
          message: '해당 이메일로 임시 비밀번호를 발급했습니다.',
          temPassword,
        });
        transporter.close();
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '가입된 이메일 정보가 존재하지 않습니다.',
      });
    }
  } catch (error) {
    console.error(error);

    return next(error);
  }
});

export default router;
