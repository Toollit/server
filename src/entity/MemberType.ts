import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class MemberType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: 'developer' | 'designer' | 'pm' | 'anyone';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date;
}
