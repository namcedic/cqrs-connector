import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { UpdateUserCommand } from '../update-user.command';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async execute(command: UpdateUserCommand): Promise<UserEntity> {
    const user = await this.usersRepository.findOneBy({ id: command.id });
    if (!user) {
      throw new NotFoundException(`User with ID ${command.id} not found`);
    }

    if (command.name) user.name = command.name;
    if (command.email) user.email = command.email;

    return this.usersRepository.save(user);
  }
}
