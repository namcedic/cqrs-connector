import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CassandraService } from '../../../cassandra/cassandra.service';
import { GetUsersQuery } from '../get-users.query';

@QueryHandler(GetUsersQuery)
export class GetUsersHandler implements IQueryHandler<GetUsersQuery> {
  constructor(private readonly cassandraService: CassandraService) {}

  async execute(query: GetUsersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const offset = (page - 1) * limit;

    const rows = await this.cassandraService.findAll(
      'SELECT * FROM user_read.users LIMIT ?',
      [limit + offset],
    );

    const data = rows.slice(offset, offset + limit);

    return {
      page,
      limit,
      data,
    };
  }
}
