import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.',
  });
};
