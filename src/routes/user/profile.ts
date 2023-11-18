import express, { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/data-source';
import { User } from '@/entity/User';
import { Project } from '@/entity/Project';
import { Profile } from '@/entity/Profile';
import { uploadS3 } from '@/middleware/uploadS3';
import dotenv from 'dotenv';
import { isLoggedIn } from '@/middleware/loginCheck';
import { Bookmark } from '@/entity/Bookmark';
import {
  CLIENT_ERROR_ABNORMAL_ACCESS,
  CLIENT_ERROR_INTRODUCE_LENGTH_LIMIT,
  CLIENT_ERROR_NICKNAME_ALREADY_EXIST,
  CLIENT_ERROR_NICKNAME_LENGTH_TWO_TO_TWENTY,
  CLIENT_ERROR_NICKNAME_ONLY_NO_SPACE_ENGLISH_NUMBER,
  CLIENT_ERROR_NOT_EXIST_USER,
} from '@/message/error';
import { Notification } from '@/entity/Notification';

dotenv.config();

const router = express.Router();

interface ProfileRequestParams {
  nickname: string;
}

interface ProfileResponseBody {}

interface ProfileRequestBody {}

interface ProfileRequestQuery {
  tab: 'viewProfile' | 'viewProjects' | 'viewBookmarks' | 'viewAlarms';
  count?: number;
}

// Profile page user exist check router
router.get(
  '/:nickname/existCheck',
  async (req: Request, res: Response, next: NextFunction) => {
    const nickname = req.params.nickname;

    try {
      const existUser = await AppDataSource.getRepository(User)
        .createQueryBuilder('user')
        .where('user.nickname = :nickname', { nickname })
        .getOne();

      if (!existUser) {
        return res.status(404).json({
          success: false,
          message: CLIENT_ERROR_NOT_EXIST_USER,
          data: {
            existUser: false,
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: null,
        data: {
          existUser: true,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Profile page user profile image router
router.get(
  '/:nickname/profileImage',
  async (req: Request, res: Response, next: NextFunction) => {
    const profileNickname = req.params.nickname;

    try {
      const existUser = await AppDataSource.getRepository(User)
        .createQueryBuilder('user')
        .where('user.nickname = :nickname', { nickname: profileNickname })
        .leftJoinAndSelect('user.profile', 'profile')
        .getOne();

      if (!existUser) {
        return res.status(404).json({
          success: false,
          message: CLIENT_ERROR_NOT_EXIST_USER,
        });
      }

      const {
        profile: { profileImage: url },
      } = existUser;

      return res.status(200).json({
        success: true,
        message: null,
        data: { profileImage: url },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Profile page profile info, projects, bookmarks, alarms router
router.get(
  '/:nickname',
  async (
    req: Request<
      ProfileRequestParams,
      ProfileResponseBody,
      ProfileRequestBody,
      ProfileRequestQuery
    >,
    res: Response,
    next: NextFunction
  ) => {
    const requestUser = req.user;
    const profileNickname = req.params.nickname;
    const { tab, count } = req.query;

    try {
      if (tab === 'viewProfile') {
        const user = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.nickname = :nickname', { nickname: profileNickname })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        if (!user) {
          return res.status(404).json({
            success: false,
            message: CLIENT_ERROR_NOT_EXIST_USER,
          });
        }

        const { email, nickname, signUpType, createdAt, lastLoginAt, profile } =
          user;

        const {
          introduce,
          onOffline,
          place,
          contactTime,
          interests,
          career,
          skills,
        } = profile;

        // Look up user's own profile
        if (requestUser?.nickname === nickname) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              email,
              nickname,
              signUpType,
              createdAt,
              lastLoginAt,
              introduce,
              onOffline,
              place,
              contactTime,
              interests,
              career,
              skills,
            },
          });
        }

        // Look up other user's profile
        if (requestUser?.nickname !== nickname) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              nickname,
              createdAt,
              lastLoginAt,
              introduce,
              onOffline,
              place,
              contactTime,
              interests,
              career,
              skills,
            },
          });
        }
      }

      if (tab === 'viewProjects') {
        const user = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.nickname = :nickname', { nickname: profileNickname })
          .getOne();

        if (!user) {
          return res.status(404).json({
            success: false,
            message: CLIENT_ERROR_NOT_EXIST_USER,
          });
        }

        const myProjectTotalCount = await AppDataSource.getRepository(Project)
          .createQueryBuilder('project')
          .where('project.user = :userId', { userId: user.id })
          .getCount();

        const projects = await AppDataSource.getRepository(Project)
          .createQueryBuilder('project')
          .where('project.user = :userId', { userId: user.id })
          .leftJoinAndSelect('project.memberTypes', 'memberTypes')
          .leftJoinAndSelect('project.hashtags', 'hashtags')
          .leftJoinAndSelect('project.members', 'members')
          .orderBy('project.id', 'DESC')
          .skip(count ? count - 5 : 0)
          .take(5)
          .getMany();

        if (projects.length < 1) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              projects, // projects is empty array [] if projects length is under 1.
              total: myProjectTotalCount,
            },
          });
        }

        const processedData = await Promise.all(
          projects.map(async (project) => {
            const extractTagNames = project.hashtags.map(
              (hashtag) => hashtag.tagName
            );

            const extractMemberTypes = project.memberTypes.map(
              (memberType) => memberType.type
            );

            // Order of developer, designer, pm, anyone
            const orderedMemberTypes = extractMemberTypes.sort(function (a, b) {
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

            const projectBookmarkedTotalCount =
              await AppDataSource.getRepository(Bookmark)
                .createQueryBuilder('bookmark')
                .where('bookmark.projectId = projectId', {
                  projectId: project.id,
                })
                .getCount();

            const memberCount = project.members.length - 1; // Exclude project writer

            return {
              id: project.id,
              title: project.title,
              views: project.views,
              bookmarkCount: projectBookmarkedTotalCount,
              hashtags: extractTagNames,
              memberTypes: orderedMemberTypes,
              memberCount,
              recruitCount: project.recruitCount,
            };
          })
        );

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            projects: processedData,
            total: myProjectTotalCount,
          },
        });
      }

      if (tab === 'viewBookmarks') {
        const user = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.nickname = :nickname', { nickname: profileNickname })
          .getOne();

        if (!user) {
          return res.status(404).json({
            success: false,
            message: CLIENT_ERROR_NOT_EXIST_USER,
          });
        }

        const myBookmarkTotalCount = await AppDataSource.getRepository(Bookmark)
          .createQueryBuilder('bookmark')
          .where('bookmark.userId = :userId', { userId: user.id })
          .getCount();

        const bookmarks = await AppDataSource.getRepository(Bookmark)
          .createQueryBuilder('bookmark')
          .where('bookmark.userId = :userId', { userId: user.id })
          .leftJoinAndSelect('bookmark.project', 'project')
          .leftJoinAndSelect('project.hashtags', 'hashtags')
          .leftJoinAndSelect('project.memberTypes', 'memberTypes')
          .leftJoinAndSelect('project.members', 'members')
          .orderBy('bookmark.id', 'DESC')
          .skip(count ? count - 5 : 0)
          .take(5)
          .getMany();

        const bookmarkProjects = bookmarks.map((v) => {
          return v.project;
        });

        if (bookmarkProjects.length < 1) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              bookmarkProjects, // bookmarkProjects is empty array [] if bookmarkProjects length is under 1.
              total: myBookmarkTotalCount,
            },
          });
        }

        const processedData = await Promise.all(
          bookmarkProjects.map(async (project) => {
            const extractTagNames = project.hashtags.map(
              (hashtag) => hashtag.tagName
            );

            const extractMemberTypes = project.memberTypes.map(
              (memberType) => memberType.type
            );

            // Order of developer, designer, pm, anyone
            const orderedMemberTypes = extractMemberTypes?.sort(function (
              a,
              b
            ) {
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

            const projectBookmarkedTotalCount =
              await AppDataSource.getRepository(Bookmark)
                .createQueryBuilder('bookmark')
                .where('bookmark.projectId = projectId', {
                  projectId: project.id,
                })
                .getCount();

            const memberCount = project.members.length - 1; // Exclude project writer

            return {
              id: project.id,
              title: project.title,
              views: project.views,
              bookmarkCount: projectBookmarkedTotalCount,
              hashtags: extractTagNames,
              memberTypes: orderedMemberTypes,
              memberCount,
              recruitCount: project.recruitCount,
            };
          })
        );

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: processedData,
            total: myBookmarkTotalCount,
          },
        });
      }

      if (tab === 'viewAlarms') {
        const user = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.nickname = :nickname', { nickname: profileNickname })
          .getOne();

        if (!user) {
          return res.status(404).json({
            success: false,
            message: CLIENT_ERROR_NOT_EXIST_USER,
          });
        }

        const notifications = await AppDataSource.getRepository(Notification)
          .createQueryBuilder('notification')
          .where('notification.userId = :userId', { userId: user.id })
          .orderBy('notification.createdAt', 'DESC')
          .getMany();

        const projectJoinRequestNotifications = notifications.filter(
          (v) => v.type === 'projectJoinRequest'
        );
        const approveProjectJoinRequestNotifications = notifications.filter(
          (v) => v.type === 'projectJoinApprove'
        );
        const rejectProjectJoinRequestNotifications = notifications.filter(
          (v) => v.type === 'projectJoinReject'
        );

        const projects = await Promise.all(
          projectJoinRequestNotifications.map(async (request) => {
            const { projectId, requestUserId } = JSON.parse(request.content);

            const project = await AppDataSource.getRepository(Project)
              .createQueryBuilder('project')
              .where('project.id = :projectId', { projectId })
              .leftJoinAndSelect('project.memberTypes', 'memberTypes')
              .leftJoinAndSelect('project.hashtags', 'hashtags')
              .leftJoinAndSelect('project.members', 'members')
              .getOne();

            const joinRequestUser = await AppDataSource.getRepository(User)
              .createQueryBuilder('user')
              .where('user.id = :userId', { userId: requestUserId })
              .getOne();

            return {
              type: 'projectJoinRequest',
              id: request.id,
              projectId: project?.id,
              projectTitle: project?.title,
              createdAt: request.createdAt,
              joinRequestUserNickname: joinRequestUser?.nickname,
            };
          })
        );

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            notifications: projects.length < 1 ? [] : projects,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

const filterRequest = (req: Request, res: Response, next: NextFunction) => {
  const { category } = req.params;
  const { data } = req.body;

  if (category !== 'profileImage') {
    return next();
  }

  if (data === 'delete') {
    return next();
  }

  uploadS3({
    path: 'profileImage',
    option: 'single',
    data: { name: 'profileImage' },
  })(req, res, next);
};

interface MulterRequest extends Request {
  file: any;
}

// profile page. profile info update router
router.post(
  '/:category',
  isLoggedIn,
  filterRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const { category } = req.params;
    const { data } = req.body;

    // console.log({ category, data });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_ABNORMAL_ACCESS,
      });
    }

    try {
      // update profile image
      if (category === 'profileImage') {
        const multerS3File = (req as MulterRequest).file;

        // delete profile image
        if (multerS3File === undefined) {
          const existUser = await AppDataSource.getRepository(User)
            .createQueryBuilder('user')
            .where('user.id = :id', { id: user?.id })
            .leftJoinAndSelect('user.profile', 'profile')
            .getOne();

          await AppDataSource.createQueryBuilder()
            .update(Profile)
            .set({ profileImage: null })
            .where('id = :profileId', { profileId: existUser?.profile.id })
            .execute();

          return res.status(201).json({
            success: true,
            message: null,
          });
        }

        // update profile image
        if (multerS3File) {
          const newProfileImageUrl = multerS3File.location;

          const existUser = await AppDataSource.getRepository(User)
            .createQueryBuilder('user')
            .where('user.id = :id', { id: user?.id })
            .leftJoinAndSelect('user.profile', 'profile')
            .getOne();

          await AppDataSource.createQueryBuilder()
            .update(Profile)
            .set({ profileImage: newProfileImageUrl })
            .where('id = :profileId', { profileId: existUser?.profile.id })
            .execute();

          return res.status(201).json({
            success: true,
            message: null,
            data: {
              url: multerS3File.location,
            },
          });
        }
      }

      // update profile nickname
      if (category === 'nickname') {
        const requestUser = user;
        const existNickname = requestUser?.nickname;
        const newNickname = data;

        // request same nickname
        if (existNickname === newNickname) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              nickname: data,
            },
          });
        }

        const isExistSameNickname = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.nickname = :nickname', { nickname: newNickname })
          .getOne();

        if (isExistSameNickname) {
          return res.status(400).json({
            success: false,
            message: CLIENT_ERROR_NICKNAME_ALREADY_EXIST,
          });
        }

        if (newNickname.length < 2 || newNickname.length > 20) {
          return res.status(400).json({
            success: false,
            message: CLIENT_ERROR_NICKNAME_LENGTH_TWO_TO_TWENTY,
          });
        }

        // only korean, number, english is possible. white spaces impossible.
        // const koEnNumRegex = /^[0-9|a-zA-Z|ㄱ-ㅎ|ㅏ-ㅣ|가-힣]+$/;

        // only english, number is possible. white spaces impossible.
        const onlyNoSpaceEnglishNumber = /^[a-zA-Z0-9]+$/;

        const isOnlyNoSpaceEnglishNumber =
          onlyNoSpaceEnglishNumber.test(newNickname);

        if (!isOnlyNoSpaceEnglishNumber) {
          return res.status(400).json({
            success: false,
            message: CLIENT_ERROR_NICKNAME_ONLY_NO_SPACE_ENGLISH_NUMBER,
          });
        }

        await AppDataSource.createQueryBuilder()
          .update(User)
          .set({ nickname: newNickname })
          .where('id = :id', { id: user?.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            nickname: newNickname,
          },
        });
      }

      // update profile introduce
      if (category === 'introduce') {
        if (data.length > 1000) {
          return res.status(400).json({
            success: false,
            message: CLIENT_ERROR_INTRODUCE_LENGTH_LIMIT.replace(
              '{lengthLimit}',
              String(1000)
            ),
          });
        }

        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.introduce === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              introduce: data,
            },
          });
        }

        const newData = data === '' ? null : data;

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ introduce: newData })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            introduce: data,
          },
        });
      }

      if (category === 'onOffline') {
        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.onOffline === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              onOffline: data,
            },
          });
        }

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ onOffline: data })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            onOffline: data,
          },
        });
      }

      if (category === 'place') {
        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.place === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              place: data,
            },
          });
        }

        const newData = data === '' ? null : data;

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ place: newData })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            place: data,
          },
        });
      }

      if (category === 'contactTime') {
        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.contactTime === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              contactTime: data,
            },
          });
        }

        const newData = data === '' ? null : data;

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ contactTime: newData })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            contactTime: data,
          },
        });
      }

      if (category === 'interests') {
        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.interests === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              interests: data,
            },
          });
        }

        const newData = data === '' ? null : data;

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ interests: newData })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            interests: data,
          },
        });
      }

      if (category === 'career') {
        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.career === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              career: data,
            },
          });
        }

        const newData = data === '' ? null : data;

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ career: newData })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            career: data,
          },
        });
      }

      if (category === 'skills') {
        const existUser = await AppDataSource.getRepository(User)
          .createQueryBuilder('user')
          .where('user.id = :id', { id: user?.id })
          .leftJoinAndSelect('user.profile', 'profile')
          .getOne();

        // If the db data and the request value are the same, return the value without updating
        if (existUser?.profile.skills === data) {
          return res.status(200).json({
            success: true,
            message: null,
            data: {
              skills: data,
            },
          });
        }

        const newData = data === '' ? null : data;

        await AppDataSource.createQueryBuilder()
          .update(Profile)
          .set({ skills: newData })
          .where('id = :profileId', { profileId: existUser?.profile.id })
          .execute();

        return res.status(201).json({
          success: true,
          message: null,
          data: {
            skills: data,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
