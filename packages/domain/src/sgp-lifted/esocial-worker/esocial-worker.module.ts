import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { validateEnvironment } from '../config/environment';
import { AuditModule } from '../audit/audit.module';
import {
  adapterQueueTopics,
  InMemoryQueueTransport,
  type QueueAdapterTransport,
  SqsQueueTransport,
} from '../common/adapters';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { DocumentsModule } from '../documents/documents.module';
import { EsocialSpoolModule, EsocialSpoolService } from '../esocial-spool';
import { PisPasepModule } from '../folha-pagamento/pis-pasep/pis-pasep.module';
import { ESOCIAL_RELAY_QUEUE_KIND } from '../integrations/stynx-esocial/contracts';
import { CertificateStoreController } from './certificate-store/certificate-store.controller';
import { CertificateStoreService } from './certificate-store/certificate-store.service';
import { ES04Controller } from './builders/es04.controller';
import { ES04Service } from './builders/es04.service';
import { ES05Controller } from './builders/es05.controller';
import { ES05Service } from './builders/es05.service';
import { S1000Builder } from './builders/s1000.builder';
import { S1010Builder } from './builders/s1010.builder';
import { S1030Builder } from './builders/s1030.builder';
import { S1040Builder } from './builders/s1040.builder';
import { S1060Builder } from './builders/s1060.builder';
import { S1200Builder } from './builders/s1200.builder';
import { S1299Builder } from './builders/s1299.builder';
import { S1xxxController } from './builders/s1xxx.controller';
import { S1xxxDispatchService } from './builders/s1xxx-common';
import { S1xxxService } from './builders/s1xxx.service';
import { S2200Builder } from './builders/s2200.builder';
import { ESocialEmitService } from './esocial-emit.service';
import { ESocialWorkerService } from './esocial-worker.service';
import { EsocialQueueAdapter } from './adapters/queue-adapter';
import { EsocialRelayMockResponder } from '../external/mocks/esocial-relay';
import { ProcessingParser } from './parsers/processing.parser';
import { ProtocolParser } from './parsers/protocol.parser';
import { TotalizerParser } from './parsers/totalizer.parser';
import { IcpSignerService } from './signature/icp-signer.service';
import { BatchBuilderService } from './submission/batch-builder.service';
import { CircuitBreakerService } from './submission/circuit-breaker.service';
import { RetryStrategyService } from './submission/retry-strategy.service';
import { SoapClientService } from './submission/soap-client.service';
import { SubmissionController } from './submission/submission.controller';
import { SubmissionService } from './submission/submission.service';
import { RetornoController } from './sync/retorno.controller';
import { RetornoService } from './sync/retorno.service';
import { RetryPolicyService } from './sync/retry-policy.service';
import { StatusSyncService } from './sync/status-sync.service';
import { XsdValidatorService } from './xsd/xsd-validator.service';

const ESOCIAL_QUEUE_TRANSPORT = 'ESOCIAL_QUEUE_TRANSPORT';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    AuditModule,
    DatabaseModule,
    DocumentsModule,
    EsocialSpoolModule,
    PisPasepModule,
  ],
  controllers: [
    CertificateStoreController,
    ES04Controller,
    ES05Controller,
    S1xxxController,
    SubmissionController,
    RetornoController,
  ],
  providers: [
    CertificateStoreService,
    ESocialEmitService,
    ESocialWorkerService,
    IcpSignerService,
    ES04Service,
    ES05Service,
    S1000Builder,
    S1010Builder,
    S1030Builder,
    S1040Builder,
    S1060Builder,
    S1200Builder,
    S1299Builder,
    S1xxxDispatchService,
    S1xxxService,
    S2200Builder,
    BatchBuilderService,
    CircuitBreakerService,
    RetryStrategyService,
    SoapClientService,
    {
      provide: ESOCIAL_QUEUE_TRANSPORT,
      useFactory: (configService: ConfigService) =>
        createEsocialQueueTransport(configService),
      inject: [ConfigService],
    },
    {
      provide: EsocialRelayMockResponder,
      useFactory: (transport: QueueAdapterTransport) =>
        transport instanceof InMemoryQueueTransport
          ? new EsocialRelayMockResponder({ transport })
          : undefined,
      inject: [ESOCIAL_QUEUE_TRANSPORT],
    },
    {
      provide: EsocialQueueAdapter,
      useFactory: (
        databaseService: DatabaseService,
        transport: QueueAdapterTransport,
        relay: EsocialRelayMockResponder | undefined,
        spoolService: EsocialSpoolService,
      ) => {
        void relay;
        return new EsocialQueueAdapter({
          databaseService,
          transport,
          spoolService,
        });
      },
      inject: [
        DatabaseService,
        ESOCIAL_QUEUE_TRANSPORT,
        EsocialRelayMockResponder,
        EsocialSpoolService,
      ],
    },
    SubmissionService,
    ProtocolParser,
    ProcessingParser,
    RetryPolicyService,
    StatusSyncService,
    RetornoService,
    TotalizerParser,
    XsdValidatorService,
  ],
  exports: [
    CertificateStoreService,
    ESocialEmitService,
    ESocialWorkerService,
    ES04Service,
    ES05Service,
    IcpSignerService,
    S1xxxService,
    SubmissionService,
    ProtocolParser,
    ProcessingParser,
    RetryPolicyService,
    StatusSyncService,
    RetornoService,
    XsdValidatorService,
  ],
})
export class ESocialWorkerModule {}

function createEsocialQueueTransport(
  configService: ConfigService,
): QueueAdapterTransport {
  const mode =
    configService.get<string>('ESOCIAL_QUEUE_TRANSPORT') ?? 'in-memory';
  if (mode !== 'sqs') {
    return new InMemoryQueueTransport();
  }

  const topics = adapterQueueTopics(ESOCIAL_RELAY_QUEUE_KIND);
  return new SqsQueueTransport({
    clientConfig: {
      region:
        configService.get<string>('AWS_REGION') ??
        configService.get<string>('AWS_DEFAULT_REGION'),
    },
    queueUrls: {
      [topics.request]:
        configService.get<string>('ESOCIAL_SQS_SUBMIT_REQUEST_QUEUE_URL') ?? '',
      [topics.response]:
        configService.get<string>('ESOCIAL_SQS_SUBMIT_RESPONSE_QUEUE_URL') ??
        '',
      [topics.deadLetter]:
        configService.get<string>('ESOCIAL_SQS_SUBMIT_DLQ_URL') ?? '',
    },
  });
}
