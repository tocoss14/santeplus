import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, NotificationDispatchService],
  exports: [AuthService],
})
export class AuthModule {}
