import { getParameterStore } from '@/utils/awsParameterStore';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextFunction, Request, Response } from 'express';

const getKeys = async () => {
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

  return {
    AWS_S3_ACCESS_KEY_ID,
    AWS_S3_SECRET_ACCESS_KEY,
    AWS_S3_BUCKET_NAME,
    AWS_S3_BUCKET_REGION,
  };
};

const s3 = async () => {
  const {
    AWS_S3_ACCESS_KEY_ID,
    AWS_S3_SECRET_ACCESS_KEY,
    AWS_S3_BUCKET_REGION,
  } = await getKeys();

  const client = new S3Client({
    credentials: {
      accessKeyId: AWS_S3_ACCESS_KEY_ID,
      secretAccessKey: AWS_S3_SECRET_ACCESS_KEY,
    },
    region: AWS_S3_BUCKET_REGION,
  });

  return client;
};

interface ImageUpload {
  (category: string, option: 'single' | 'array' | 'fields'): (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void;
}

export const imageUpload: ImageUpload = (category, option) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { AWS_S3_BUCKET_NAME, AWS_S3_BUCKET_REGION } = await getKeys();

      const userId = req.user?.id;
      const newFileName = new Date().getTime();

      if (!userId) {
        return next('err: userId value does not exist');
      }

      if (!req.file?.buffer) {
        return next('err: req.file.buffer value does not exist');
      }

      if (!AWS_S3_BUCKET_NAME) {
        return next('err: AWS_S3_BUCKET_NAME value does not exist');
      }

      const extname = req.file.mimetype.split('/')[1]; // 'ex) webp';

      const imageUrl = `${category}/${userId}/${newFileName}.${extname}`;

      const command = new PutObjectCommand({
        Bucket: AWS_S3_BUCKET_NAME,
        Key: imageUrl,
        Body: req.file?.buffer,
      });

      const response = await (await s3()).send(command);

      const fileUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${AWS_S3_BUCKET_REGION}.amazonaws.com/${imageUrl}`;

      req.body.fileUrl = fileUrl;

      if (response.$metadata.httpStatusCode === 200) {
        return next();
      }
    } catch (err) {
      return next(err);
    }
  };
};
