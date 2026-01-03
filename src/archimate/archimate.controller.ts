import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ArchimateService } from './archimate.service';
import { CreateArchimateDto } from './dto/create-archimate.dto';
import { UpdateArchimateDto } from './dto/update-archimate.dto';

@Controller('archimate')
export class ArchimateController {
  constructor(private readonly archimateService: ArchimateService) {}

  @Get('from-excel')
  generate(
    @Query('file') file = 'src/data/input/archimate.xlsx',
    @Query('out') out = 'src/data/input/archimate-model.xml',
  ) {
    //return this.archimateService.generateFromExcel(file, out);
    return this.archimateService.generateReport();
  }
}
