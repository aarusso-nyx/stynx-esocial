import {
  type BuiltTableXmlEvent,
  type TableEventDto,
  buildTableEvent,
} from '../xml/builders/tables/index.js';

import type {
  BuilderMetadata,
  BuiltXml,
} from './common.js';

export function buildPromotedTableXml(dto: TableEventDto): BuiltXml {
  const built = buildTableEvent(dto);
  return {
    xml: built.xml,
    metadata: metadataFromTableEvent(built),
    eventIds: [built.eventId],
    xmlSha256: built.xmlSha256,
  };
}

function metadataFromTableEvent(built: BuiltTableXmlEvent): BuilderMetadata {
  return {
    eventCode: built.metadata.eventCode,
    leiauteVersion: built.metadata.leiauteVersion,
    xmlRoot: built.metadata.rootElement,
    eventElement: built.metadata.eventElement,
    namespace: built.metadata.namespace,
    xsdBinding: built.metadata.xsdPath,
    tableVersionDependencies: built.metadata.tableVersionDependencies,
  };
}
