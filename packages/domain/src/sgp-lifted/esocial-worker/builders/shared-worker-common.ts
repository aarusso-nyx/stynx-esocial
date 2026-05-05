import { createHash } from 'node:crypto';

import { employerRegistration, onlyDigits, xmlEscape } from './s1xxx-common';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function ideEmpregadorXml(cnpj: string | null | undefined): string {
  return `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(cnpj)}</nrInsc></ideEmpregador>`;
}

export function cpf(value: string | null | undefined): string {
  return onlyDigits(value).padStart(11, '0').slice(0, 11);
}

export function dateOnly(value: Date | string | null | undefined): string {
  if (!value) return '2000-01-01';
  return new Date(value).toISOString().slice(0, 10);
}

export function cleanText(
  value: string | null | undefined,
  fallback: string,
): string {
  const cleaned = String(value ?? fallback).trim();
  return xmlEscape(cleaned || fallback);
}

export function addressXml(address: unknown): string {
  const data = isRecord(address) ? address : {};
  const street = cleanText(
    stringProp(data, 'street') ?? stringProp(data, 'dscLograd'),
    'Rua Nao Informada',
  );
  const number = cleanText(
    stringProp(data, 'number') ?? stringProp(data, 'nrLograd'),
    'S/N',
  );
  const zip = onlyDigits(
    stringProp(data, 'zip') ?? stringProp(data, 'cep') ?? '70000000',
  )
    .padStart(8, '0')
    .slice(0, 8);
  const city = onlyDigits(
    stringProp(data, 'cityCode') ?? stringProp(data, 'codMunic') ?? '5300108',
  )
    .padStart(7, '0')
    .slice(0, 7);
  const uf = cleanText(
    (stringProp(data, 'state') ?? stringProp(data, 'uf') ?? 'DF').slice(0, 2),
    'DF',
  ).toUpperCase();
  const neighborhood =
    stringProp(data, 'neighborhood') ?? stringProp(data, 'bairro');
  const neighborhoodXml = neighborhood
    ? `<bairro>${cleanText(neighborhood, 'Centro')}</bairro>`
    : '';
  return `<endereco><brasil><tpLograd>R</tpLograd><dscLograd>${street}</dscLograd><nrLograd>${number}</nrLograd>${neighborhoodXml}<cep>${zip}</cep><codMunic>${city}</codMunic><uf>${uf}</uf></brasil></endereco>`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringProp(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}
