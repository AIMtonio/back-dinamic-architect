import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ArchimateService } from './archimate.service';

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

  @Post('from-json')
  async generateFromJson(
    @Body() body: Record<string, unknown>,
  ) {
    const out = typeof body.out === 'string' && body.out.trim().length > 0
      ? body.out
      : 'archimate-model.xml';

    return await this.archimateService.generateReportFromJson(body, out);
  }
}
