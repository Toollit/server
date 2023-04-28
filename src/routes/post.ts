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
          id: 'DESC',
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
              contentMarkdown,
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

interface ProjectCreateReqBody {
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
}

router.post(
  '/project/create',
  async (
    req: Request<{}, {}, ProjectCreateReqBody>,
    res: Response,
    next: NextFunction
  ) => {
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
      const queryRunner = AppDataSource.createQueryRunner();

      await queryRunner.connect();

      await queryRunner.startTransaction();

      const userRepository = queryRunner.manager.getRepository(User);
      try {
        const writer = await userRepository.findOne({ where: { id: user.id } });

        if (writer && hashtags.length >= 1 && memberTypes.length >= 1) {
          const newProject = new Project();
          newProject.title = title;
          newProject.contentHTML = contentHTML;
          newProject.contentMarkdown = contentMarkdown;
          newProject.user = writer;

          const projectRepository = queryRunner.manager.getRepository(Project);

          const projectData = await projectRepository.save(newProject);

          if (projectData) {
            const projectImageRepository =
              queryRunner.manager.getRepository(ProjectImage);

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

            const addProcessedHashtags = hashtags.map((hashtag) => {
              return { tagName: hashtag, project: projectData };
            });

            await queryRunner.manager
              .createQueryBuilder()
              .insert()
              .into(Hashtag)
              .values([...addProcessedHashtags])
              .execute();

            const addProcessedMemberTypes = memberTypes.map((memberType) => {
              return { type: memberType, project: projectData };
            });

            await queryRunner.manager
              .createQueryBuilder()
              .insert()
              .into(MemberType)
              .values([...addProcessedMemberTypes])
              .execute();
          }

          res.status(201).json({
            success: true,
            message: 'success create project',
            data: {
              projectId: projectData.id,
            },
          });

          await queryRunner.commitTransaction();
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();

        return next(error);
      } finally {
        await queryRunner.release();
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
      title: modifiedTitle,
      contentHTML: modifiedContentHTML,
      contentMarkdown: modifiedContentMarkdown,
      imageUrls: modifiedImageUrls,
      hashtags: modifiedHashtags,
      memberTypes: modifiedMemberTypes,
    } = req.body;

    if (user) {
      try {
        const queryRunner = AppDataSource.createQueryRunner();

        await queryRunner.connect();

        await queryRunner.startTransaction();

        const projectRepository = queryRunner.manager.getRepository(Project);

        const existedProject = await projectRepository.findOne({
          where: {
            id: Number(postId),
          },
        });

        if (
          existedProject &&
          modifiedHashtags.length >= 1 &&
          modifiedMemberTypes.length >= 1
        ) {
          const titleContentDiffCheck = (
            existedProject: Project,
            modifiedProject: Project
          ): ('title' | 'contentHTML' | 'contentMarkdown')[] => {
            const changedFields: (
              | 'title'
              | 'contentHTML'
              | 'contentMarkdown'
            )[] = [];

            if (existedProject.title !== modifiedProject.title) {
              changedFields.push('title');
            }

            if (existedProject.contentHTML !== modifiedProject.contentHTML) {
              changedFields.push('contentHTML');
            }

            if (
              existedProject.contentMarkdown !== modifiedProject.contentMarkdown
            ) {
              changedFields.push('contentMarkdown');
            }

            return changedFields;
          };

          const updateChangedTitleContentFields = async (
            existedProject: Project,
            modifiedProject: Project
          ) => {
            const changedFields = titleContentDiffCheck(
              existedProject,
              modifiedProject
            );

            const updateData = changedFields.reduce<{ [key: string]: string }>(
              (acc, field) => {
                acc[field] = modifiedProject[field];
                return acc;
              },
              {}
            );

            const nothingChange = Object.keys(updateData).length === 0;

            if (nothingChange) {
              return null;
            }

            // updateData가 빈 객체라서 따로 업데이트 되는 데이터를 전달하지 않더라도 execute 메소드가 동작하면 업데이트가 된 것 처럼 affected 1을 반환하므로 바로 위에 코드 nothingChange에서 업데이트가 필요없다고 판단되면 null을 반환한다.
            await queryRunner.manager
              .createQueryBuilder()
              .update(Project)
              .set(updateData)
              .where('id = :id', { id: existedProject.id })
              .execute();
          };

          const updateProjectImages = async () => {
            const savedProjectImages = await queryRunner.manager
              .getRepository(ProjectImage)
              .createQueryBuilder()
              .where('projectImage.projectId = :postId', { postId: postId })
              .getMany();

            const existedProjectImages = savedProjectImages.map((image) => {
              return image.url;
            });

            const toBeDeletedProjectImages = existedProjectImages.filter(
              (value) => !modifiedImageUrls.includes(value)
            );

            const toBeAddedProjectImages = modifiedImageUrls.filter(
              (value) => !existedProjectImages.includes(value)
            );

            // 변경된 사항이 없는 경우 return null
            if (
              toBeDeletedProjectImages.length === 0 &&
              toBeAddedProjectImages.length === 0
            ) {
              return null;
            }

            const deleteProjectImageRequests = toBeDeletedProjectImages.map(
              (url: string) => {
                const requests = queryRunner.manager
                  .createQueryBuilder()
                  .delete()
                  .from(ProjectImage)
                  .where('projectId = :postId', { postId: postId })
                  .andWhere('url = :url', { url })
                  .execute();

                return requests;
              }
            );

            await Promise.all(deleteProjectImageRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('deleted project image ', response)
              )
            );

            const addProcessedProjectImages = toBeAddedProjectImages.map(
              (url) => {
                return { url, project: existedProject };
              }
            );

            await queryRunner.manager
              .createQueryBuilder()
              .insert()
              .into(ProjectImage)
              .values([...addProcessedProjectImages])
              .execute();
          };

          const updateProjectHashtags = async () => {
            const savedHashtags = await queryRunner.manager
              .getRepository(Hashtag)
              .createQueryBuilder()
              .where('hashtag.projectId = :postId', { postId: postId })
              .getMany();

            const existedHashtags = savedHashtags.map((hashtag) => {
              return hashtag.tagName;
            });

            const isEqual = (
              existedData: string[],
              modifiedHData: string[]
            ) => {
              if (existedData.length !== modifiedHData.length) {
                return false;
              }

              for (let i = 0; i < existedData.length; i++) {
                if (existedData[i] !== modifiedHData[i]) {
                  return false;
                }
              }

              return true;
            };

            if (isEqual(existedHashtags, modifiedHashtags)) {
              return null;
            }

            const deleteExistedHashtagRequests = existedHashtags.map(
              (tagName: string) => {
                const result = queryRunner.manager
                  .createQueryBuilder()
                  .delete()
                  .from(Hashtag)
                  .where('projectId = :postId', { postId: postId })
                  .andWhere('tagName = :tagName', { tagName })
                  .execute();

                return result;
              }
            );

            await Promise.all(deleteExistedHashtagRequests).then((responses) =>
              responses.forEach((response) => {
                console.log('deleted hashtag ', response);
              })
            );

            const addProcessedHashtags = modifiedHashtags.map((hashtag) => {
              return { tagName: hashtag, project: existedProject };
            });

            await queryRunner.manager
              .createQueryBuilder()
              .insert()
              .into(Hashtag)
              .values([...addProcessedHashtags])
              .execute();
          };

          const updateProjectMemberTypes = async () => {
            const savedMemberTypes = await queryRunner.manager
              .getRepository(MemberType)
              .createQueryBuilder()
              .where('memberType.projectId = :postId', { postId: postId })
              .getMany();

            const existedMemberTypes = savedMemberTypes.map((memberType) => {
              return memberType.type;
            });

            const toBeDeletedMemberTypes = existedMemberTypes.filter(
              (value) => !modifiedMemberTypes.includes(value)
            );

            const toBeAddedMemberTypes = modifiedMemberTypes.filter(
              (value) => !existedMemberTypes.includes(value)
            );

            if (
              toBeDeletedMemberTypes.length === 0 &&
              toBeAddedMemberTypes.length === 0
            ) {
              return null;
            }

            const deleteMemberTypeRequests = toBeDeletedMemberTypes.map(
              (type: string) => {
                const result = queryRunner.manager
                  .createQueryBuilder()
                  .delete()
                  .from(MemberType)
                  .where('projectId = :postId', { postId: postId })
                  .andWhere('type = :type', { type })
                  .execute();

                return result;
              }
            );

            await Promise.all(deleteMemberTypeRequests).then((responses) =>
              responses.forEach((response) =>
                console.log('deleted memberType ', response)
              )
            );

            const addProcessedMemberTypes = toBeAddedMemberTypes.map((type) => {
              return { type, project: existedProject };
            });

            await queryRunner.manager
              .createQueryBuilder()
              .insert()
              .into(MemberType)
              .values([...addProcessedMemberTypes])
              .execute();
          };

          const modifiedProject = {
            ...existedProject,
            title: modifiedTitle,
            contentHTML: modifiedContentHTML,
            contentMarkdown: modifiedContentMarkdown,
          };

          Promise.all([
            updateChangedTitleContentFields(existedProject, modifiedProject),
            updateProjectImages(),
            updateProjectHashtags(),
            updateProjectMemberTypes(),
          ])
            .then(async (response) => {
              await queryRunner.commitTransaction();

              const isContentNotChanged = response.every(
                (value) => value === null
              );

              if (isContentNotChanged) {
                return res.status(200).json({
                  success: true,
                  message: 'nothing change',
                  data: {
                    postId,
                  },
                });
              } else {
                return res.status(200).json({
                  success: true,
                  message: 'project updated successfully',
                  data: {
                    postId,
                  },
                });
              }
            })
            .catch(async (error) => {
              await queryRunner.rollbackTransaction();
              return next(error);
            })
            .finally(async () => {
              await queryRunner.release();
            });
        }
      } catch (error) {
        return next(error);
      }
    }
  }
);

router.delete('/', (req, res) => {
  res.send('DELETE: /post');
});

export default router;
