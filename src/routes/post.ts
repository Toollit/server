import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { User } from '@/entity/User';
import { ProjectImage } from '@/entity/ProjectImage';
import { Hashtag } from '@/entity/Hashtag';
import { MemberType } from '@/entity/MemberType';

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
  '/project',
  async (req: Request, res: Response, next: NextFunction) => {
    const projectRepository = AppDataSource.getRepository(Project);

    const projectList = await projectRepository.find({
      relations: { hashtags: true, memberTypes: true },
      order: {
        memberTypes: {
          id: 'ASC',
        },
      },
    });

    const processedData = projectList.map((project) => {
      const processedHashtagsData = project.hashtags.map(
        (hashtag) => hashtag.tagName
      );

      const processedMemberTypesData = project.memberTypes.map(
        (memberType) => memberType.type
      );

      // developer, designer, pm, anyone 순으로 정렬
      processedMemberTypesData.sort(function (a, b) {
        return (
          (a === 'developer'
            ? -3
            : a === 'designer'
            ? -2
            : a === 'pm'
            ? -1
            : a === 'anyone'
            ? 0
            : 1) -
          (b === 'developer'
            ? -3
            : b === 'designer'
            ? -2
            : b === 'pm'
            ? -1
            : b === 'anyone'
            ? 0
            : 1)
        );
      });

      return {
        id: project.id,
        title: project.title,
        views: project.views,
        bookmarks: project.bookmarks,
        hashtags: processedHashtagsData,
        memberTypes: processedMemberTypesData,
      };
    });

    return res.json({
      success: true,
      message: null,
      data: { projectList: processedData },
    });
  }
);

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
        relations: {
          user: true,
          hashtags: true,
          memberTypes: true,
          comments: true,
        },
        order: {
          memberTypes: {
            id: 'ASC',
          },
        },
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
          hashtags,
          memberTypes,
          comments,
        } = project;

        const processedHashtagsData = hashtags.map(
          (hashtag) => hashtag.tagName
        );

        // developer, designer, pm, anyone 순으로 정렬
        const processedMemberTypesData = memberTypes.map(
          (memberType) => memberType.type
        );

        processedMemberTypesData.sort(function (a, b) {
          return (
            (a === 'developer'
              ? -3
              : a === 'designer'
              ? -2
              : a === 'pm'
              ? -1
              : a === 'anyone'
              ? 0
              : 1) -
            (b === 'developer'
              ? -3
              : b === 'designer'
              ? -2
              : b === 'pm'
              ? -1
              : b === 'anyone'
              ? 0
              : 1)
          );
        });

        // 내가 작성한 글이면 markdown도 같이 보내고 아닌경우엔 html만 보내기
        res.json({
          success: true,
          message: null,
          data: {
            writer: {
              nickname: user.nickname,
              lastLoginAt: user.lastLoginAt,
              profileImage: user.profileImage,
            },
            content: {
              title,
              contentHTML,
              contentMarkdown:
                user.id === requestUserId ? contentMarkdown : null,
              views,
              createdAt,
              updatedAt,
              hashtags: processedHashtagsData,
              memberTypes: processedMemberTypesData,
            },
            comments,
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
      contentHTML,
      contentMarkdown,
      imageUrls: { saveImgUrls, removeImgUrls },
      hashtags,
      memberTypes,
    } = req.body;

    console.log({
      title,
      contentHTML,
      contentMarkdown,
      saveImgUrls,
      removeImgUrls,
      hashtags,
      memberTypes,
    });

    if (user) {
      try {
        const removeFileNameList: string[] = removeImgUrls.map(
          (url: string) => {
            return url.slice(
              `https://${S3_BUCKET_NAME}.s3.ap-northeast-2.amazonaws.com/`
                .length
            );
          }
        );

        const s3ImageRemoveRequest = removeFileNameList.map((filename) => {
          const bucketParams = { Bucket: S3_BUCKET_NAME, Key: filename };

          s3.send(new DeleteObjectCommand(bucketParams));
        });

        Promise.all(s3ImageRemoveRequest).then((responses) =>
          responses.forEach((response) =>
            console.log('remove image urls', response)
          )
        );

        const userRepository = AppDataSource.getRepository(User);

        const writer = await userRepository.findOne({ where: { id: user.id } });

        if (writer) {
          const newProject = new Project();
          newProject.title = title;
          newProject.contentHTML = contentHTML;
          newProject.contentMarkdown = contentMarkdown;
          newProject.user = writer;

          const projectRepository = AppDataSource.getRepository(Project);

          const projectData = await projectRepository.save(newProject);

          if (projectData && saveImgUrls) {
            const projectImageRepository =
              AppDataSource.getRepository(ProjectImage);

            const imgSaveRequests = saveImgUrls.map((url: string) => {
              const newProjectImage = new ProjectImage();
              newProjectImage.url = url;
              newProjectImage.project = projectData;

              projectImageRepository.save(newProjectImage);
            });

            Promise.all(imgSaveRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('save image urls', response)
              )
            );
          }

          if (hashtags.length >= 1) {
            const HashtagRepository = AppDataSource.getRepository(Hashtag);

            (async function saveHashtagsInOrder() {
              await hashtags.reduce(
                async (previousPromise: Promise<any>, hashtag: string) => {
                  await previousPromise;

                  const newHashtag = new Hashtag();
                  newHashtag.project = projectData;
                  newHashtag.tagName = hashtag;

                  await HashtagRepository.save(newHashtag);
                },
                Promise.resolve()
              );
            })();
          }

          if (memberTypes.length >= 1) {
            const MemberTypeRepository =
              AppDataSource.getRepository(MemberType);

            const memberTypeSaveRequests = memberTypes.map(
              (memberType: 'developer' | 'designer' | 'pm' | 'anyone') => {
                const newMemberType = new MemberType();
                newMemberType.project = projectData;
                newMemberType.type = memberType;

                MemberTypeRepository.save(newMemberType);
              }
            );

            Promise.all(memberTypeSaveRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('save memberTypes', response)
              )
            );
          }

          res.json({
            success: true,
            message: 'success create project',
            data: {
              projectId: projectData.id,
            },
          });
        }
      } catch (error) {
        next(error);
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
