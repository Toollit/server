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
import { Notification } from './Notification';

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

  @Column({ type: 'timestamp' })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @OneToOne(() => Profile, (profile) => profile.user, { cascade: ['remove'] })
  @JoinColumn()
  profile: Profile;

  @OneToMany(() => Project, (project) => project.user, { cascade: ['remove'] })
  projects: Project[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user, {
    cascade: ['remove'],
  })
  bookmarks: Bookmark[];

  @OneToMany(() => Notification, (notification) => notification.user, {
    cascade: ['remove'],
  })
  notifications: Notification[];
}
