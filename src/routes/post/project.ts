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
import { Notification } from '@/entity/Notification';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_LOGIN_REQUIRED,
  CLIENT_ERROR_MEMBER_OF_PROJECT,
  CLIENT_ERROR_NOT_FOUND,
  CLIENT_ERROR_PENDING_APPROVAL,
  CLIENT_ERROR_WRITTEN_BY_ME,
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

// project detail info
router.get(
  '/:postId',
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.params.postId);
    const modifyRequest = req.headers.modify;

    const projectRepository = AppDataSource.getRepository(Project);
    const userRepository = AppDataSource.getRepository(User);

    try {
      // increasing the number of views each time a post is viewed
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

      // sorts in order of developer, designer, pm, and anyone
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
    } catch (err) {
      return next(err);
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

interface ProjectCreateReq {
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
  recruitCount: number;
}

// project create
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
      return next(new Error('something wrong with representative image url'));
    }

    const currentUser = req.user;

    if (!currentUser) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }

    const {
      title,
      contentHTML,
      contentMarkdown,
      imageUrls,
      hashtags,
      memberTypes,
      recruitCount,
    } = content as ProjectCreateReq;

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const userRepository = queryRunner.manager.getRepository(User);

      const writer = await userRepository.findOne({
        where: { id: currentUser.id },
      });

      if (!(writer && hashtags.length >= 1 && memberTypes.length >= 1)) {
        throw new Error('something wrong with the writer or content data');
      }

      const newProject = new Project();
      newProject.title = title;
      newProject.contentHTML = contentHTML;
      newProject.contentMarkdown = contentMarkdown;
      newProject.user = writer;
      newProject.recruitCount = recruitCount;
      newProject.representativeImage = representativeImageUrl;

      const projectRepository = queryRunner.manager.getRepository(Project);

      const projectData = await projectRepository.save(newProject);

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(ProjectMember)
        .values({
          projectId: projectData.id,
          memberId: currentUser.id,
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

// attach images to project content
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
      return next(new Error('something wrong with content image url'));
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

interface ProjectUpdateReq {
  postId: string;
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
  recruitCount: number;
}

// Update project detail info
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
      return next(new Error('Something wrong with representative image url'));
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
    } = content as ProjectUpdateReq;

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

      const isValidData =
        existProject &&
        modifiedHashtags.length >= 1 &&
        modifiedMemberTypes.length >= 1 &&
        modifiedRecruitCount >= 1 &&
        modifiedRecruitCount <= 100;

      if (!isValidData) {
        throw new Error('Conditions of the data are not correct');
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

        // When the createQueryBuilder execute method operates, there is a problem of returning affected 1 by recognizing that it has been updated even if an empty object is delivered.
        // Therefore, if updateData is an empty object, it should be prevented from running the logic below.
        await queryRunner.manager
          .createQueryBuilder()
          .update(Project)
          .set(updateData)
          .where('id = :id', { id: existProject.id })
          .execute();
      };

      const updateProjectContentImages = async () => {
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

        // Image url deleted from exist content
        const toBeDeletedImages = existImages.filter(
          (value) => !modifiedImageUrls.includes(value)
        );

        // Image url added from exist content
        const toBeAddedImages = modifiedImageUrls.filter(
          (value) => !existImages.includes(value)
        );

        const isEqualData =
          toBeDeletedImages.length === 0 && toBeAddedImages.length === 0;

        // If there is no changed data, return null
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

        const addProcessedProjectContentImages = toBeAddedImages.map((url) => {
          return { url, project: existProject };
        });

        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(ProjectContentImage)
          .values([...addProcessedProjectContentImages])
          .execute();
      };

      const updateProjectHashtags = async () => {
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

        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(MemberType)
          .values([...addProcessedMemberTypes])
          .execute();
      };

      const updateProjectRecruitCount = async () => {
        const existRecruitCount = existProject.recruitCount;

        const isEqualData = (existData: number, newData: number) => {
          if (existData !== newData) {
            return false;
          }

          return true;
        };

        if (isEqualData(existRecruitCount, modifiedRecruitCount)) {
          return null;
        }

        await queryRunner.manager
          .createQueryBuilder()
          .update(Project)
          .set({ recruitCount: modifiedRecruitCount })
          .where('id = :postId', { postId: Number(postId) })
          .execute();
      };

      const updateProjectRepresentativeImage = async () => {
        const existRepresentativeImage = existProject.representativeImage;

        const isEqualData = (existData: string, newData: string) => {
          if (existData !== newData) {
            return false;
          }

          return true;
        };

        if (isEqualData(existRepresentativeImage, representativeImageUrl)) {
          return null;
        }

        await queryRunner.manager
          .createQueryBuilder()
          .update(Project)
          .set({ representativeImage: representativeImageUrl })
          .where('id = :postId', { postId: Number(postId) })
          .execute();
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

interface PostDeleteReq {
  postId: string;
}

// Delete project
router.post(
  '/delete',
  isLoggedIn,
  async (
    req: Request<{}, {}, PostDeleteReq>,
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

interface ProjectBookmarkReq {
  postId: string;
}

// Project bookmark
router.post(
  '/bookmark',
  isLoggedIn,
  async (
    req: Request<{}, {}, ProjectBookmarkReq>,
    res: Response,
    next: NextFunction
  ) => {
    const postId = Number(req.body.postId);
    const currentUser = req.user;

    if (!currentUser) {
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
          where: { userId: currentUser.id, projectId: postId },
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
          .values([{ userId: currentUser.id, projectId: postId }])
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

// Check project detail bookmark status
router.get(
  '/:postId/bookmarkStatus',
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.params.postId);
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(200).json({
        success: true,
        message: null,
        data: {
          bookmark: false,
        },
      });
    }

    const bookmarkRepository = AppDataSource.getRepository(Bookmark);

    try {
      const isBookmarked = await bookmarkRepository.findOne({
        where: {
          userId: currentUser.id,
          projectId: postId,
        },
      });

      if (isBookmarked) {
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
    } catch (err) {
      return next(err);
    }
  }
);

// Project join request router
router.post(
  '/join',
  isLoggedIn,
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.body.postId);
    const currentUser = req.user;

    if (!currentUser) {
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
        throw new Error('Project does not exist');
      }

      const isMyPost = currentUser?.id === project?.user.id;

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
          memberId: currentUser.id,
        })
        .getOne();

      if (isExistMember) {
        return res.status(403).json({
          success: false,
          message: CLIENT_ERROR_MEMBER_OF_PROJECT,
        });
      }

      const projectJoinRequests = await AppDataSource.getRepository(
        Notification
      )
        .createQueryBuilder('notification')
        .where('notification.type = :type', {
          type: 'projectJoinRequest',
        })
        .getMany();

      const isExistJoinRequest = projectJoinRequests.find((request) => {
        const { projectId, notificationCreatorId } = JSON.parse(
          request.content
        );

        return projectId === postId && notificationCreatorId === currentUser.id;
      });

      if (isExistJoinRequest) {
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_PENDING_APPROVAL,
        });
      }

      await AppDataSource.createQueryBuilder()
        .insert()
        .into(Notification)
        .values({
          type: 'projectJoinRequest',
          isRead: false,
          content: JSON.stringify({
            projectId: postId,
            notificationCreatorId: currentUser.id,
          }),
          updatedAt: null,
          user: project?.user, // This field is intended to set the user who will receive the notification. This notification is sent to the project writer.
        })
        .execute();

      return res.status(200).json({
        success: true,
        message: null,
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  `/join/:status`,
  isLoggedIn,
  async (
    req: Request<
      { status: 'approve' | 'reject' },
      {},
      { notificationId: number }
    >,
    res: Response,
    next: NextFunction
  ) => {
    const currentUser = req.user;
    const { status } = req.params;
    const { notificationId } = req.body;

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: CLIENT_ERROR_LOGIN_REQUIRED,
      });
    }

    const queryRunner = AppDataSource.createQueryRunner();

    if (status === 'approve') {
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const notification = await queryRunner.manager
          .getRepository(Notification)
          .createQueryBuilder('notification')
          .where('notification.id = :id', { id: notificationId })
          .getOne();

        if (!notification) {
          throw new Error('Notification does not exist');
        }

        const {
          projectId,
          notificationCreatorId,
        }: {
          projectId: number;
          notificationCreatorId: number;
        } = JSON.parse(notification.content);

        // Project join Request user add project member
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(ProjectMember)
          .values({
            projectId,
            memberId: notificationCreatorId,
            updatedAt: null,
          })
          .execute();

        // Delete notification from current user notification list
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Notification)
          .where('id = :id', { id: notificationId })
          .execute();

        const projectJoinRequestUser = await queryRunner.manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: notificationCreatorId })
          .getOne();

        if (!projectJoinRequestUser) {
          throw new Error('User does not exist');
        }

        // Send approve notification to project join request user
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Notification)
          .values({
            type: 'projectJoinApprove',
            isRead: false,
            content: JSON.stringify({
              projectId,
              notificationCreatorId: currentUser.id,
            }),
            updatedAt: null,
            user: projectJoinRequestUser,
          })
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

    if (status === 'reject') {
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();

        const notification = await queryRunner.manager
          .getRepository(Notification)
          .createQueryBuilder('notification')
          .where('notification.id = :id', { id: notificationId })
          .getOne();

        if (!notification) {
          throw new Error('Notification does not exist');
        }

        const {
          projectId,
          notificationCreatorId,
        }: {
          projectId: number;
          notificationCreatorId: number;
        } = JSON.parse(notification.content);

        // Delete notification from current user notification list
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Notification)
          .where('id = :id', { id: notificationId })
          .execute();

        const projectJoinRequestUser = await queryRunner.manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: notificationCreatorId })
          .getOne();

        if (!projectJoinRequestUser) {
          throw new Error('User does not exist');
        }

        // Send reject notification to project join request user
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Notification)
          .values({
            type: 'projectJoinReject',
            isRead: false,
            content: JSON.stringify({
              projectId,
              notificationCreatorId: currentUser.id,
            }),
            updatedAt: null,
            user: projectJoinRequestUser,
          })
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

    return res.status(200).json({
      test: true,
    });
  }
);

export default router;
