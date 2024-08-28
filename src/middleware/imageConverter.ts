import { NextFunction, Request, Response } from 'express';
import sharp, { FormatEnum } from 'sharp';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage });

const formDataParsingMiddleware =
  (formDataKey: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    console.log('test1');
    return upload.single(formDataKey)(req, res, next);
  };

const imageConvertMiddleware =
  (width: number, height: number, format?: keyof FormatEnum) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return next();
      }

      const fileBuffer = req.file?.buffer;
      const imageBuffer = await sharp(fileBuffer)
        .resize(width, height)
        .toFormat(format ?? 'webp')
        .toBuffer();

      // Save the converted image to a req object
      req.file.buffer = imageBuffer;
      req.file.mimetype = `image/${format ?? 'webp'}`; // Update mime type
      req.file.size = imageBuffer.length; // Update image capacity

      return next();
    } catch (err) {
      return next(err);
    }
  };

export const imageConverter = (
  formDataKey: string,
  width: number,
  height: number,
  format?: keyof FormatEnum
) => {
  return [
    formDataParsingMiddleware(formDataKey),
    imageConvertMiddleware(width, height, format),
  ];
};
