import express, { Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';

const router = express.Router();

router.post('/mail', async (req: Request, res: Response) => {
  let authNum = Math.random().toString().slice(2, 8);
  let emailTemplete;

  let appDir = path
    .resolve(__dirname)
    .replace('routes', '/template/authMail.ejs');

  ejs.renderFile(appDir, { authCode: authNum }, function (err, data) {
    if (err) {
      console.log(err);
    }
    emailTemplete = data;
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

  let userMail = req.body.mail;

  let mailOptions = {
    from: `Getit <${process.env.NODEMAILER_USER}>`,
    to: userMail,
    subject: 'Getit 회원가입을 위한 인증번호를 입력해주세요.',
    html: emailTemplete,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log('send mail error');
    }
    console.log('finish sending email : ' + info.response);
    res.send(authNum);
    transporter.close();
  });
});

export default router;
