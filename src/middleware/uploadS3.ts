import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

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

const upload = (path: string) => {
  return multer({
    fileFilter(req, file, cb) {
      if (file.mimetype === 'application/json') {
        // To reject this file pass `false`,
        cb(null, false);
      } else {
        // To accept the file pass `true`,
        cb(null, true);
      }
    },
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

interface SingleType {
  name: string;
}

interface ArrayType {
  name: string;
  maxCount?: number;
}

interface FieldsType {
  name: string;
  maxCount?: number;
}

interface Upload {
  path: string;
  option: 'single' | 'array' | 'fields';
  data: SingleType | ArrayType | ReadonlyArray<FieldsType>;
}

const isSingleType = (data: Upload['data']): data is SingleType => {
  const keys = Object.keys(data);
  const found = keys.find((key) => key === 'maxCount');

  return found === undefined && !Array.isArray(data);
};

const isArrayType = (data: Upload['data']): data is ArrayType => {
  const keys = Object.keys(data);
  const found = keys.find((key) => key === 'maxCount');

  return (
    (found !== undefined && !Array.isArray(data)) ||
    (found === undefined && !Array.isArray(data))
  );
};

const isFieldsType = (
  data: Upload['data']
): data is ReadonlyArray<FieldsType> => {
  return Array.isArray(data);
};

export const uploadS3 = ({ path, option, data }: Upload) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (option === 'single' && isSingleType(data)) {
      return upload(path).single(data.name)(req, res, next);
    }

    if (option === 'array' && isArrayType(data)) {
      return upload(path).array(data.name, data.maxCount)(req, res, next);
    }

    if (option === 'fields' && isFieldsType(data)) {
      return upload(path).fields(data)(req, res, next);
    }
  };
};
