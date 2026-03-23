import { Controller, Post, Body, Get } from '@nestjs/common';
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
  async generateFromJson(@Body() payload: GenerateDiagramFromJsonDto) {
    return await this.drawioService.generateDiagramFromJson(payload);
  }

  @Post('from-json/dry-run')
  async validateFromJson(@Body() payload: GenerateDiagramFromJsonDto) {
    return await this.drawioService.validateDiagramFromJson(payload);
  }

  @Get('from-excel')
  async generateDiagramFromExcel() {
    return await this.drawioService.generateDiagramFromExcel();
  }

  @Get('from-excel/dry-run')
  async validateFromExcel() {
    return await this.drawioService.validateDiagramFromExcel();
  }

  @Get('hola')
  async generateDiagramFromComponents() {
    return 'Hola desde el controlador de diagramas!!!';
  }

}