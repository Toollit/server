import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './Project';
import { Profile } from './Profile';
import { Bookmark } from './Bookmark';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  role: number;

  @Column({ unique: true, length: 200, nullable: false })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ type: 'text', nullable: true })
  tempPassword: string;

  @Column({ nullable: true })
  salt: string;

  @Column()
  signUpType: 'google' | 'github' | 'email';

  @Column({ length: 20, nullable: true })
  nickname: string;

  @Column({ default: 0 })
  loginFailedCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @Column({ type: 'timestamp' })
  lastLoginAt: Date;

  @OneToMany(() => Project, (project) => project.user)
  projects: Project[];

  @OneToOne(() => Profile)
  @JoinColumn()
  profile: Profile;

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user)
  bookmarks: Bookmark[];
}
