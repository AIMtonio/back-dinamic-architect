import { Module } from '@nestjs/common';
import { InitialDocumentService } from './initial-document.service';
import { InitialDocumentController } from './initial-document.controller';

@Module({
  controllers: [InitialDocumentController],
  providers: [InitialDocumentService],
})
export class InitialDocumentModule {}
