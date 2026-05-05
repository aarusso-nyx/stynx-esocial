export {
  ReturnXmlParseError,
  attributeText,
  childElements,
  directChildElement,
  directChildElements,
  directChildText,
  firstElement,
  firstOptionalText,
  firstText,
  parseReturnXmlDocument,
  serializeXmlNode,
  textContent,
} from './xml-tree.js';
export {
  parseEsocialReturnXml,
  parseProcessingResponseXml,
  parseProtocolResponseXml,
  parseTotalizerXml,
  protocolFromXml,
} from './parsers.js';
export {
  ReturnProcessor,
  validateReturnIngressEnvelope,
} from './return-processor.js';
export type {
  ReturnXmlNode,
} from './xml-tree.js';
export type {
  BatchProcessingReturn,
  ESocialTotalizerKind,
  EventProcessingReturn,
  ParsedEsocialReturn,
  ParsedIdentity,
  ParsedTotalizerReturn,
  ProtocolParseResult,
  ReturnOccurrence,
} from './parsers.js';
export type {
  PersistReturnCommand,
  ReturnClassificationStatus,
  ReturnIngressValidationResult,
  ReturnPersistenceRecord,
  ReturnProcessorOptions,
  ReturnProcessorResult,
  ReturnPublishers,
  ReturnRepository,
  ReturnRequestEnvelope,
  ReturnResponseClassification,
} from './return-processor.js';
