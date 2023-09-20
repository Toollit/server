import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import { User } from '@/entity/User';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// pwInquiry page find password and issuance of temporary password router
router.post('/', async (req, res, next) => {
  const email = req.body.email;

  const userRepository = AppDataSource.getRepository(User);

  try {
    const user = await userRepository.findOne({
      where: {
        email,
      },
    });

    if (user) {
      if (user.signUpType !== 'email') {
        return res.status(400).json({
          success: false,
          message: '소셜 로그인으로 가입한 사용자입니다.',
        });
      }

      const tempPassword = uuidv4().slice(0, 8);

      const isUpdated = await AppDataSource.createQueryBuilder()
        .update(User)
        .set({ tempPassword })
        .where('id = :id', { id: user.id })
        .execute();

      if (isUpdated) {
        const appDir = path
          .resolve(__dirname)
          .replace('routes/user', '/template/tempPasswordMail.ejs');

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
            transporter.close();
            return next(error);
          }
          console.log('finish sending email : ' + info.response);

          transporter.close();

          return res.status(201).json({
            success: true,
            message: '해당 이메일로 임시 비밀번호를 발급했습니다.',
            tempPassword,
          });
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

export default router;
