import { Injectable } from '@nestjs/common';
import { CreateSecuenciaDto } from './dto/create-secuencia.dto';
import { UpdateSecuenciaDto } from './dto/update-secuencia.dto';

@Injectable()
export class SecuenciaService {
  create(createSecuenciaDto: CreateSecuenciaDto) {
    return 'This action adds a new secuencia';
  }

  findAll() {
    return `This action returns all secuencia`;
  }

  findOne(id: number) {
    return `This action returns a #${id} secuencia`;
  }

  update(id: number, updateSecuenciaDto: UpdateSecuenciaDto) {
    return `This action updates a #${id} secuencia`;
  }

  remove(id: number) {
    return `This action removes a #${id} secuencia`;
  }
}
