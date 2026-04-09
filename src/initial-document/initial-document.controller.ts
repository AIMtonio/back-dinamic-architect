import { Controller, Get, Post, Body, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { InitialDocumentService } from './initial-document.service';
import { CreateInitialDocumentDto } from './dto/create-initial-document.dto';

@Controller('initial-document')
export class InitialDocumentController {
  constructor(private readonly initialDocumentService: InitialDocumentService) {}

  @Post()
  async create(
    @Body() createInitialDocumentDto: CreateInitialDocumentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.initialDocumentService.create(createInitialDocumentDto);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('dda-template')
  async generateDdaTemplate(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.initialDocumentService.generateDdaTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

}
