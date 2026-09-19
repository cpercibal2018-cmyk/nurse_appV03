import { Module } from '@nestjs/common';
import { RolesModule } from './modules/roles/roles.module';

@Module({
  imports: [RolesModule],
})
export class AppModule {}
