import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { getParameterStore } from '@/utils/awsParameterStore';

const upload = async (category: string) => {
  const AWS_S3_ACCESS_KEY_ID = await getParameterStore({
    key: 'AWS_S3_ACCESS_KEY_ID',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore AWS_S3_ACCESS_KEY_ID data fetch: ${err}`
    );
  });
  const AWS_S3_SECRET_ACCESS_KEY = await getParameterStore({
    key: 'AWS_S3_SECRET_ACCESS_KEY',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore AWS_S3_SECRET_ACCESS_KEY data fetch: ${err}`
    );
  });
  const AWS_S3_BUCKET_NAME = await getParameterStore({
    key: 'AWS_S3_BUCKET_NAME',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore AWS_S3_BUCKET_NAME data fetch: ${err}`
    );
  });
  const AWS_S3_BUCKET_REGION = await getParameterStore({
    key: 'AWS_S3_BUCKET_REGION',
  }).catch((err) => {
    throw new Error(
      `Error during aws getParameterStore AWS_S3_BUCKET_REGION data fetch: ${err}`
    );
  });

  const s3 = new S3Client({
    credentials: {
      accessKeyId: AWS_S3_ACCESS_KEY_ID,
      secretAccessKey: AWS_S3_SECRET_ACCESS_KEY,
    },
    region: AWS_S3_BUCKET_REGION,
  });

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
      bucket: AWS_S3_BUCKET_NAME,
      key(req, file, cb) {
        const userId = req.user?.id;
        const newFileName = new Date().getTime();

        let extname: string | null = null;

        if (file.mimetype === 'image/jpeg') {
          extname = '.jpeg';
        }

        if (file.mimetype === 'image/jpg') {
          extname = '.jpg';
        }

        if (file.mimetype === 'image/png') {
          extname = '.png';
        }

        if (file.mimetype === 'image/png') {
          extname = '.webp';
        }

        const imageUrl = `${category}/${userId}/${newFileName}${extname}`;

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
  category: string;
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

export const uploadS3 = ({ category, option, data }: Upload) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (option === 'single' && isSingleType(data)) {
      try {
        return (await upload(category)).single(data.name)(req, res, next);
      } catch (err) {
        console.error('Error during single upload:', err);
        next(err);
      }
    }

    if (option === 'array' && isArrayType(data)) {
      try {
        return (await upload(category)).array(data.name, data.maxCount)(
          req,
          res,
          next
        );
      } catch (err) {
        console.error('Error during array upload:', err);
        next(err);
      }
    }

    if (option === 'fields' && isFieldsType(data)) {
      try {
        return (await upload(category)).fields(data)(req, res, next);
      } catch (err) {
        console.error('Error during fields upload:', err);
        next(err);
      }
    }
  };
};
