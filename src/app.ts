import express, { Application, Request, Response, NextFunction } from 'express';
import postRouter from './routes/post';
const app: Application = express();
const port = 4000;

app.get('/', (req: Request, res: Response, next: NextFunction) => {
  res.send('Hello World!');
});

app.use('/post', postRouter);

app.listen(port, () => {
  console.log(
    `started server on 0.0.0.0:${port}, url: http://localhost:${port}`
  );
});
