import { Module } from '@nestjs/common';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';
import { GoogleDriveModule } from '../common/google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [DiagramsController],
  providers: [DiagramsService],
})
export class DiagramsModule {}
