import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DocumentService } from './document.service';
import { GenerateProblemDocumentDto } from './dto/generate-problem-document.dto';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('generate-problem')
  async generateProblemDocument(@Body() dto: GenerateProblemDocumentDto) {
    return await this.documentService.generateProblemDocument(dto);
  }

}
