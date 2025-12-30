// src/drawio/drawio.controller.ts
import { Controller, Post, Body, Get } from '@nestjs/common';
import { DiagramsService } from './diagrams.service';

@Controller('diagram')
export class DiagramsController {
  constructor(private readonly drawioService: DiagramsService) {}

  /*@Post()
  generate(@Body() body: { components: { name: string; type: 'lambda' | 'eks' }[] }) {
    return this.drawioService.generateDiagram(body.components);
  }*/

  @Get('from-file')
  generateFromFile() {
    return this.drawioService.generateDiagramFromFile('components.json');
  }

  @Get('from-excel')
  async generateDiagramFromExcel() {
    return await this.drawioService.generateDiagramFromExcel();
  }

}