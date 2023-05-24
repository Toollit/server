import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true, length: 1000 })
  introduce: string;

  @Column({ nullable: true })
  onOffline: string;

  @Column({ nullable: true })
  meetingPlace: string;

  @Column({ nullable: true })
  meetingTime: string;

  @Column({ nullable: true })
  interests: string;

  @Column({ nullable: true })
  career: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null = null;
}
