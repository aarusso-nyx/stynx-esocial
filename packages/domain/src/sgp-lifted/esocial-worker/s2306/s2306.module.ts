import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ESocialEmitService } from '../esocial-emit.service';
import { CertificateStoreService } from '../certificate-store/certificate-store.service';
import { IcpSignerService } from '../signature/icp-signer.service';
import { XsdValidatorService } from '../xsd/xsd-validator.service';
import { S2306Builder } from './s2306.builder';
import { S2306Controller } from './s2306.controller';
import { S2306Service } from './s2306.service';
import { S2306Transmitter } from './s2306.transmitter';

@Module({
  imports: [DatabaseModule],
  controllers: [S2306Controller],
  providers: [
    CertificateStoreService,
    ESocialEmitService,
    IcpSignerService,
    S2306Builder,
    S2306Service,
    S2306Transmitter,
    XsdValidatorService,
  ],
  exports: [S2306Builder, S2306Service],
})
export class S2306Module {}
