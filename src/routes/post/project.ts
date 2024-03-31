import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
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
  CLIENT_ERROR_NOT_EXIST_USER,
  CLIENT_ERROR_NOT_FOUND,
  CLIENT_ERROR_PENDING_APPROVAL,
  CLIENT_ERROR_PROJECT_NOT_FOUND,
  CLIENT_ERROR_RECRUITMENT_COMPLETED,
  CLIENT_ERROR_WRITTEN_BY_ME,
} from '@/message/error';

interface MulterRequest extends Request {
  file?: Express.MulterS3.File | undefined;
  files?:
    | {
        [fieldname: string]: Express.MulterS3.File[];
      }
    | Express.MulterS3.File[]
    | undefined;
}

const router = express.Router();

// Project detail info router
router.get(
  '/:postId',
  async (req: Request, res: Response, next: NextFunction) => {
    const postId = Number(req.params.postId);
    const modifyRequest = req.headers.modify;

    const projectRepository = AppDataSource.getRepository(Project);
    const userRepository = AppDataSource.getRepository(User);

    try {
      // Increasing the number of views each time a post is viewed
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

      // Sorts in order of developer, designer, pm, and anyone
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

const handleProjectFormData = (req: Request) => {
  // If isStringImageData is true, it is the s3 image url or "defaultImage" string. If it is false, the newly delivered image file data is received by putting the file object in the req through the uploadS3 middleware.
  const isStringImageData = Boolean(req.body['projectRepresentativeImage']);
  const imageData: string = req.body['projectRepresentativeImage'];

  const jsonDataFieldName = 'data';

  const S3ImgUrl = (req as MulterRequest).file?.location;

  const representativeImageUrl = isStringImageData ? imageData : S3ImgUrl;

  const content = JSON.parse(req.body[jsonDataFieldName]);

  return { representativeImageUrl, content };
};

interface ProjectCreateContent {
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
  recruitCount: number;
}

// Project create router. FormData format and the json format cannot be sent as requests at the same time. so image file and content data are received in the FormData format.
router.post(
  '/create',
  isLoggedIn,
  uploadS3({
    path: 'projectRepresentativeImage',
    option: 'single',
    data: { name: 'projectRepresentativeImage' },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { representativeImageUrl, content } = handleProjectFormData(req);

    if (representativeImageUrl === undefined) {
      return next(new Error('Something wrong with representative image url'));
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
    } = content as ProjectCreateContent;

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const userRepository = queryRunner.manager.getRepository(User);

      const writer = await userRepository.findOne({
        where: { id: currentUser.id },
      });

      if (!(writer && hashtags.length >= 1 && memberTypes.length >= 1)) {
        throw new Error('Something wrong with the writer or content data');
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

// Attach images to project content router
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
      return next(new Error('Something wrong with content image url'));
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

interface ProjectUpdateContent {
  postId: string;
  title: string;
  contentHTML: string;
  contentMarkdown: string;
  imageUrls: string[];
  hashtags: string[];
  memberTypes: ('developer' | 'designer' | 'pm' | 'anyone')[];
  recruitCount: number;
}

// Update project detail info router. FormData format and the json format cannot be sent as requests at the same time. so image file and content data are received in the FormData format.
router.post(
  '/update',
  isLoggedIn,
  uploadS3({
    path: 'projectRepresentativeImage',
    option: 'single',
    data: { name: 'projectRepresentativeImage' },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    const { representativeImageUrl, content } = handleProjectFormData(req);

    if (representativeImageUrl === undefined) {
      return next(new Error('Something wrong with representative image url'));
    }

    const {
      postId: modifiedPostId,
      title: modifiedTitle,
      contentHTML: modifiedContentHTML,
      contentMarkdown: modifiedContentMarkdown,
      imageUrls: modifiedImageUrls,
      hashtags: modifiedHashtags,
      memberTypes: modifiedMemberTypes,
      recruitCount: modifiedRecruitCount,
    } = content as ProjectUpdateContent;

    const postId = Number(modifiedPostId);

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const projectRepository = queryRunner.manager.getRepository(Project);

      const existProject = await projectRepository.findOne({
        where: {
          id: postId,
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
          .where('ProjectContentImage.projectId = :postId', { postId })
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
            .where('projectId = :postId', { postId })
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
          .where('hashtag.projectId = :postId', { postId })
          .getMany();
        console.log('existProjectHashtags ===>', existProjectHashtags);

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
          console.log(
            'isEqualData ===> ',
            isEqualData(existHashtags, modifiedHashtags)
          );
          return null;
        }

        const deleteHashtagRequests = existHashtags.map((tagName: string) => {
          const result = queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(Hashtag)
            .where('projectId = :postId', { postId })
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
          .where('memberType.projectId = :postId', { postId })
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
              .where('projectId = :postId', { postId })
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

        const members = await queryRunner.manager
          .getRepository(ProjectMember)
          .createQueryBuilder()
          .where('projectId = :postId', { postId })
          .getCount();

        // -1 is writer
        const memberCount = members - 1;

        if (modifiedRecruitCount < memberCount) {
          throw new Error(
            'Recruit count cannot set smaller than the current member count.'
          );
        }

        await queryRunner.manager
          .createQueryBuilder()
          .update(Project)
          .set({ recruitCount: modifiedRecruitCount })
          .where('id = :postId', { postId })
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
          .where('id = :postId', { postId })
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

interface PostDeleteReqBody {
  postId: string;
}

// Delete project router
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

      const members = await AppDataSource.getRepository(ProjectMember)
        .createQueryBuilder('projectMember')
        .where('projectMember.projectId = :projectId', { projectId: postId })
        .getMany();

      // Reason for -1 in members.length is that the author is not included in the number of recruits.
      const recruitCount = project.recruitCount;
      const currentMemberCount = members.length - 1;
      if (recruitCount === currentMemberCount) {
        // throw new Error('Project member recruitment completed ');
        return res.status(400).json({
          success: false,
          message: CLIENT_ERROR_RECRUITMENT_COMPLETED,
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

interface ProjectLeaveReqBody {
  postId: string;
}

// Project leave request router
router.post(
  '/leave',
  isLoggedIn,
  async (
    req: Request<{}, {}, ProjectLeaveReqBody>,
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

      if (!isExistMember) {
        return res.status(403).json({
          success: false,
          message: CLIENT_ERROR_ABNORMAL_ACCESS,
        });
      }

      await queryRunner.connect();
      await queryRunner.startTransaction();

      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(ProjectMember)
        .where('memberId = :id', { id: currentUser.id })
        .execute();

      const members = await queryRunner.manager
        .getRepository(ProjectMember)
        .createQueryBuilder('projectMember')
        .where('projectMember.projectId = :projectId', { projectId: postId })
        .getMany();

      if (members.length < 1) {
        throw new Error(
          'Project creator must be included, so it must be at least 1.'
        );
      }

      const createNotifications = members.map(async (member) => {
        const user = await queryRunner.manager
          .getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: member.memberId })
          .getOne();

        if (!user) {
          throw new Error('Create notifications error');
        }

        return await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(Notification)
          .values({
            type: 'projectLeave',
            isRead: false,
            content: JSON.stringify({
              projectId: postId,
              notificationCreatorId: currentUser.id,
            }),
            updatedAt: null,
            user: user, // This field is intended to set the user who will receive the notification. This notification is sent to the project members
          })
          .execute();
      });

      await Promise.all(createNotifications);

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

// TODO ParamsDictionary 타입 문제 어떤식으로 처리할지 확인하기
// interface ProjectJoinApprovalStatusReqParams {
//   [key: string]: 'approve' | 'reject';
// }

interface ProjectJoinApprovalStatusReqBody {
  notificationId: number;
}

// Project join request notifications approve or reject control router
router.post(
  `/join/:approvalStatus`,
  isLoggedIn,
  async (
    req: Request<
      { approvalStatus: 'approve' | 'reject' },
      {},
      ProjectJoinApprovalStatusReqBody
    >,
    res: Response,
    next: NextFunction
  ) => {
    const currentUser = req.user;
    const { approvalStatus } = req.params;
    const { notificationId } = req.body;

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

      const project = await queryRunner.manager
        .getRepository(Project)
        .createQueryBuilder('project')
        .where('project.id = :id', { id: projectId })
        .getOne();

      if (!project) {
        // Delete notification from current user notification list
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(Notification)
          .where('id = :id', { id: notificationId })
          .execute();

        await queryRunner.commitTransaction();

        return res.status(409).json({
          success: false,
          message: CLIENT_ERROR_PROJECT_NOT_FOUND,
        });
      }

      if (approvalStatus === 'approve') {
        const members = await AppDataSource.getRepository(ProjectMember)
          .createQueryBuilder('projectMember')
          .where('projectMember.projectId = :projectId', { projectId })
          .getMany();

        // Reason for -1 in members.length is that the author is not included in the number of recruits.
        const recruitCount = project.recruitCount;
        const currentMemberCount = members.length - 1;
        if (recruitCount === currentMemberCount) {
          // throw new Error('Project member recruitment completed ');

          // Delete notification from current user notification list
          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(Notification)
            .where('id = :id', { id: notificationId })
            .execute();

          await queryRunner.commitTransaction();

          return res.status(400).json({
            success: false,
            message: CLIENT_ERROR_RECRUITMENT_COMPLETED,
          });
        }

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
          await queryRunner.commitTransaction();

          return res.status(404).json({
            success: false,
            message: CLIENT_ERROR_NOT_EXIST_USER,
          });
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
      }

      if (approvalStatus === 'reject') {
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
          await queryRunner.commitTransaction();

          return res.status(404).json({
            success: false,
            message: CLIENT_ERROR_NOT_EXIST_USER,
          });
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
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();
      return next(err);
    } finally {
      await queryRunner.release();
    }
  }
);

export default router;
