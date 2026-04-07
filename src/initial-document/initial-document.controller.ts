import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { InitialDocumentService } from './initial-document.service';
import { CreateInitialDocumentDto } from './dto/create-initial-document.dto';

@Controller('initial-document')
export class InitialDocumentController {
  constructor(private readonly initialDocumentService: InitialDocumentService) {}

  @Post()
  async create(@Body() createInitialDocumentDto: CreateInitialDocumentDto) {
    return await this.initialDocumentService.create(createInitialDocumentDto);
  }

  @Get('google-drive/auth-url')
  getGoogleDriveAuthUrl() {
    return this.initialDocumentService.getGoogleDriveAuthUrl();
  }

  @Get('google-drive/exchange-code')
  async exchangeGoogleDriveCode(
    @Query('code') code = '',
  ) {
    return await this.initialDocumentService.exchangeGoogleDriveCode(code);
  }

  @Get('dda-template')
  async generateDdaTemplate() {
    return await this.initialDocumentService.generateDdaTemplate();
  }

}
