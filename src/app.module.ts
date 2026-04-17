import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiagramsModule } from './diagrams/diagrams.module';
import { ArchimateModule } from './archimate/archimate.module';
import { InitialDocumentModule } from './initial-document/initial-document.module';
import { SecuenciaModule } from './secuencia/secuencia.module';
import { DocumentModule } from './document/document.module';
import { CecoModule } from './ceco/ceco.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    DiagramsModule,
    ArchimateModule,
    InitialDocumentModule,
    SecuenciaModule,
    DocumentModule,
    CecoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
