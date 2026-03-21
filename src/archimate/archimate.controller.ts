import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ArchimateService } from './archimate.service';
import { CreateArchimateDto } from './dto/create-archimate.dto';
import { UpdateArchimateDto } from './dto/update-archimate.dto';

@Controller('archimate')
export class ArchimateController {
  constructor(private readonly archimateService: ArchimateService) {}

  @Get('from-excel')
  async generate(
    @Query('file') file = 'src/data/input/business_actors.xlsx',
    @Query('out') out = 'archimate-model.xml',
  ) {
    return await this.archimateService.generateReport(file, out);
  }
}
