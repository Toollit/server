import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProjectContentImage } from './ProjectContentImage';
import { User } from './User';
import { Hashtag } from './Hashtag';
import { MemberType } from './MemberType';
import { ProjectMember } from './ProjectMember';
import { Bookmark } from './Bookmark';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  title: string;

  // use contentHTML column data when displaying content
  @Column({ type: 'text' })
  contentHTML: string;

  // use contentMarkdown column data when modifying content
  @Column({ type: 'text' })
  contentMarkdown: string;

  @Column({ default: 0 })
  views: number;

  @Column({ default: 0 })
  recruitCount: number;

  @Column()
  representativeImage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @ManyToOne(() => User, (user) => user.projects, {
    onDelete: 'CASCADE',
  })
  user: User;

  @OneToMany(
    () => ProjectContentImage,
    (ProjectContentImage) => ProjectContentImage.project,
    {
      cascade: ['remove'],
      onDelete: 'CASCADE',
    }
  )
  images: ProjectContentImage[];

  @OneToMany(() => Hashtag, (hashtag) => hashtag.project, {
    cascade: ['remove'],
    onDelete: 'CASCADE',
  })
  hashtags: Hashtag[];

  @OneToMany(() => MemberType, (memberType) => memberType.project, {
    cascade: ['remove'],
    onDelete: 'CASCADE',
  })
  memberTypes: MemberType[];

  @OneToMany(() => ProjectMember, (projectMember) => projectMember.project, {
    cascade: ['remove'],
    onDelete: 'CASCADE',
  })
  members: ProjectMember[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user, {
    cascade: ['remove'],
    onDelete: 'CASCADE',
  })
  bookmarks: Bookmark[];
}
