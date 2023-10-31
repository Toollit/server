import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { Project } from '@/entity/Project';
import { User } from '@/entity/User';
import { ProjectContentImage } from '@/entity/ProjectContentImage';
import { Hashtag } from '@/entity/Hashtag';
import { MemberType } from '@/entity/MemberType';
import { uploadS3 } from '@/middleware/uploadS3';
import { Bookmark } from '@/entity/Bookmark';
import { isLoggedIn } from '@/middleware/loginCheck';
import { ProjectMember } from '@/entity/ProjectMember';
import { ProjectJoinRequest } from '@/entity/ProjectJoinRequest';
import {
  CLIENT_ERROR_LOGIN_REQUIRED,
  CLIENT_ERROR_MEMBER_OF_PROJECT,
  CLIENT_ERROR_NOT_FOUND,
  CLIENT_ERROR_PENDING_APPROVAL,
  CLIENT_ERROR_WRITTEN_BY_ME,
  SERVER_ERROR_DEFAULT,
} from '@/message/error';
import dotenv from 'dotenv';

interface MulterRequest extends Request {
  file?: Express.MulterS3.File | undefined;
  files?:
    | {
        [fieldname: string]: Express.MulterS3.File[];
      }
    | Express.MulterS3.File[]
    | undefined;
}

dotenv.config();

const router = express.Router();

