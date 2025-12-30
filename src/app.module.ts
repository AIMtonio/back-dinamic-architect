import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiagramsModule } from './diagrams/diagrams.module';

@Module({
  imports: [DiagramsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
