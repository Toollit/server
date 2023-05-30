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
import { ProfileImage } from './ProfileImage';
import { Profile } from './Profile';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  role: number;

  @Column({ unique: true, length: 200 })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ type: 'text', nullable: true })
  tempPassword: string | null;

  @Column({ nullable: true })
  salt: string;

  @Column()
  signUpType: 'google' | 'github' | 'email';

  @Column({ nullable: true, length: 20 })
  nickname: string;

  @Column({ nullable: true, length: 20 })
  username: string;

  @Column({ default: 0 })
  loginFailedCounts: number = 0;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null = null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @OneToMany(() => Project, (project) => project.user)
  projects: Project[];

  @OneToOne(() => ProfileImage)
  @JoinColumn()
  profileImage: ProfileImage;

  @OneToOne(() => Profile)
  @JoinColumn()
  profile: Profile;
}