// Project detail api
router.get(
  '/:postId',
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.params.postId);

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
        .where('id = :id', { id: postId })
        .execute();

      const project = await projectRepository.findOne({
        where: { id: postId },
        relations: {
          user: true,
          hashtags: true,
          memberTypes: true,
          comments: true,
          members: true,
        },
        order: {
          memberTypes: {
            id: 'ASC',
          },
        },
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: CLIENT_ERROR_NOT_FOUND,
        });
      }

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
        recruitCount,
        representativeImage,
        members,
      } = project;

      const writer = await userRepository.findOne({
        where: { id: user.id },
        relations: { profile: true },
      });

      const processedHashtagsData = hashtags.map((hashtag) => hashtag.tagName);

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

      const getMembersDetailInfos = members.map((member) => {
        const user = userRepository.findOne({
          where: { id: member.memberId },
          relations: { profile: true },
        });

        return user;
      });

      const memberDetailInfos = await Promise.all(getMembersDetailInfos);

      const memberProfiles = memberDetailInfos.map((user) => {
        return {
          nickname: user?.nickname,
          profileImage: user?.profile.profileImage,
        };
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
            memberCount: members.length,
            recruitCount,
            representativeImage,
          },
          member: {
            profiles: memberProfiles,
          },
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

const handleReqProjectRepresentativeImage = (req: Request) => {
  // If isStringImageData is true, it is the s3 image url or "defaultImage" string. If it is false, the newly delivered image file data is received by putting the file object in the req through the uploadS3 middleware.
  const isStringImageData = Boolean(req.body['projectRepresentativeImage']);
  const imageData = req.body['projectRepresentativeImage'];

  const jsonDataFieldName = 'data';

  const multerS3File = (req as MulterRequest).file;

  const representativeImageUrl = isStringImageData
    ? imageData
    : multerS3File?.location;

  const content = JSON.parse(req.body[jsonDataFieldName]);

  return { representativeImageUrl, content };
};

interface ProjectCreateReqBody {
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
  recruitCount: number;
}

// Project create api
router.post(
  '/create',
  isLoggedIn,
  uploadS3({
    path: 'projectRepresentativeImage',
    option: 'single',
    data: { name: 'projectRepresentativeImage' },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { representativeImageUrl, content } =
      handleReqProjectRepresentativeImage(req);

    if (representativeImageUrl === undefined) {
      return res.status(500).json({
        success: false,
        message: SERVER_ERROR_DEFAULT,
      });
    }

    const user = req.user;

    const {
      title,
      contentHTML,
      contentMarkdown,
      imageUrls,
      hashtags,
      memberTypes,
      recruitCount,
    } = content as ProjectCreateReqBody;

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      await queryRunner.startTransaction();

      const userRepository = queryRunner.manager.getRepository(User);

      const writer = await userRepository.findOne({ where: { id: user?.id } });

      if (writer && hashtags.length >= 1 && memberTypes.length >= 1) {
        const newProject = new Project();
        newProject.title = title;
        newProject.contentHTML = contentHTML;
        newProject.contentMarkdown = contentMarkdown;
        newProject.user = writer;
        newProject.recruitCount = recruitCount;
        newProject.representativeImage = representativeImageUrl;

        const projectRepository = queryRunner.manager.getRepository(Project);

        try {
          const projectData = await projectRepository.save(newProject);

          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(ProjectMember)
            .values({
              projectId: projectData.id,
              memberId: user?.id,
              updatedAt: null,
            })
            .execute();

          const projectContentImageRepository =
            queryRunner.manager.getRepository(ProjectContentImage);

          const imgSaveRequests = imageUrls.map((url: string) => {
            const newProjectContentImage = new ProjectContentImage();
            newProjectContentImage.url = url;
            newProjectContentImage.project = projectData;

            projectContentImageRepository.save(newProjectContentImage);
          });

          await Promise.all(imgSaveRequests);

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

          await queryRunner.commitTransaction();

          return res.status(201).json({
            success: true,
            message: null,
            data: {
              postId: projectData.id,
            },
          });
        } catch (error) {
          return next(error);
        }
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return next(error);
    } finally {
      await queryRunner.release();
    }
  }
);

// API to upload images included in project post
router.post(
  '/content/uploadImage',
  isLoggedIn,
  uploadS3({
    path: 'projectContentImage',
    option: 'single',
    data: { name: 'projectContentImage' },
  }),
  (req: Request, res: Response, next: NextFunction) => {
    const multerS3File = (req as MulterRequest).file;

    const contentImageUrl = multerS3File?.location;

    if (contentImageUrl === undefined) {
      return res.status(500).json({
        success: false,
        message: SERVER_ERROR_DEFAULT,
      });
    }

    return res.status(201).json({
      success: true,
      message: null,
      data: {
        url: contentImageUrl,
      },
    });
  }
);

interface ProjectUpdateReqBody {
  postId: string;
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
  recruitCount: number;
}

// Update project post information api
router.post(
  '/update',
  isLoggedIn,
  uploadS3({
    path: 'projectRepresentativeImage',
    option: 'single',
    data: { name: 'projectRepresentativeImage' },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { representativeImageUrl, content } =
      handleReqProjectRepresentativeImage(req);

    if (representativeImageUrl === undefined) {
      return res.status(500).json({
        success: false,
        message: SERVER_ERROR_DEFAULT,
      });
    }

    const {
      postId,
      title: modifiedTitle,
      contentHTML: modifiedContentHTML,
      contentMarkdown: modifiedContentMarkdown,
      imageUrls: modifiedImageUrls,
      hashtags: modifiedHashtags,
      memberTypes: modifiedMemberTypes,
      recruitCount: modifiedRecruitCount,
    } = content as ProjectUpdateReqBody;

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      await queryRunner.startTransaction();

      const projectRepository = queryRunner.manager.getRepository(Project);

      const existProject = await projectRepository.findOne({
        where: {
          id: Number(postId),
        },
      });

      const dataValidationConditions = !(
        existProject &&
        modifiedHashtags.length >= 1 &&
        modifiedMemberTypes.length >= 1 &&
        modifiedRecruitCount >= 1 &&
        modifiedRecruitCount <= 100
      );

      if (dataValidationConditions) {
        throw new Error();
      }

      const updateTitleContentFields = async () => {
        const modifiedProject = {
          ...existProject,
          title: modifiedTitle,
          contentHTML: modifiedContentHTML,
          contentMarkdown: modifiedContentMarkdown,
        };

        const changedFields: ('title' | 'contentHTML' | 'contentMarkdown')[] =
          [];

        if (existProject.title !== modifiedProject.title) {
          changedFields.push('title');
        }

        if (existProject.contentHTML !== modifiedProject.contentHTML) {
          changedFields.push('contentHTML');
        }

        if (existProject.contentMarkdown !== modifiedProject.contentMarkdown) {
          changedFields.push('contentMarkdown');
        }

        const updateData = changedFields.reduce<{
          [key: string]: string;
        }>((acc, field) => {
          acc[field] = modifiedProject[field];
          return acc;
        }, {});

        const isEqualData = Object.keys(updateData).length === 0;

        if (isEqualData) {
          return null;
        }

        // updateData가 빈 객체라도 createQueryBuilder execute 메소드가 동작하면 업데이트가 된 것 처럼 affected 1을 반환하므로 바로 위에 코드 nothingChange에서 업데이트가 필요없다고 판단되면 null을 반환한다.
        try {
          await queryRunner.manager
            .createQueryBuilder()
            .update(Project)
            .set(updateData)
            .where('id = :id', { id: existProject.id })
            .execute();
        } catch (error) {
          next(error);
        }
      };

      const updateProjectContentImages = async () => {
        try {
          const existProjectContentImages = await queryRunner.manager
            .getRepository(ProjectContentImage)
            .createQueryBuilder()
            .where('ProjectContentImage.projectId = :postId', {
              postId: Number(postId),
            })
            .getMany();

          const existImages = existProjectContentImages.map((image) => {
            return image.url;
          });

          // image url deleted from exist content
          const toBeDeletedImages = existImages.filter(
            (value) => !modifiedImageUrls.includes(value)
          );

          // image url added from exist content
          const toBeAddedImages = modifiedImageUrls.filter(
            (value) => !existImages.includes(value)
          );

          const isEqualData =
            toBeDeletedImages.length === 0 && toBeAddedImages.length === 0;

          // If no data has been changed, return true
          if (isEqualData) {
            return null;
          }

          const deleteImageRequests = toBeDeletedImages.map((url: string) => {
            const request = queryRunner.manager
              .createQueryBuilder()
              .delete()
              .from(ProjectContentImage)
              .where('projectId = :postId', { postId: Number(postId) })
              .andWhere('url = :url', { url })
              .execute();

            return request;
          });

          await Promise.all(deleteImageRequests);

          const addProcessedProjectContentImages = toBeAddedImages.map(
            (url) => {
              return { url, project: existProject };
            }
          );

          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(ProjectContentImage)
            .values([...addProcessedProjectContentImages])
            .execute();
        } catch (error) {
          next(error);
        }
      };

      const updateProjectHashtags = async () => {
        try {
          const existProjectHashtags = await queryRunner.manager
            .getRepository(Hashtag)
            .createQueryBuilder()
            .where('hashtag.projectId = :postId', { postId: Number(postId) })
            .getMany();

          const existHashtags = existProjectHashtags.map((hashtag) => {
            return hashtag.tagName;
          });

          const isEqualData = (
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

          if (isEqualData(existHashtags, modifiedHashtags)) {
            return null;
          }

          const deleteHashtagRequests = existHashtags.map((tagName: string) => {
            const result = queryRunner.manager
              .createQueryBuilder()
              .delete()
              .from(Hashtag)
              .where('projectId = :postId', { postId: Number(postId) })
              .andWhere('tagName = :tagName', { tagName })
              .execute();

            return result;
          });

          await Promise.all(deleteHashtagRequests);

          const addProcessedHashtags = modifiedHashtags.map((hashtag) => {
            return { tagName: hashtag, project: existProject };
          });

          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(Hashtag)
            .values([...addProcessedHashtags])
            .execute();
        } catch (error) {
          next(error);
        }
      };

      const updateProjectMemberTypes = async () => {
        const existProjectMemberTypes = await queryRunner.manager
          .getRepository(MemberType)
          .createQueryBuilder()
          .where('memberType.projectId = :postId', {
            postId: Number(postId),
          })
          .getMany();

        const existMemberTypes = existProjectMemberTypes.map((memberType) => {
          return memberType.type;
        });

        const toBeDeletedMemberTypes = existMemberTypes.filter(
          (value) => !modifiedMemberTypes.includes(value)
        );

        const toBeAddedMemberTypes = modifiedMemberTypes.filter(
          (value) => !existMemberTypes.includes(value)
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
              .where('projectId = :postId', { postId: Number(postId) })
              .andWhere('type = :type', { type })
              .execute();

            return result;
          }
        );

        await Promise.all(deleteMemberTypeRequests);

        const addProcessedMemberTypes = toBeAddedMemberTypes.map((type) => {
          return { type, project: existProject };
        });

        try {
          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(MemberType)
            .values([...addProcessedMemberTypes])
            .execute();
        } catch (error) {
          next(error);
        }
      };

      const updateProjectRecruitCount = async () => {
        try {
          const existRecruitCount = existProject?.recruitCount;

          if (!existRecruitCount) {
            throw new Error();
          }

          const isDataEqual = (existData: number, newData: number) => {
            if (existData !== newData) {
              return false;
            }

            return true;
          };

          if (isDataEqual(existRecruitCount, modifiedRecruitCount)) {
            return null;
          }

          await queryRunner.manager
            .createQueryBuilder()
            .update(Project)
            .set({ recruitCount: modifiedRecruitCount })
            .where('id = :postId', { postId: Number(postId) })
            .execute();
        } catch (error) {
          next(error);
        }
      };

      const updateProjectRepresentativeImage = async () => {
        try {
          const existRepresentativeImage = existProject?.representativeImage;

          if (!existRepresentativeImage) {
            throw new Error();
          }

          const isDataEqual = (existData: string, newData: string) => {
            if (existData !== newData) {
              return false;
            }

            return true;
          };

          if (isDataEqual(existRepresentativeImage, representativeImageUrl)) {
            return null;
          }

          await queryRunner.manager
            .createQueryBuilder()
            .update(Project)
            .set({ representativeImage: representativeImageUrl })
            .where('id = :postId', { postId: Number(postId) })
            .execute();
        } catch (error) {
          next(error);
        }
      };

      await Promise.all([
        updateTitleContentFields(),
        updateProjectContentImages(),
        updateProjectHashtags(),
        updateProjectMemberTypes(),
        updateProjectRecruitCount(),
        updateProjectRepresentativeImage(),
      ]);

      await queryRunner.commitTransaction();

      return res.status(200).json({
        success: true,
        message: null,
        data: { postId },
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return next(error);
    } finally {
      await queryRunner.release();
    }
  }
);

interface PostDeleteReqBody {
  postId: string;
}

// Delete project post api
router.post(
  '/delete',
  isLoggedIn,
  async (
    req: Request<{}, {}, PostDeleteReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const { postId } = req.body;

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      await queryRunner.startTransaction();

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(Bookmark)
        .where('projectId = :postId', { postId })
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(ProjectJoinRequest)
        .where('projectId = :postId', { postId })
        .execute();

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(ProjectContentImage)
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
        .from(ProjectMember)
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
        message: null,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return next(error);
    } finally {
      await queryRunner.release();
    }
  }
);

interface ProjectBookmarkReqBody {
  postId: string;
}

// Project bookmark api
router.post(
  '/bookmark',
  isLoggedIn,
  async (
    req: Request<{}, {}, ProjectBookmarkReqBody>,
    res: Response,
    next: NextFunction
  ) => {
    const postId = Number(req.body.postId);
    const requestUser = req.user;

    if (!requestUser) {
      return res.status(401).json({
        success: false,
        message: CLIENT_ERROR_LOGIN_REQUIRED,
      });
    }

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      await queryRunner.startTransaction();

      const existBookmark = await queryRunner.manager
        .getRepository(Bookmark)
        .findOne({
          where: { userId: requestUser.id, projectId: postId },
        });

      // Cancel exist bookmark
      if (existBookmark) {
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Bookmark)
          .where('id = :id', { id: existBookmark.id })
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            status: 'cancel',
          },
        });
      }

      // Save new bookmark
      if (!existBookmark) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Bookmark)
          .values([{ userId: requestUser.id, projectId: postId }])
          .execute();

        await queryRunner.commitTransaction();

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            status: 'save',
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
);

