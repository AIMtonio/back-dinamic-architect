import { Module } from '@nestjs/common';
import { CecoService } from './ceco.service';
import { CecoController } from './ceco.controller';

@Module({
  controllers: [CecoController],
  providers: [CecoService],
})
export class CecoModule {}
