import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../data-source';
import { User } from '../entity/User';

const router = express.Router();

router.post('/login', async (req: Request, res: Response) => {
  console.log(req.body);

  const { email, password } = req.body;

  const userRepository = AppDataSource.getRepository(User);

  const result = await userRepository.findOne({
    where: {
      email,
      password,
    },
  });

  if (!result) {
    return res
      .status(401)
      .json({ success: false, message: 'invalid email or password' });
  }

  res.status(200).json({ success: true, message: null });
});

export default router;
