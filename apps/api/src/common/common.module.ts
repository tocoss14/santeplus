import { Global, Module } from '@nestjs/common';
import { JwtService } from './guards/jwt.service';
import { PrismaModule } from './prisma.module';
import { NotificationDispatchService } from './notifications/dispatch.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [JwtService, NotificationDispatchService],
  exports: [JwtService, NotificationDispatchService],
})
export class CommonModule {}
