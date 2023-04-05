import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { AppDataSource } from '@/data-source';
import { Post } from '@/entity/Post';
import { User } from '@/entity/User';
import { PostImage } from '@/entity/PostImage';

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

const router = express.Router();

router.get(
  '/project/:postId',
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.params.postId);
    const requestUserId = req.user?.id;

    const postRepository = AppDataSource.getRepository(Post);

    try {
      // 조회시 조회수 1증가
      await AppDataSource.createQueryBuilder()
        .update(Post)
        .set({ views: () => 'views + 1', updatedAt: () => 'updatedAt' })
        .where('id = :id', { id: postId })
        .execute();

      const post = await postRepository.findOne({
        where: { id: postId },
        relations: { user: true },
      });

      if (post) {
        const {
          title,
          contentHTML,
          contentMarkdown,
          views,
          createdAt,
          updatedAt,
          user,
        } = post;

        // 내가 작성한 글이면 markdown도 같이 보내고 아닌경우엔 html만 보내기
        res.json({
          success: true,
          message: null,
          data: {
            user: {
              nickname: user.nickname,
              lastLoginAt: user.lastLoginAt,
              profileImage: user.profileImage,
            },
            title,
            contentHTML,
            contentMarkdown: user.id === requestUserId ? contentMarkdown : null,
            views,
            createdAt,
            updatedAt,
          },
        });
      }
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/project/create',
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const {
      title,
      contentHtml,
      contentMark,
      imageUrls: { saveImgUrls, removeImgUrls },
    } = req.body;

    // console.log({
    //   title,
    //   contentHtml,
    //   contentMark,
    //   saveImgUrls,
    //   removeImgUrls,
    // });

    if (user) {
      const removeFileNameList: string[] = removeImgUrls.map((url: string) => {
        return url.slice(
          `https://${S3_BUCKET_NAME}.s3.ap-northeast-2.amazonaws.com/`.length
        );
      });

      const s3ImageRemoveRequest = removeFileNameList.map((filename) => {
        const bucketParams = { Bucket: S3_BUCKET_NAME, Key: filename };

        s3.send(new DeleteObjectCommand(bucketParams));
      });

      Promise.all(s3ImageRemoveRequest)
        .then((responses) =>
          responses.forEach((response) =>
            console.log('remove image urls', response)
          )
        )
        .catch((error) => next(error));

      const userRepository = AppDataSource.getRepository(User);

      const writer = await userRepository
        .findOne({ where: { id: user.id } })
        .catch((error) => next(error));

      if (writer) {
        const newPost = new Post();
        newPost.title = title;
        newPost.contentHTML = contentHtml;
        newPost.contentMarkdown = contentMark;
        newPost.user = writer;

        const postRepository = AppDataSource.getRepository(Post);

        const postData = await postRepository
          .save(newPost)
          .catch((error) => next(error));

        if (postData && saveImgUrls) {
          const postImageRepository = AppDataSource.getRepository(PostImage);

          const requests = saveImgUrls.map((url: string) => {
            const newPostImage = new PostImage();
            newPostImage.url = url;
            newPostImage.post = postData;

            postImageRepository
              .save(newPostImage)
              .catch((error) => next(error));
          });

          Promise.all(requests)
            .then((responses) =>
              responses.forEach((response) =>
                console.log('save image urls', response)
              )
            )
            .catch((error) => next(error));
        }

        if (postData) {
          res.json({
            success: true,
            message: 'success create project',
            data: {
              postId: postData.id,
            },
          });
        }
      }
    }
  }
);

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: S3_BUCKET_NAME,
    key(req, file, callback) {
      const userNickname = req.user?.nickname;
      const newFileName = `${userNickname}-${new Date().getTime()}-${
        file.originalname
      }`;

      callback(null, newFileName);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1204 }, // 10MB
});

interface MulterRequest extends Request {
  file: any;
}

router.post(
  '/project/content/uploadImage',
  upload.single('postImage'),
  (req: Request, res: Response, next: NextFunction) => {
    const multerS3File = (req as MulterRequest).file;

    // console.log('===>', req.file);

    res.status(200).json({
      success: true,
      message: null,
      data: {
        url: multerS3File.location,
      },
    });
  }
);

router.delete('/', (req, res) => {
  res.send('DELETE: /post');
});

export default router;
