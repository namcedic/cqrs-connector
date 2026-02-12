import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { DeleteUserCommand } from '../delete-user.command';

@CommandHandler(DeleteUserCommand)
export class DeleteUserHandler implements ICommandHandler<DeleteUserCommand> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    const user = await this.usersRepository.findOneBy({ id: command.id });
    if (!user) {
      throw new NotFoundException(`User with ID ${command.id} not found`);
    }

    await this.usersRepository.remove(user);
  }
}
