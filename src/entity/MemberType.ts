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
export class MemberType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: 'developer' | 'designer' | 'pm' | 'anyone';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;

  @ManyToOne(() => Project, (project) => project.memberTypes, {
    onDelete: 'CASCADE',
  })
  project: Project;
}
