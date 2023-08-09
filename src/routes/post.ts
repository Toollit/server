import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { User } from '@/entity/User';
import { ProjectImage } from '@/entity/ProjectImage';
import { Hashtag } from '@/entity/Hashtag';
import { MemberType } from '@/entity/MemberType';
import { uploadS3 } from '@/middleware/uploadS3';
import { Bookmark } from '@/entity/Bookmark';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

router.get(
  '/projects',
  async (req: Request, res: Response, next: NextFunction) => {
    const page = Number(req.query.page);
    const order = req.query.order as 'new' | 'popularity';

    const postsPerPage = 12;

    const skip = (page - 1) * postsPerPage;

    const projectRepository = AppDataSource.getRepository(Project);
    const bookmarkRepository = AppDataSource.getRepository(Bookmark);

    try {
      const projects = await projectRepository.find({
        relations: { hashtags: true, memberTypes: true },
        order: order === 'new' ? { id: 'DESC' } : { views: 'DESC' },
        skip: page >= 2 ? skip : 0,
        take: postsPerPage,
      });

      const projectsTotalCount = await projectRepository
        .createQueryBuilder('projects')
        .getCount();

      const totalPage = Math.ceil(projectsTotalCount / postsPerPage);

      const processedData = await Promise.all(
        projects.map(async (project) => {
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

          const bookmarks = await bookmarkRepository.find({
            where: {
              bookmarkProjectId: project.id,
            },
          });

          return {
            id: project.id,
            title: project.title,
            views: project.views,
            bookmarks: bookmarks.length,
            hashtags: processedHashtagsData,
            memberTypes: processedMemberTypesData,
            memberNumber: project.memberNumber,
            recruitNumber: project.recruitNumber,
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          projects: processedData,
          totalPage,
        },
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

    const modifyRequest = req.headers.modify;

    const projectRepository = AppDataSource.getRepository(Project);
    const userRepository = AppDataSource.getRepository(User);

    try {
      // 조회시 조회수 1증가
      await AppDataSource.createQueryBuilder()
        .update(Project)
        .set({
          views: () => (modifyRequest ? 'views' : 'views + 1'),
          updatedAt: () => 'updatedAt',
        })
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
          recruitNumber,
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

        const writer = await userRepository.findOne({
          where: { id: user.id },
          relations: { profile: true },
        });

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            writer: {
              nickname: user.nickname,
              lastLoginAt: user.lastLoginAt,
              profileImage: writer?.profile.profileImage,
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
              recruitNumber,
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
  recruitNumber: number;
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
      recruitNumber,
    } = req.body;

    if (user) {
      const queryRunner = AppDataSource.createQueryRunner();

      try {
        await queryRunner.connect();

        await queryRunner.startTransaction();

        const userRepository = queryRunner.manager.getRepository(User);

        const writer = await userRepository.findOne({ where: { id: user.id } });

        if (writer && hashtags.length >= 1 && memberTypes.length >= 1) {
          const newProject = new Project();
          newProject.title = title;
          newProject.contentHTML = contentHTML;
          newProject.contentMarkdown = contentMarkdown;
          newProject.user = writer;
          newProject.recruitNumber = recruitNumber;

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

          await queryRunner.commitTransaction();

          return res.status(201).json({
            success: true,
            message: 'success create project',
            data: {
              projectId: projectData.id,
            },
          });
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

interface MulterRequest extends Request {
  file: any;
}

router.post(
  '/project/content/uploadImage',
  uploadS3({
    path: 'postImage',
    option: 'single',
    data: { fieldName: 'postImage' },
  }),
  (req: Request, res: Response, next: NextFunction) => {
    const multerS3File = (req as MulterRequest).file;

    return res.status(201).json({
      success: true,
      message: null,
      data: {
        url: multerS3File.location,
      },
    });
  }
);

interface ProjectModifyReqBody {
  postType: 'project' | 'free' | 'question';
  postId: string;
  data: {
    title: string;
    contentHTML: string;
    contentMarkdown: string;
    imageUrls: string[];
    hashtags: string[];
    memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
    recruitNumber: number;
  };
}

router.post(
  '/modify',
  async (
    req: Request<{}, {}, ProjectModifyReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const user = req.user;

    const { postId, postType } = req.body;

    const {
      title: modifiedTitle,
      contentHTML: modifiedContentHTML,
      contentMarkdown: modifiedContentMarkdown,
      imageUrls: modifiedImageUrls,
      hashtags: modifiedHashtags,
      memberTypes: modifiedMemberTypes,
      recruitNumber: modifiedRecruitNumber,
    } = req.body.data;

    if (user) {
      const queryRunner = AppDataSource.createQueryRunner();

      if (postType === 'project') {
        try {
          await queryRunner.connect();

          await queryRunner.startTransaction();

          const projectRepository = queryRunner.manager.getRepository(Project);

          const existedProject = await projectRepository.findOne({
            where: {
              id: Number(postId),
            },
          });

          const dataValidationConditions = !(
            existedProject &&
            modifiedHashtags.length >= 1 &&
            modifiedMemberTypes.length >= 1 &&
            modifiedRecruitNumber >= 1 &&
            modifiedRecruitNumber <= 100
          );

          if (dataValidationConditions) {
            throw new Error();
          }

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

            const updateData = changedFields.reduce<{
              [key: string]: string;
            }>((acc, field) => {
              acc[field] = modifiedProject[field];
              return acc;
            }, {});

            const nothingChange = Object.keys(updateData).length === 0;

            if (nothingChange) {
              return null;
            }

            // updateData가 빈 객체라도 createQueryBuilder execute 메소드가 동작하면 업데이트가 된 것 처럼 affected 1을 반환하므로 바로 위에 코드 nothingChange에서 업데이트가 필요없다고 판단되면 null을 반환한다.
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

          const updateProjectRecruitNumber = async () => {
            const existProject = await queryRunner.manager
              .getRepository(Project)
              .createQueryBuilder()
              .where('id = :postId', { postId: postId })
              .getOne();

            const isDataEqual = (existData: number, newData: number) => {
              if (existData !== newData) {
                return false;
              }

              return true;
            };

            const existRecruitNumber = existProject?.recruitNumber;

            if (!existRecruitNumber) {
              throw new Error();
            }

            if (isDataEqual(existRecruitNumber, modifiedRecruitNumber)) {
              return null;
            }

            await queryRunner.manager
              .createQueryBuilder()
              .update(Project)
              .set({ recruitNumber: modifiedRecruitNumber })
              .where('id = :postId', { postId: postId })
              .execute();
          };

          const modifiedProject = {
            ...existedProject,
            title: modifiedTitle,
            contentHTML: modifiedContentHTML,
            contentMarkdown: modifiedContentMarkdown,
          };

          await Promise.all([
            updateChangedTitleContentFields(existedProject, modifiedProject),
            updateProjectImages(),
            updateProjectHashtags(),
            updateProjectMemberTypes(),
            updateProjectRecruitNumber(),
          ]).then(async (response) => {
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
          });
        } catch (error) {
          await queryRunner.rollbackTransaction();

          return next(error);
        } finally {
          await queryRunner.release();
        }
      }
    }
  }
);

interface PostDeleteReqBody {
  postId: string;
  postType: 'project' | 'free' | 'question';
}

router.post(
  '/delete',
  async (
    req: Request<{}, {}, PostDeleteReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const { postType, postId } = req.body;

    if (req.user) {
      const queryRunner = AppDataSource.createQueryRunner();

      if (postType === 'project') {
        try {
          await queryRunner.connect();

          await queryRunner.startTransaction();

          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(ProjectImage)
            .where('projectId = :postId', { postId })
            .execute();

          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(Hashtag)
            .where('projectId = :postId', { postId })
            .execute();

          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(MemberType)
            .where('projectId = :postId', { postId })
            .execute();

          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(Project)
            .where('id = :postId', { postId })
            .execute();

          await queryRunner.commitTransaction();

          return res.status(200).json({
            success: true,
            message: 'resource deleted successfully',
          });
        } catch (error) {
          await queryRunner.rollbackTransaction();

          return next(error);
        } finally {
          await queryRunner.release();
        }
      }
    } else {
      next(new Error('not loggedIn'));
    }
  }
);

interface ProjectBookmarkReqBody {
  postId: number;
}

router.post(
  '/project/bookmark',
  async (
    req: Request<{}, {}, ProjectBookmarkReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const postId = req.body.postId;
    const user = req.user;

    if (!user) {
      return res.status(400).json({
        success: false,
        message: null,
      });
    }

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      await queryRunner.startTransaction();

      const userRepository = queryRunner.manager.getRepository(User);

      const accessUser = await userRepository.findOne({
        where: { id: user.id },
        relations: {
          bookmarks: true,
        },
      });

      if (!accessUser) {
        return res.status(400).json({
          success: false,
          message: null,
        });
      }

      let existBookmarkId: null | number = null;

      for (let obj of accessUser.bookmarks) {
        if (obj['bookmarkProjectId'] === postId) {
          existBookmarkId = obj['id'];
        }
      }

      if (existBookmarkId) {
        // cancel exist bookmark

        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Bookmark)
          .where('id = :id', { id: existBookmarkId })
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: 'cancel',
        });
      }

      if (!existBookmarkId) {
        // save new bookmark
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Bookmark)
          .values([{ user: accessUser, bookmarkProjectId: postId }])
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: 'save',
        });
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return next(error);
    } finally {
      await queryRunner.release();
    }
  }
);

router.get(
  '/project/:postId/checkBookmark',
  async (req: Request, res: Response, next: NextFunction) => {
    const requestUser = req.user;
    const postId = Number(req.params.postId);

    const userRepository = AppDataSource.getRepository(User);

    if (!requestUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmark: false,
        },
      });
    }

    try {
      const isBookmark = await userRepository.findOne({
        where: {
          id: requestUser.id,
          bookmarks: {
            bookmarkProjectId: postId,
          },
        },
        relations: { bookmarks: true },
      });

      if (isBookmark) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmark: true,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmark: false,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/projects/checkBookmark',
  async (req: Request, res: Response, next: NextFunction) => {
    const requestUser = req.user;

    if (!requestUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarks: null,
        },
      });
    }

    const userRepository = AppDataSource.getRepository(User);

    try {
      const userInfoWithBookmarks = await userRepository.findOne({
        where: { id: requestUser.id },
        relations: { bookmarks: true },
      });

      const bookmarks = userInfoWithBookmarks?.bookmarks;

      if (!bookmarks) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: null,
          },
        });
      }

      const hashBookmark = bookmarks.length >= 1;

      const bookmarkIds = bookmarks.map(
        (bookmark) => bookmark.bookmarkProjectId
      );

      if (hashBookmark) {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: bookmarkIds,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmarks: null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
