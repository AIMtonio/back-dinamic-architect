import { Module } from '@nestjs/common';
import { ArchimateService } from './archimate.service';
import { ArchimateController } from './archimate.controller';
import { GoogleDriveModule } from '../common/google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [ArchimateController],
  providers: [ArchimateService],
})
export class ArchimateModule {}
