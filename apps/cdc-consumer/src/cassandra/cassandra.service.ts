import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'cassandra-driver';

@Injectable()
export class CassandraService implements OnModuleInit, OnModuleDestroy {
  private client: Client;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.client = new Client({
      contactPoints: [
        this.configService.get<string>('CASSANDRA_HOST', 'localhost'),
      ],
      localDataCenter: 'datacenter1',
      keyspace: this.configService.get<string>(
        'CASSANDRA_KEYSPACE',
        'user_read',
      ),
      queryOptions: { prepare: true },
    });
  }

  async onModuleDestroy() {
    await this.client.shutdown();
  }

  async upsertUser(params: {
    userId: number;
    name: string | null;
    email: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  }) {
    const query =
      'INSERT INTO user_read.users (user_id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)';

    await this.client.execute(query, [
      params.userId,
      params.name,
      params.email,
      params.createdAt,
      params.updatedAt,
    ]);
  }
}