// API to check project bookmark status
router.get(
  '/:postId/bookmarkStatus',
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
            projectId: postId,
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

router.post(
  '/join',
  isLoggedIn,
  async (req: Request, res: Response, next: NextFunction) => {
    const requestUser = req.user;
    const postId = Number(req.body.postId);

    if (!requestUser) {
      return res.status(401).json({
        success: false,
        message: CLIENT_ERROR_LOGIN_REQUIRED,
      });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);

      const project = await projectRepository.findOne({
        where: {
          id: postId,
        },
        relations: { user: true },
      });

      if (!project) {
        throw new Error('project does not exist');
      }

      const isMyPost = requestUser?.id === project?.user.id;

      if (isMyPost) {
        return res.status(403).json({
          success: false,
          message: CLIENT_ERROR_WRITTEN_BY_ME,
        });
      }

      const isExistMember = await AppDataSource.getRepository(ProjectMember)
        .createQueryBuilder('projectMember')
        .where('projectMember.projectId = :projectId', { projectId: postId })
        .andWhere('projectMember.memberId = :memberId', {
          memberId: requestUser.id,
        })
        .getOne();

      if (isExistMember) {
        return res.status(403).json({
          success: false,
          message: CLIENT_ERROR_MEMBER_OF_PROJECT,
        });
      }

      const isExistJoinRequest = await AppDataSource.getRepository(
        ProjectJoinRequest
      )
        .createQueryBuilder('projectJoinRequest')
        .where('projectJoinRequest.projectId = :projectId', {
          projectId: postId,
        })
        .andWhere('projectJoinRequest.requestUserId = :requestUserId', {
          requestUserId: requestUser.id,
        })
        .getOne();

      if (isExistJoinRequest) {
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_PENDING_APPROVAL,
        });
      }

      await AppDataSource.createQueryBuilder()
        .insert()
        .into(ProjectJoinRequest)
        .values({
          projectId: postId,
          requestUserId: requestUser.id,
          updatedAt: null,
        })
        .execute();

      return res.status(200).json({
        success: true,
        message: null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
