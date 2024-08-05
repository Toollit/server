import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class DeleteAccountRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  authCode1: string;

  @Column()
  authCode2: string;

  @Column()
  authCode3: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ nullable: true, default: null })
  updatedAt: Date | null;
}
