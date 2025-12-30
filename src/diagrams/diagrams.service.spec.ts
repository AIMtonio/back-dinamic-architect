import { Test, TestingModule } from '@nestjs/testing';
import { DiagramsService } from './diagrams.service';

describe('DiagramsService', () => {
  let service: DiagramsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiagramsService],
    }).compile();

    service = module.get<DiagramsService>(DiagramsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
