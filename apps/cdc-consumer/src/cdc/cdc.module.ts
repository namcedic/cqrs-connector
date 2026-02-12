import { Module } from '@nestjs/common';
import { CdcConsumerService } from './cdc-consumer.service';
import { CassandraModule } from 'src/cassandra/cassandra.module';

@Module({
  imports: [CassandraModule],
  providers: [CdcConsumerService],
})
export class CdcModule {}
