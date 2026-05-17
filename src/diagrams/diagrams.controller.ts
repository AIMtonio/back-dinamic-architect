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
  ): Promise<StreamableFile | Record<string, unknown>> {
    const { buffer, filename } = await this.drawioService.generateDiagramFromJson(payload);

    if (this.drawioService.isEncryptedRequestPayload(payload)) {
      return this.drawioService.encryptResponsePayload({
        filename,
        mimeType: 'application/xml',
        fileBase64: buffer.toString('base64'),
      }) as unknown as Record<string, unknown>;
    }

    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post('from-json/dry-run')
  async validateFromJson(@Body() payload: GenerateDiagramFromJsonDto) {
    const result = await this.drawioService.validateDiagramFromJson(payload);

    if (this.drawioService.isEncryptedRequestPayload(payload)) {
      return this.drawioService.encryptResponsePayload(result);
    }

    return result;
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