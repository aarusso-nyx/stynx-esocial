import type { S1200RemunerationDto, S1200RubricLineDto } from '@esocial/contracts';

import {
  type BuilderContext,
  type BuilderMetadata,
  type BuiltXml,
  DtoValidationError,
  builtXml,
  cpf,
  eventId,
  fullRegistration,
  ideEmpregadorXml,
  ideEvento,
  moneyFromCents,
  quantity,
  requireNonEmptyArray,
  validateRequired,
  withFinalNewline,
  xmlEscape,
} from '../common.js';

export const S1200_METADATA: BuilderMetadata = {
  eventCode: 'S-1200',
  leiauteVersion: 'S-1.3',
  xmlRoot: 'eSocial',
  eventElement: 'evtRemun',
  namespace: 'http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00',
  xsdBinding: 'packages/domain/src/xml/xsd/bundle/evtRemun.xsd',
  tableVersionDependencies: ['S-1000', 'S-1005', 'S-1010', 'S-1020'],
};

export function buildS1200(
  dto: S1200RemunerationDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'competence',
    'payrollRunId',
    'payrollRunStatus',
  ]);
  if (dto.payrollRunStatus !== 'GENERATED') {
    throw new DtoValidationError(['payrollRunStatus']);
  }
  const workers = requireNonEmptyArray(dto.workers, 'workers');
  const events = workers.map((worker) => mapDtoToXmlNodes(dto, worker, ctx));
  const xml = events.map((event) => event.xml).join('---\n');
  return builtXml(
    xml,
    S1200_METADATA,
    events.map((event) => event.eventId),
  );
}

export function mapDtoToXmlNodes(
  dto: S1200RemunerationDto,
  worker: S1200RemunerationDto['workers'][number],
  ctx: BuilderContext = {},
): Readonly<{ eventId: string; xml: string }> {
  validateRequired(worker, [
    'employeeId',
    'cpf',
    'registration',
    'categoryCode',
  ]);
  const rubrics = requireNonEmptyArray(worker.rubrics, 'workers.rubrics');
  const id = eventId('S-1200', dto.tenantId, `${dto.payrollRunId}:${worker.employeeId}`);
  const itemsXml = rubrics.map((rubric) => rubricXml(rubric)).join('\n            ');
  const xml = withFinalNewline(`<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${S1200_METADATA.namespace}">
  <evtRemun Id="${id}">
    ${ideEvento(ctx, { includeRetification: true, includePeriod: dto.competence })}
    ${ideEmpregadorXml(dto.employerCnpj)}
    <ideTrabalhador><cpfTrab>${cpf(worker.cpf)}</cpfTrab></ideTrabalhador>
    <dmDev>
      <ideDmDev>${xmlEscape(worker.rubrics[0]?.ideDmDev ?? 'DM00000000000000000000')}</ideDmDev>
      <codCateg>${xmlEscape(worker.categoryCode)}</codCateg>
      <infoPerApur>
        <ideEstabLot>
          <tpInsc>1</tpInsc>
          <nrInsc>${fullRegistration(worker.establishmentRegistrationNumber ?? dto.employerCnpj)}</nrInsc>
          <codLotacao>${xmlEscape(worker.lotationCode ?? 'LOT01')}</codLotacao>
          <remunPerApur>
            <matricula>${xmlEscape(worker.registration).slice(0, 30)}</matricula>
            ${itemsXml}
          </remunPerApur>
        </ideEstabLot>
      </infoPerApur>
    </dmDev>
  </evtRemun>
</eSocial>`);
  return { eventId: id, xml };
}

function rubricXml(rubric: S1200RubricLineDto): string {
  validateRequired(rubric, ['rubricCode', 'ideDmDev', 'amount']);
  return `<itensRemun><codRubr>${xmlEscape(rubric.rubricCode)}</codRubr><ideTabRubr>${xmlEscape(
    rubric.rubricTableId ?? 'SGP',
  )}</ideTabRubr><qtdRubr>${quantity(rubric.quantity)}</qtdRubr><vrRubr>${moneyFromCents(
    rubric.amount,
  )}</vrRubr><indApurIR>0</indApurIR></itensRemun>`;
}
