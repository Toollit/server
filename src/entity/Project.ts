import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProjectImage } from './ProjectImage';
import { User } from './User';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  title: string;

  // 컨텐츠 보여주기용
  @Column({ type: 'text' })
  contentHTML: string;

  // 작성자 수정용
  @Column({ type: 'text' })
  contentMarkdown: string;

  @Column({ default: true })
  views: number = 1;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.posts)
  user: User;

  @OneToMany(() => ProjectImage, (projectImage) => projectImage.project)
  images: ProjectImage[];
}