import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { CassandraModule } from './cassandra/cassandra.module';
import { CdcModule } from './cdc/cdc.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../../.env'),
    }),
    CassandraModule,
    CdcModule,
  ],
})
export class AppModule {}
