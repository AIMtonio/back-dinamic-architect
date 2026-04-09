import { Body, Controller, Get, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { ArchimateService } from './archimate.service';
import { GenerateArchimateFromJsonDto } from './dto/generate-archimate-from-json.dto';

@Controller('archimate')
export class ArchimateController {
  constructor(private readonly archimateService: ArchimateService) {}

  private readonly defaultInputExcel = process.env.ARCHIMATE_INPUT_EXCEL_PATH || 'src/data/input/business_actors.xlsx';
  private readonly defaultOutputFile = process.env.ARCHIMATE_DEFAULT_OUTPUT_FILE || 'archimate-model.xml';

  @Get('from-excel')
  async generate(
    @Query('file') file = this.defaultInputExcel,
    @Query('out') out = this.defaultOutputFile,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.archimateService.generateReport(file, out);
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('from-excel/dry-run')
  async validateFromExcel(
    @Query('file') file = this.defaultInputExcel,
    @Query('out') out = this.defaultOutputFile,
  ) {
    return await this.archimateService.validateReportFromExcel(file, out);
  }

  @Post('from-json')
  async generateFromJson(
    @Body() body: GenerateArchimateFromJsonDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const out = typeof body.out === 'string' && body.out.trim().length > 0
      ? body.out
      : this.defaultOutputFile;

    const { buffer, filename } = await this.archimateService.generateReportFromJson(body, out);
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post('from-json/dry-run')
  async validateFromJson(
    @Body() body: GenerateArchimateFromJsonDto,
  ) {
    const out = typeof body.out === 'string' && body.out.trim().length > 0
      ? body.out
      : this.defaultOutputFile;

    return await this.archimateService.validateReportFromJson(body, out);
  }

}
