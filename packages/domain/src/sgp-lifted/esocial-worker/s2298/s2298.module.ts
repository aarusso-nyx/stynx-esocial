import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ESocialEmitService } from '../esocial-emit.service';
import { CertificateStoreService } from '../certificate-store/certificate-store.service';
import { IcpSignerService } from '../signature/icp-signer.service';
import { XsdValidatorService } from '../xsd/xsd-validator.service';
import { S2298Builder } from './s2298.builder';
import { S2298Controller } from './s2298.controller';
import { S2298Service } from './s2298.service';
import { S2298Transmitter } from './s2298.transmitter';

@Module({
  imports: [DatabaseModule],
  controllers: [S2298Controller],
  providers: [
    CertificateStoreService,
    ESocialEmitService,
    IcpSignerService,
    S2298Builder,
    S2298Service,
    S2298Transmitter,
    XsdValidatorService,
  ],
  exports: [S2298Builder, S2298Service],
})
export class S2298Module {}
