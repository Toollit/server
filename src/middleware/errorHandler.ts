import { SERVER_ERROR_DEFAULT } from '@/message/error';
import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err.stack);

  return res.status(500).json({
    success: false,
    message: SERVER_ERROR_DEFAULT,
  });
};
