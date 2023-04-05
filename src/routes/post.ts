import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { User } from '@/entity/User';
import { ProjectImage } from '@/entity/ProjectImage';

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
  '/project/:projectId',
  async (req: Request, res: Response, next: NextFunction) => {
    const projectId = Number(req.params.projectId);
    const requestUserId = req.user?.id;

    const projectRepository = AppDataSource.getRepository(Project);

    try {
      // 조회시 조회수 1증가
      await AppDataSource.createQueryBuilder()
        .update(Project)
        .set({ views: () => 'views + 1', updatedAt: () => 'updatedAt' })
        .where('id = :id', { id: projectId })
        .execute();

      const project = await projectRepository.findOne({
        where: { id: projectId },
        relations: { user: true },
      });

      if (project) {
        const {
          title,
          contentHTML,
          contentMarkdown,
          views,
          createdAt,
          updatedAt,
          user,
        } = project;

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
        const newProject = new Project();
        newProject.title = title;
        newProject.contentHTML = contentHtml;
        newProject.contentMarkdown = contentMark;
        newProject.user = writer;

        const projectRepository = AppDataSource.getRepository(Project);

        const projectData = await projectRepository
          .save(newProject)
          .catch((error) => next(error));

        if (projectData && saveImgUrls) {
          const projectImageRepository =
            AppDataSource.getRepository(ProjectImage);

          const requests = saveImgUrls.map((url: string) => {
            const newProjectImage = new ProjectImage();
            newProjectImage.url = url;
            newProjectImage.project = projectData;

            projectImageRepository
              .save(newProjectImage)
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

        if (projectData) {
          res.json({
            success: true,
            message: 'success create project',
            data: {
              projectId: projectData.id,
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
