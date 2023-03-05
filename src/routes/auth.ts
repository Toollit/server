import express, { Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';

const router = express.Router();

router.post('/email', async (req: Request, res: Response) => {
  let authNums = Math.random().toString().slice(2, 8);
  let emailTemplate;

  let appDir = path
    .resolve(__dirname)
    .replace('routes', '/template/authMail.ejs');

  ejs.renderFile(appDir, { authCode: authNums }, function (err, data) {
    if (err) {
      console.log(err);
    }
    emailTemplate = data;
  });

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

  let userMail = req.body.email;

  let mailOptions = {
    from: `Getit <${process.env.NODEMAILER_USER}>`,
    to: userMail,
    subject: 'Getit 회원가입을 위한 인증번호를 입력해주세요.',
    html: emailTemplate,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log('send mail error');
    }
    console.log('finish sending email : ' + info.response);
    res.status(200).json({
      success: true,
      message: 'sending email success',
      authNums,
    });
    transporter.close();
  });
});

export default router;
