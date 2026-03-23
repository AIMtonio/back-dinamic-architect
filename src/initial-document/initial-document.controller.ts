import { Controller, Get, Post, Body } from '@nestjs/common';
import { InitialDocumentService } from './initial-document.service';
import { CreateInitialDocumentDto } from './dto/create-initial-document.dto';

@Controller('initial-document')
export class InitialDocumentController {
  constructor(private readonly initialDocumentService: InitialDocumentService) {}

  @Post()
  async create(@Body() createInitialDocumentDto: CreateInitialDocumentDto) {
    return await this.initialDocumentService.create(createInitialDocumentDto);
  }

  @Get()
  async findAll() {
    return await this.initialDocumentService.prueba();
  }

}
