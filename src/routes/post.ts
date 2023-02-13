import express, { Request, Response, NextFunction } from 'express';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.send('GET: /post');
});

router.post('/', (req, res) => {
  res.send('POST: /post');
});

router.delete('/', (req, res) => {
  res.send('DELETE: /post');
});

export default router;
