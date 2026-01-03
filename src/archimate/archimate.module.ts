import { Module } from '@nestjs/common';
import { ArchimateService } from './archimate.service';
import { ArchimateController } from './archimate.controller';

@Module({
  controllers: [ArchimateController],
  providers: [ArchimateService],
})
export class ArchimateModule {}
