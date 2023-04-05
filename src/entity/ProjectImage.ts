import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Project } from './Project';

@Entity()
export class ProjectImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 500 })
  url: string;

  @ManyToOne(() => Project, (project) => project.images)
  project: Project;
}
