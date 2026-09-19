// src/common/worker-lease/worker-lease.module.ts
// Register once in WorkerModule. Do NOT register in AppModule — the API
// process runs no schedulers (Section 10.2).

import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkerLeaseService } from './worker-lease.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [WorkerLeaseService],
  exports: [WorkerLeaseService],
})
export class WorkerLeaseModule {}
