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
  '/projects',
  async (req: Request, res: Response, next: NextFunction) => {
    const projectRepository = AppDataSource.getRepository(Project);

    try {
      const projects = await projectRepository.find({
        relations: { hashtags: true, memberTypes: true },
        order: {
          memberTypes: {
            id: 'ASC',
          },
        },
      });

      const processedData = projects.map((project) => {
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

      return res.status(200).json({
        success: true,
        message: null,
        data: { projects: processedData },
      });
    } catch (error) {
      next(error);
    }
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
        res.status(200).json({
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
      imageUrls,
      hashtags,
      memberTypes,
    } = req.body;

    if (user) {
      try {
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

          if (projectData && imageUrls.length >= 1) {
            const projectImageRepository =
              AppDataSource.getRepository(ProjectImage);

            const imgSaveRequests = imageUrls.map((url: string) => {
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

          res.status(201).json({
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

    res.status(201).json({
      success: true,
      message: null,
      data: {
        url: multerS3File.location,
      },
    });
  }
);

interface ProjectModifyReqBody {
  postId: string;
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
}

router.post(
  '/project/modify',
  async (
    req: Request<{}, {}, ProjectModifyReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const user = req.user;
    const {
      postId,
      title,
      contentHTML,
      contentMarkdown,
      imageUrls,
      hashtags,
      memberTypes,
    } = req.body;

    if (user) {
      // content diff check
      const contentDiffCheck = (
        prevProject: Project,
        modifyProject: ProjectModifyReqBody
      ): ('title' | 'contentHTML' | 'contentMarkdown')[] => {
        const changedFields: ('title' | 'contentHTML' | 'contentMarkdown')[] =
          [];

        if (prevProject.title !== modifyProject.title) {
          changedFields.push('title');
        }

        if (prevProject.contentHTML !== modifyProject.contentHTML) {
          changedFields.push('contentHTML');
        }

        if (prevProject.contentMarkdown !== modifyProject.contentMarkdown) {
          changedFields.push('contentMarkdown');
        }

        return changedFields;
      };

      // update data
      const updateChangedProjectFields = async (
        prevProject: Project,
        modifyProject: ProjectModifyReqBody
      ): Promise<any | null> => {
        const changedFields = contentDiffCheck(prevProject, modifyProject);

        const updateData = changedFields.reduce<{ [key: string]: string }>(
          (acc, field) => {
            acc[field] = modifyProject[field];
            return acc;
          },
          {}
        );

        const nothingChange = Object.keys(updateData).length === 0;

        if (nothingChange) {
          return null;
        }

        try {
          // updateData가 빈 객체라서 따로 업데이트 되는 데이터를 전달하지 않더라도 execute 메소드가 동작하면 업데이트가 된 것 처럼 affected 1을 반환하므로 바로 위에 코드 nothingChange에서 업데이트가 필요없다고 판단되면 null을 반환한다.
          const result = await AppDataSource.createQueryBuilder()
            .update(Project)
            .set(updateData)
            .where('id = :id', { id: prevProject.id })
            .execute();

          return result;
        } catch (error) {
          next(error);
        }
      };

      const projectRepository = AppDataSource.getRepository(Project);

      try {
        const prevProject = await projectRepository.findOne({
          where: {
            id: Number(postId),
          },
        });

        const modifiedProjectData = {
          ...prevProject,
          ...req.body,
        };

        if (prevProject && hashtags.length >= 1 && memberTypes.length >= 1) {
          const updateProjectImages = async () => {
            const savedProjectImages = await AppDataSource.getRepository(
              ProjectImage
            )
              .createQueryBuilder()
              .where('projectImage.projectId = :postId', { postId: postId })
              .getMany();

            const prevProjectImages = savedProjectImages.map((image) => {
              return image.url;
            });

            const toBeDeletedProjectImages = prevProjectImages.filter(
              (value) => !imageUrls.includes(value)
            );

            const toBeAddedProjectImages = imageUrls.filter(
              (value) => !prevProjectImages.includes(value)
            );

            if (
              toBeDeletedProjectImages.length === 0 &&
              toBeAddedProjectImages.length === 0
            ) {
              return null;
            }

            const projectImageDeleteRequests = toBeDeletedProjectImages.map(
              (url: string) => {
                const result = AppDataSource.createQueryBuilder()
                  .delete()
                  .from(ProjectImage)
                  .where('projectId = :postId', { postId: postId })
                  .andWhere('url = :url', { url })
                  .execute();

                return result;
              }
            );

            Promise.all(projectImageDeleteRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('deleted project image ', response)
              )
            );

            const processedAddProjectImages = toBeAddedProjectImages.map(
              (url) => {
                return { url, project: prevProject };
              }
            );

            await AppDataSource.createQueryBuilder()
              .insert()
              .into(ProjectImage)
              .values([...processedAddProjectImages])
              .execute();
          };

          const updateProjectHashtags = async () => {
            const savedHashtags = await AppDataSource.getRepository(Hashtag)
              .createQueryBuilder()
              .where('hashtag.projectId = :postId', { postId: postId })
              .getMany();

            const prevHashtags = savedHashtags.map((hashtag) => {
              return hashtag.tagName;
            });

            const toBeDeletedHashtags = prevHashtags.filter(
              (value) => !hashtags.includes(value)
            );

            const toBeAddedHashtags = hashtags.filter(
              (value) => !prevHashtags.includes(value)
            );

            if (
              toBeDeletedHashtags.length === 0 &&
              toBeAddedHashtags.length === 0
            ) {
              return null;
            }

            const hashtagDeleteRequests = toBeDeletedHashtags.map(
              (tagName: string) => {
                const result = AppDataSource.createQueryBuilder()
                  .delete()
                  .from(Hashtag)
                  .where('projectId = :postId', { postId: postId })
                  .andWhere('tagName = :tagName', { tagName })
                  .execute();

                return result;
              }
            );

            Promise.all(hashtagDeleteRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('deleted hashtag ', response)
              )
            );

            const processedAddHashtags = toBeAddedHashtags.map((hashtag) => {
              return { tagName: hashtag, project: prevProject };
            });

            await AppDataSource.createQueryBuilder()
              .insert()
              .into(Hashtag)
              .values([...processedAddHashtags])
              .execute();
          };

          const updateProjectMemberTypes = async () => {
            const savedMemberTypes = await AppDataSource.getRepository(
              MemberType
            )
              .createQueryBuilder()
              .where('memberType.projectId = :postId', { postId: postId })
              .getMany();

            const prevMemberTypes = savedMemberTypes.map((memberType) => {
              return memberType.type;
            });

            const toBeDeletedMemberTypes = prevMemberTypes.filter(
              (value) => !memberTypes.includes(value)
            );

            const toBeAddedMemberTypes = memberTypes.filter(
              (value) => !prevMemberTypes.includes(value)
            );

            if (
              toBeDeletedMemberTypes.length === 0 &&
              toBeAddedMemberTypes.length === 0
            ) {
              return null;
            }

            const memberTypeDeleteRequests = toBeDeletedMemberTypes.map(
              (type: string) => {
                const result = AppDataSource.createQueryBuilder()
                  .delete()
                  .from(MemberType)
                  .where('projectId = :postId', { postId: postId })
                  .andWhere('type = :type', { type })
                  .execute();

                return result;
              }
            );

            Promise.all(memberTypeDeleteRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('deleted memberType ', response)
              )
            );

            const processedAddMemberTypes = toBeAddedMemberTypes.map((type) => {
              return { type, project: prevProject };
            });

            await AppDataSource.createQueryBuilder()
              .insert()
              .into(MemberType)
              .values([...processedAddMemberTypes])
              .execute();
          };

          const updateTitleContentResult = await updateChangedProjectFields(
            prevProject,
            modifiedProjectData
          );

          const updateImagesResult = await updateProjectImages();
          const updateHashtagsResult = await updateProjectHashtags();
          const updateMemberTypesResult = await updateProjectMemberTypes();

          if (
            updateTitleContentResult === null &&
            updateImagesResult === null &&
            updateHashtagsResult === null &&
            updateMemberTypesResult === null
          ) {
            res.status(200).json({
              success: true,
              message: 'nothing change',
              data: {
                postId,
              },
            });
          } else {
            res.status(200).json({
              success: true,
              message: 'project updated successfully',
              data: {
                postId,
              },
            });
          }
        }
      } catch (error) {
        next(error);
      }
    }
  }
);

router.delete('/', (req, res) => {
  res.send('DELETE: /post');
});

export default router;
