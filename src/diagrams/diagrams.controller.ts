import { Controller, Post, Body, Get, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { DiagramsService } from './diagrams.service';
import { GenerateDiagramFromJsonDto } from './dto/generate-diagram-from-json.dto';

@Controller('diagram')
export class DiagramsController {
  constructor(private readonly drawioService: DiagramsService) {}

  /*@Post()
  generate(@Body() body: { components: { name: string; type: 'lambda' | 'eks' }[] }) {
    return this.drawioService.generateDiagram(body.components);
  }*/

  @Post('from-json')
  async generateFromJson(
    @Body() payload: GenerateDiagramFromJsonDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.drawioService.generateDiagramFromJson(payload);
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post('from-json/dry-run')
  async validateFromJson(@Body() payload: GenerateDiagramFromJsonDto) {
    return await this.drawioService.validateDiagramFromJson(payload);
  }

  @Get('from-excel')
  async generateDiagramFromExcel(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.drawioService.generateDiagramFromExcel();
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('from-excel/dry-run')
  async validateFromExcel() {
    return await this.drawioService.validateDiagramFromExcel();
  }

}