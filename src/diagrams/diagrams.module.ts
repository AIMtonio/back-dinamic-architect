import { Module } from '@nestjs/common';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';

@Module({
  controllers: [DiagramsController],
  providers: [DiagramsService],
})
export class DiagramsModule {}
