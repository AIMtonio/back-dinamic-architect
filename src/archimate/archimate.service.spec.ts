import { Test, TestingModule } from '@nestjs/testing';
import { ArchimateService } from './archimate.service';

describe('ArchimateService', () => {
  let service: ArchimateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArchimateService],
    }).compile();

    service = module.get<ArchimateService>(ArchimateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
