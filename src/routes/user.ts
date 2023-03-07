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
      if (err) {
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
          return next(err);
        }

        if (user) {
          return res.status(200).json({
            success: true,
            message:
              info?.message === 'resetPassword'
                ? 'resetPassword'
                : 'login success',
          });
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

    return res.json({
      success: true,
      message: 'logout success',
    });
  });
});

router.post('/signup', async (req, res, next) => {
  const { email, password, signupType } = req.body;

  const userRepository = AppDataSource.getRepository(User);

  try {
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
  } catch (error) {
    return next(error);
  }

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
        return next(error);
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

router.get(
  '/auth/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      'google',
      (
        err: any,
        user: User,
        info: { success: boolean; message: 'empty' | 'duplicate' | 'error' }
      ) => {
        const successRedirect = process.env.ORIGIN_URL;
        const failureRedirect = `${process.env.ORIGIN_URL}/login?error=true`;
        const duplicateRedirect = `${process.env.ORIGIN_URL}/login?duplicate=true`;
        const emptyRedirect = `${process.env.ORIGIN_URL}/login?hasEmailInfo=false`;

        if (err) {
          return next(err);
        }

        if (info.success) {
          return req.login(user, async (err) => {
            if (err) {
              return next(err);
            }

            if (user) {
              return res.redirect(successRedirect);
            }
          });
        } else {
          if (info.message === 'empty') {
            return res.redirect(emptyRedirect);
          }
          if (info.message === 'duplicate') {
            return res.redirect(duplicateRedirect);
          }
          if (info.message === 'error') {
            return res.redirect(failureRedirect);
          }
        }
      }
    )(req, res, next);
  }
);

router.get('/login/github', (req, res, next) => {
  res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&redirect_uri=${process.env.GITHUB_CALLBACK_URL}`
  );
});

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
      const tempPassword = uuidv4().slice(0, 8);

      const isUpdated = await AppDataSource.createQueryBuilder()
        .update(User)
        .set({ tempPassword })
        .where('id = :id', { id: user.id })
        .execute();

      if (isUpdated) {
        const appDir = path
          .resolve(__dirname)
          .replace('routes', '/template/tempPasswordMail.ejs');

        let emailTemplate;
        ejs.renderFile(
          appDir,
          { tempPasswordCode: tempPassword },
          function (err, data) {
            if (err) {
              return next(err);
            }
            emailTemplate = data;
          }
        );

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.NODEMAILER_USER,
            pass: process.env.NODEMAILER_PASS,
          },
        });

        const mailOptions = {
          from: `Getit <${process.env.NODEMAILER_USER}>`,
          to: email,
          subject: 'Getit 로그인을위한 임시 비밀번호입니다.',
          html: emailTemplate,
        };

        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            // console.log('send mail error');
            return next(error);
          }
          console.log('finish sending email : ' + info.response);
          res.status(201).json({
            success: true,
            message: '해당 이메일로 임시 비밀번호를 발급했습니다.',
            tempPassword,
          });
          return transporter.close();
        });
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '가입된 이메일 정보가 존재하지 않습니다.',
      });
    }
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/resetpassword',
  (req: Request, res: Response, next: NextFunction) => {
    const userInfo = req.user;
    const newPassword = req.body.password;

    if (userInfo?.tempPassword) {
      userInfo;
      const salt = Buffer.from(userInfo.salt, 'hex');

      crypto.pbkdf2(
        newPassword,
        salt,
        310000,
        32,
        'sha256',
        async function (err, hashedPassword) {
          if (err) {
            return next(err);
          }

          const userPassword = Buffer.from(userInfo.password, 'hex');

          if (crypto.timingSafeEqual(userPassword, hashedPassword)) {
            res.status(400).json({
              success: false,
              message: '이전과 동일한 비밀번호는 다시 사용할 수 없습니다.',
            });
          } else {
            const newSalt = crypto.randomBytes(16);

            crypto.pbkdf2(
              newPassword,
              newSalt,
              310000,
              32,
              'sha256',
              async function (err, hashedPassword) {
                if (err) {
                  return next(err);
                }

                const saltString = newSalt.toString('hex');
                const hashedString = hashedPassword.toString('hex');

                try {
                  const isUpdated = await AppDataSource.createQueryBuilder()
                    .update(User)
                    .set({
                      salt: saltString,
                      password: hashedString,
                      tempPassword: null,
                    })
                    .where('id = :id', { id: userInfo.id })
                    .execute();

                  if (isUpdated) {
                    return res.status(201).json({
                      success: true,
                      message:
                        '비밀번호 변경이 완료되었습니다. 새로운 비밀번호로 다시 로그인해주세요.',
                    });
                  }
                } catch (error) {
                  return next(error);
                }
              }
            );
          }
        }
      );
    } else {
      // 임시 비밀번호로 로그인하지 않고 잘못된 접근으로 비밀번호 재설정을 하려는 경우
      return res.status(400).json({
        success: false,
        message: '잘못된 접근 입니다.',
      });
    }
  }
);

export default router;
