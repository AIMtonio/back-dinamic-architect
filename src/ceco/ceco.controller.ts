import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CecoService } from './ceco.service';
import { CreateCecoDto } from './dto/create-ceco.dto';
import { UpdateCecoDto } from './dto/update-ceco.dto';

@Controller('ceco')
export class CecoController {
  constructor(private readonly cecoService: CecoService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.cecoService.search(q ?? '');
  }

  @Get()
  findAll() {
    return this.cecoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cecoService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCecoDto: UpdateCecoDto) {
    return this.cecoService.update(+id, updateCecoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cecoService.remove(+id);
  }
}
