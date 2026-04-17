import { Test, TestingModule } from '@nestjs/testing';
import { CecoService } from './ceco.service';

describe('CecoService', () => {
  let service: CecoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CecoService],
    }).compile();

    service = module.get<CecoService>(CecoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
