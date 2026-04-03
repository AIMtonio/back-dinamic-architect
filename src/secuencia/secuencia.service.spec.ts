import { Test, TestingModule } from '@nestjs/testing';
import { SecuenciaService } from './secuencia.service';

describe('SecuenciaService', () => {
  let service: SecuenciaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SecuenciaService],
    }).compile();

    service = module.get<SecuenciaService>(SecuenciaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
