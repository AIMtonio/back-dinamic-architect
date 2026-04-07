import { Module } from '@nestjs/common';
import { SecuenciaService } from './secuencia.service';
import { SecuenciaController } from './secuencia.controller';

@Module({
  controllers: [SecuenciaController],
  providers: [SecuenciaService],
})
export class SecuenciaModule {}
