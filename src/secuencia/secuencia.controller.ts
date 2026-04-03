import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SecuenciaService } from './secuencia.service';
import { CreateSecuenciaDto } from './dto/create-secuencia.dto';
import { UpdateSecuenciaDto } from './dto/update-secuencia.dto';

@Controller('secuencia')
export class SecuenciaController {
  constructor(private readonly secuenciaService: SecuenciaService) {}

  @Post()
  create(@Body() createSecuenciaDto: CreateSecuenciaDto) {
    return this.secuenciaService.create(createSecuenciaDto);
  }

  @Get()
  findAll() {
    return this.secuenciaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.secuenciaService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSecuenciaDto: UpdateSecuenciaDto) {
    return this.secuenciaService.update(+id, updateSecuenciaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.secuenciaService.remove(+id);
  }
}
