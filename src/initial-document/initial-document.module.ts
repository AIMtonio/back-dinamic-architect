import { Module } from '@nestjs/common';
import { InitialDocumentService } from './initial-document.service';
import { InitialDocumentController } from './initial-document.controller';
import { GoogleDriveModule } from '../common/google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [InitialDocumentController],
  providers: [InitialDocumentService],
})
export class InitialDocumentModule {}
