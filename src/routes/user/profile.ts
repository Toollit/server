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

dotenv.config();

const router = express.Router();

interface ProfileRequestParams {
  nickname: string;
}

interface ProfileResponseBody {}

interface ProfileRequestBody {}

interface ProfileRequestQuery {
  tab: 'viewProfile' | 'viewProjects' | 'viewBookmarks';
  count?: number;
}

router.get(
  '/:nickname/existCheck',
  async (req: Request, res: Response, next: NextFunction) => {
    const nickname = req.params.nickname;

    const existUser = await AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .where('user.nickname = :nickname', { nickname })
      .leftJoinAndSelect('user.profile', 'profile')
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
  }
);

// profile page profile info response router
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
    const user = req.user;
    const nickname = req.params.nickname;
    const { tab, count } = req.query;

    try {
      const existUser = await AppDataSource.getRepository(User)
        .createQueryBuilder('user')
        .where('user.nickname = :nickname', { nickname })
        .leftJoinAndSelect('user.profile', 'profile')
        .getOne();

      if (!existUser) {
        return res.status(404).json({
          success: false,
          message: CLIENT_ERROR_NOT_EXIST_USER,
        });
      }

      if (tab === undefined) {
        const { profile } = existUser;
        const { profileImage: url } = profile;

        return res.status(200).json({
          success: true,
          message: null,
          data: { profileImage: url },
        });
      }

      if (tab === 'viewProfile') {
        const { email, nickname, signUpType, createdAt, lastLoginAt, profile } =
          existUser;

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
        if (user?.nickname === nickname) {
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
        if (user?.nickname !== nickname) {
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
        const projectCount = await AppDataSource.getRepository(Project)
          .createQueryBuilder('project')
          .where('project.user = :userId', { userId: existUser.id })
          .getMany();

        const projects = await AppDataSource.getRepository(Project)
          .createQueryBuilder('project')
          .where('project.user = :userId', { userId: existUser.id })
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
              projects, // projects is empty array []
              total: projectCount.length,
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

            // developer, designer, pm, anyone 순으로 정렬
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

            const bookmarkRepository = AppDataSource.getRepository(Bookmark);
            const bookmarks = await bookmarkRepository.find({
              where: {
                projectId: project.id,
              },
            });

            const memberNumber = project.members.length - 1; // Exclude project writer

            return {
              id: project.id,
              title: project.title,
              views: project.views,
              bookmarks: bookmarks.length,
              hashtags: extractTagNames,
              memberTypes: orderedMemberTypes,
              memberNumber,
              recruitNumber: project.recruitNumber,
            };
          })
        );

        return res.status(200).json({
          success: true,
          message: null,
          data: {
            projects: processedData,
            total: projectCount.length,
          },
        });
      }

      if (tab === 'viewBookmarks') {
        return res.status(200).json({
          success: true,
          message: null,
          data: {
            bookmarks: ['북마크1', '북마크2', '북마크3', '북마크4'],
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
