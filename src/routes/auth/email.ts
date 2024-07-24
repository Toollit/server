import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/entity/User';
import {
  CLIENT_ERROR_EXIST_EMAIL,
  CLIENT_ERROR_MISMATCH_AUTH_CODE,
  CLIENT_ERROR_EXPIRE_AUTH_TIME,
} from '@/message/error';
import { getParameterStore } from '@/utils/awsParameterStore';
import { redisClient } from '@/utils/redisClient';

const router = express.Router();

interface EmailAuthCodeReqBody {
  email: string;
}

// Issue authentication code upon email sign up
router.post(
  '/auth-code',
  async (
    req: Request<{}, {}, EmailAuthCodeReqBody>,
    res: CustomResponse,
    next: NextFunction
  ) => {
    const ORIGIN_URL = await getParameterStore({ key: 'ORIGIN_URL' });
    const AWS_S3_TOOLLIT_LOGO_IMAGE_URL = await getParameterStore({
      key: 'AWS_S3_TOOLLIT_LOGO_IMAGE_URL',
    });
    const HIWORKS_EMAIL_USER = await getParameterStore({
      key: 'HIWORKS_EMAIL_USER',
    });
    const HIWORKS_EMAIL_PASS = await getParameterStore({
      key: 'HIWORKS_EMAIL_PASS',
    });
    const REDIS_CLOUD = await getParameterStore({ key: 'REDIS_CLOUD' });

    const userEmail = req.body.email;

    const userRepository = AppDataSource.getRepository(User);

    try {
      const isRegisteredEmail = await userRepository.findOne({
        where: {
          email: userEmail,
        },
      });

      if (isRegisteredEmail) {
        return res.status(409).json({
          success: false,
          message: CLIENT_ERROR_EXIST_EMAIL,
        });
      }
    } catch (err) {
      return next(err);
    }

    const authCode = Math.random().toString().slice(2, 8);

    let emailTemplate;

    const appDir = path
      .resolve(__dirname)
      .replace('routes/auth', '/template/authMail.ejs');

    ejs.renderFile(
      appDir,
      {
        authCode,
        toollitLogo: AWS_S3_TOOLLIT_LOGO_IMAGE_URL,
        toollitURL: ORIGIN_URL,
      },
      function (err, data) {
        if (err) {
          return next(err);
        }
        emailTemplate = data;
      }
    );

    const transporter = nodemailer.createTransport({
      service: 'hiworks',
      host: 'smtps.hiworks.com',
      port: 465,
      secure: true,
      auth: {
        user: HIWORKS_EMAIL_USER,
        pass: HIWORKS_EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: 'Toollit <no-reply@toollit.com>',
      to: userEmail,
      subject: 'Toollit 회원가입을 위한 인증번호를 입력해주세요.',
      html: emailTemplate,
    };

    transporter.sendMail(mailOptions, async function (err, info) {
      if (err) {
        transporter.close();
        return next(err);
      }
      console.log(
        `[${info.accepted}] - finish sending email : ` + info.response
      );

      try {
        // save authCode to redis. redis cache expires in 5 minutes
        const redis = await redisClient;
        await redis.v4.set(userEmail, authCode, { EX: 60 * 5 });

        return res.status(200).json({
          success: true,
          message: null,
        });
      } catch (err) {
        return next(err);
      } finally {
        return transporter.close();
      }
    });
  }
);

interface VerifyAuthCodeReqBody {
  email: string;
  authCode: string;
}

// Check auth code sent to verify email when sign up.
router.post(
  '/verify',
  async (
    req: Request<{}, {}, VerifyAuthCodeReqBody>,
    res: CustomResponse,
    next: NextFunction
  ) => {
    const { email, authCode } = req.body;

    try {
      const redis = await redisClient;
      const redisAuthCode = await redis.v4.get(email);

      if (redisAuthCode === null) {
        return res.status(401).json({
          success: false,
          message: CLIENT_ERROR_EXPIRE_AUTH_TIME,
        });
      }

      if (authCode === redisAuthCode) {
        return res.status(200).json({
          success: true,
          message: null,
        });
      }

      if (authCode !== redisAuthCode) {
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_MISMATCH_AUTH_CODE,
        });
      }
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
