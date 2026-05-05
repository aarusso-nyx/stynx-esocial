import { BadRequestException } from '@nestjs/common';
import * as libxml from 'libxmljs2';

export type ParsedXmlDocument = libxml.Document;
export interface ParsedXmlNode {
  get(xpath: string): unknown;
  find(xpath: string): unknown[];
  text(): string;
  attr(name: string): { value(): string } | undefined;
  toString(): string;
}
type XmlContainer = libxml.Document | ParsedXmlNode;

export interface ParsedIdentity {
  type: 'CNPJ' | 'CPF' | 'CAEPF' | 'CNO';
  registration: string;
  cnpj?: string;
  cpf?: string;
  caepf?: string;
  cno?: string;
}

const IDENTITY_FIELD_BY_TPINSC = {
  '1': ['CNPJ', 'cnpj'],
  '2': ['CPF', 'cpf'],
  '3': ['CAEPF', 'caepf'],
  '4': ['CNO', 'cno'],
} as const;

export function parseXmlDocument(
  xml: string,
  label: string,
): ParsedXmlDocument {
  try {
    return libxml.parseXml(xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(`Invalid ${label} XML: ${message}`);
  }
}

export function firstText(node: XmlContainer, name: string): string {
  const value = firstOptionalText(node, name);
  if (!value) {
    throw new BadRequestException(`eSocial return is missing ${name}`);
  }
  return value;
}

export function firstOptionalText(
  node: XmlContainer,
  name: string,
): string | null {
  const selected = node.get(`.//*[local-name() = '${name}']`) as
    | { text(): string }
    | undefined;
  const value = selected?.text().trim();
  return value || null;
}

export function directChildText(
  node: ParsedXmlNode,
  name: string,
): string | null {
  const selected = node.get(`./*[local-name() = '${name}']`) as
    | { text(): string }
    | undefined;
  const value = selected?.text().trim();
  return value || null;
}

export function firstElement(
  node: XmlContainer,
  name: string,
): ParsedXmlNode | null {
  return (
    (node.get(`.//*[local-name() = '${name}']`) as ParsedXmlNode | undefined) ??
    null
  );
}

export function childElements(
  node: XmlContainer,
  name: string,
): ParsedXmlNode[] {
  return (node as { find(xpath: string): unknown[] }).find(
    `.//*[local-name() = '${name}']`,
  ) as ParsedXmlNode[];
}

export function directChildElements(
  node: ParsedXmlNode,
  name: string,
): ParsedXmlNode[] {
  return node.find(`./*[local-name() = '${name}']`) as ParsedXmlNode[];
}

export function attributeText(
  node: ParsedXmlNode,
  name: string,
): string | null {
  const value = node.attr(name)?.value()?.trim();
  return value || null;
}

export function parseIdentity(
  node: ParsedXmlNode | null,
): ParsedIdentity | null {
  if (!node) return null;
  const tpInsc = directChildText(node, 'tpInsc');
  const nrInsc = directChildText(node, 'nrInsc');
  if (!tpInsc || !nrInsc) return null;
  const mapped =
    IDENTITY_FIELD_BY_TPINSC[tpInsc as keyof typeof IDENTITY_FIELD_BY_TPINSC];
  if (!mapped) {
    throw new BadRequestException(`Unsupported eSocial tpInsc: ${tpInsc}`);
  }
  const [type, field] = mapped;
  return {
    type,
    registration: nrInsc,
    [field]: nrInsc,
  };
}

export function soapFaultText(document: libxml.Document): string | null {
  const fault = firstElement(document, 'Fault');
  if (!fault) return null;
  return (
    firstOptionalText(fault, 'faultstring') ??
    firstOptionalText(fault, 'Reason') ??
    fault.text().trim() ??
    'SOAP Fault'
  );
}
