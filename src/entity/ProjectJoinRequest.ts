import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Project } from './Project';

@Entity()
export class ProjectJoinRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  joinProjectId: string;

  @Column()
  requestUserId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @ManyToOne(() => Project, (project) => project.joinRequests)
  project: Project;
}
