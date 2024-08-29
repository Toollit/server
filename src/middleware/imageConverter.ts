import { NextFunction, Request, Response } from 'express';
import sharp, { FormatEnum } from 'sharp';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage });

interface FormDataParsingMiddleware {
  (formDataKey: string): (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void;
}
interface ImageConvertMiddleware {
  (width: number, height: number, format?: keyof FormatEnum): (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void;
}

interface ImageConverter {
  (
    formDataKey: string,
    width: number,
    height: number,
    format?: keyof FormatEnum
  ): ((req: Request, res: Response, next: NextFunction) => void)[];
}

const formDataParsingMiddleware: FormDataParsingMiddleware =
  (formDataKey) => (req, res, next) => {
    return upload.single(formDataKey)(req, res, next);
  };

const imageConvertMiddleware: ImageConvertMiddleware =
  (width, height, format) => async (req, res, next) => {
    try {
      if (!req.file) {
        return next();
      }

      const fileBuffer = req.file?.buffer;
      const imageBuffer = await sharp(fileBuffer)
        .resize(width, height, { withoutEnlargement: true })
        .toFormat(format ?? 'webp', { quality: 100 })
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

export const imageConverter: ImageConverter = (
  formDataKey,
  width,
  height,
  format
) => {
  return [
    formDataParsingMiddleware(formDataKey),
    imageConvertMiddleware(width, height, format),
  ];
};
