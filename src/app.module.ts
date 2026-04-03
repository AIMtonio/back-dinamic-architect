import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiagramsModule } from './diagrams/diagrams.module';
import { ArchimateModule } from './archimate/archimate.module';
import { InitialDocumentModule } from './initial-document/initial-document.module';
import { SecuenciaModule } from './secuencia/secuencia.module';

@Module({
  imports: [DiagramsModule, ArchimateModule, InitialDocumentModule, SecuenciaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
