import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { Project } from './Project';

@Entity()
export class ProjectMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  projectId: number;

  @Column()
  memberId: number;

  @Column()
  memberNickname: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null = null;

  @ManyToOne(() => Project, (project) => project.memberId)
  project: Project;
}
