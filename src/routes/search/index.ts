import express, { NextFunction, Request } from 'express';
import { CustomResponse } from '@/types';
import { AppDataSource } from '@/config/data-source';
import { Project } from '@/entity/Project';
import { CLIENT_ERROR_DEFAULT, SERVER_ERROR_DEFAULT } from '@/message/error';
import { Bookmark } from '@/entity/Bookmark';

const router = express.Router();

interface SearchReqQuery {
  q: string;
}

// Search project router
router.get(
  '/',
  async (
    req: Request<{}, {}, {}, SearchReqQuery>,
    res: CustomResponse,
    next: NextFunction
  ) => {
    const { q } = req.query;

    if (!(typeof q === 'string')) {
      return res.status(400).json({
        success: false,
        message: CLIENT_ERROR_DEFAULT,
      });
    }

    const searchText = decodeURIComponent(q);

    try {
      const projects = await AppDataSource.getRepository(Project)
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.memberTypes', 'memberTypes')
        .leftJoinAndSelect('project.members', 'members')
        .leftJoinAndSelect('project.hashtags', 'hashtags')
        .where(
          // Even if title is similar, it should be searched, and hashtags should match to be searched
          'project.title LIKE :searchText OR hashtags.tagName = :searchText',
          {
            searchText: `%${searchText}%`,
          }
        )
        .orderBy('project.id', 'DESC')
        .take(12)
        .getMany();

      const bookmarkRepository = AppDataSource.getRepository(Bookmark);

      const processedData = await Promise.all(
        projects.map(async (project) => {
          const extractTagNames = project.hashtags.map(
            (hashtag) => hashtag.tagName
          );

          const extractMemberTypes = project.memberTypes.map(
            (memberType) => memberType.type
          );

          // Sorts in order of developer, designer, pm, and anyone
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

          const bookmarks = await bookmarkRepository.find({
            where: {
              projectId: project.id,
            },
          });

          const memberCount = project.members.length - 1; // -1 is to exclude project writer

          return {
            id: project.id,
            title: project.title,
            views: project.views,
            bookmarkCount: bookmarks.length,
            hashtags: extractTagNames,
            memberTypes: orderedMemberTypes,
            memberCount,
            recruitCount: project.recruitCount,
            representativeImage: project.representativeImage,
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: null,
        data: { projects: processedData },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
