import { Body, Controller, Header, Post } from '@nestjs/common';
import { SecuenciaService } from './secuencia.service';
import { CreateSecuenciaDto } from './dto/create-secuencia.dto';

@Controller('secuencia')
export class SecuenciaController {
  constructor(private readonly secuenciaService: SecuenciaService) {}

  @Post('uml')
  async generateUml(@Body() createSecuenciaDto: CreateSecuenciaDto) {
    return await this.secuenciaService.generateUml(createSecuenciaDto);
  }

  @Post('uml/raw')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async generateUmlRaw(@Body() createSecuenciaDto: CreateSecuenciaDto): Promise<string> {
    return await this.secuenciaService.generateUmlRaw(createSecuenciaDto);
  }
}
