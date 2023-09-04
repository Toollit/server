import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_BUCKET_REGION = process.env.S3_BUCKET_REGION;

const s3 = new S3Client({
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  region: S3_BUCKET_REGION,
});

interface UploadSingle {
  path: string;
  option: 'single';
  data: {
    fieldName: string;
  };
}

interface UploadArray {
  path: string;
  option: 'array';
  data: {
    fieldName: string;
    maxCount?: number;
  };
}

interface UploadFields {
  path: string;
  option: 'fields';
  data: {
    name: string;
    maxCount: number;
  }[];
}

const upload = (path: string) => {
  return multer({
    storage: multerS3({
      s3: s3,
      bucket: S3_BUCKET_NAME,
      key(req, file, cb) {
        const userId = req.user?.id;
        const newFileName = new Date().getTime();

        let extname: string | null = null;

        if (file.mimetype === 'image/jpeg') {
          extname = '.jpg';
        }

        if (file.mimetype === 'image/jpg') {
          extname = '.jpg';
        }

        if (file.mimetype === 'image/png') {
          extname = '.png';
        }

        const imageUrl = `${path}/${userId}/${newFileName}${extname}`;

        cb(null, imageUrl);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1204 }, // 10MB
  });
};

export const uploadS3 = ({
  path,
  option,
  data,
}: UploadSingle | UploadArray | UploadFields) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (option === 'single') {
      return upload(path).single((data as { fieldName: string }).fieldName)(
        req,
        res,
        next
      );
    }

    if (option === 'array') {
      return upload(path).array(
        (data as { fieldName: string; maxCount?: number }).fieldName,
        (data as { fieldName: string; maxCount?: number }).maxCount
      )(req, res, next);
    }

    if (option === 'fields') {
      return upload(path).fields(data as { name: string; maxCount: number }[])(
        req,
        res,
        next
      );
    }
  };
};
