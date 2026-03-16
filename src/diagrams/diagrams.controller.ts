import { Controller, Post, Body, Get } from '@nestjs/common';
import { DiagramsService } from './diagrams.service';

@Controller('diagram')
export class DiagramsController {
  constructor(private readonly drawioService: DiagramsService) {}

  /*@Post()
  generate(@Body() body: { components: { name: string; type: 'lambda' | 'eks' }[] }) {
    return this.drawioService.generateDiagram(body.components);
  }*/

  @Post('from-json')
  async generateFromJson(@Body() payload: any) {
    return await this.drawioService.generateDiagramFromJson(payload);
  }

  @Get('from-excel')
  async generateDiagramFromExcel() {
    return await this.drawioService.generateDiagramFromExcel();
  }

  @Get('hola')
  async generateDiagramFromComponents() {
    return 'Hola desde el controlador de diagramas!!!';
  }

}