import express, { Request, NextFunction } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import { v4 as uuidV4 } from 'uuid';
import path from 'path';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import { User } from '@/entity/User';
import {
  CLIENT_ERROR_EXIST_SIGNUP_SOCIAL_LOGIN,
  CLIENT_ERROR_NOT_EXIST_EMAIL,
} from '@/message/error';
import { getParameterStore } from '@/utils/awsParameterStore';

const router = express.Router();

// Password inquiry page find password and issuance of temporary password router
router.post(
  '/',
  async (req: Request, res: CustomResponse, next: NextFunction) => {
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

    const email = req.body.email;

    const userRepository = AppDataSource.getRepository(User);

    try {
      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: CLIENT_ERROR_NOT_EXIST_EMAIL,
        });
      }

      if (user.signupType !== 'email') {
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_EXIST_SIGNUP_SOCIAL_LOGIN,
        });
      }

      const tempPassword = uuidV4().slice(0, 8);

      await AppDataSource.createQueryBuilder()
        .update(User)
        .set({ tempPassword })
        .where('id = :id', { id: user.id })
        .execute();

      const appDir = path
        .resolve(__dirname)
        .replace('routes/user', '/template/tempPasswordMail.ejs');

      let emailTemplate;
      ejs.renderFile(
        appDir,
        {
          tempPasswordCode: tempPassword,
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
        to: email,
        subject: 'Toollit 로그인을위한 임시 비밀번호입니다.',
        html: emailTemplate,
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          transporter.close();
          return next(error);
        }
        console.log(
          `[${info.accepted}] - finish sending email : ` + info.response
        );

        transporter.close();

        return res.status(201).json({
          success: true,
          message: null,
        });
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
