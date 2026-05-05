import { assertHardenedXml } from '../xml/security.js';

export class ReturnXmlParseError extends Error {
  constructor(
    message: string,
    readonly code = 'ESOCIAL_RETURN_XML_PARSE_FAILED',
  ) {
    super(message);
    this.name = 'ReturnXmlParseError';
  }
}

export type ReturnXmlNode = Readonly<{
  name: string;
  localName: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly ReturnXmlNode[];
  text: string;
}>;

type MutableReturnXmlNode = {
  name: string;
  localName: string;
  attributes: Record<string, string>;
  children: MutableReturnXmlNode[];
  text: string;
};

const NAME_PATTERN = /^([^\s/>]+)/u;

export function parseReturnXmlDocument(
  xml: string,
  label: string,
): ReturnXmlNode {
  try {
    assertHardenedXml(xml);
    return parseXml(xml);
  } catch (error) {
    if (error instanceof ReturnXmlParseError) {
      throw new ReturnXmlParseError(`Invalid ${label} XML: ${error.message}`);
    }
    if (error instanceof Error) {
      throw new ReturnXmlParseError(`Invalid ${label} XML: ${error.message}`);
    }
    throw new ReturnXmlParseError(`Invalid ${label} XML.`);
  }
}

export function firstElement(
  node: ReturnXmlNode,
  localName: string,
): ReturnXmlNode | null {
  return descendants(node).find((child) => child.localName === localName) ?? null;
}

export function childElements(
  node: ReturnXmlNode,
  localName: string,
): ReturnXmlNode[] {
  return descendants(node).filter((child) => child.localName === localName);
}

export function directChildElements(
  node: ReturnXmlNode,
  localName: string,
): ReturnXmlNode[] {
  return node.children.filter((child) => child.localName === localName);
}

export function directChildElement(
  node: ReturnXmlNode,
  localName: string,
): ReturnXmlNode | null {
  return directChildElements(node, localName)[0] ?? null;
}

export function firstOptionalText(
  node: ReturnXmlNode,
  localName: string,
): string | null {
  const selected = firstElement(node, localName);
  const value = selected ? textContent(selected).trim() : '';
  return value || null;
}

export function firstText(node: ReturnXmlNode, localName: string): string {
  const value = firstOptionalText(node, localName);
  if (!value) {
    throw new ReturnXmlParseError(`eSocial return is missing ${localName}`);
  }
  return value;
}

export function directChildText(
  node: ReturnXmlNode,
  localName: string,
): string | null {
  const selected = directChildElement(node, localName);
  const value = selected ? textContent(selected).trim() : '';
  return value || null;
}

export function attributeText(
  node: ReturnXmlNode,
  name: string,
): string | null {
  const direct = node.attributes[name]?.trim();
  if (direct) return direct;

  const local = Object.entries(node.attributes).find(
    ([attributeName]) => localName(attributeName) === name,
  )?.[1]?.trim();
  return local || null;
}

export function textContent(node: ReturnXmlNode): string {
  return [
    node.text,
    ...node.children.map((child) => textContent(child)),
  ].join('');
}

export function serializeXmlNode(node: ReturnXmlNode): string {
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  const children = node.children.map((child) => serializeXmlNode(child)).join('');
  const text = escapeText(node.text);
  return `<${node.name}${attributes}>${text}${children}</${node.name}>`;
}

function parseXml(xml: string): ReturnXmlNode {
  const stack: MutableReturnXmlNode[] = [];
  let root: MutableReturnXmlNode | undefined;
  let index = 0;

  while (index < xml.length) {
    const open = xml.indexOf('<', index);
    if (open === -1) {
      appendText(stack, decodeXmlEntities(xml.slice(index)));
      break;
    }

    appendText(stack, decodeXmlEntities(xml.slice(index, open)));

    if (xml.startsWith('<!--', open)) {
      index = skipUntil(xml, '-->', open + 4, 'comment');
      continue;
    }

    if (xml.startsWith('<![CDATA[', open)) {
      const close = xml.indexOf(']]>', open + 9);
      if (close === -1) throw new ReturnXmlParseError('Unclosed CDATA section.');
      appendText(stack, xml.slice(open + 9, close));
      index = close + 3;
      continue;
    }

    if (xml.startsWith('<?', open)) {
      index = skipUntil(xml, '?>', open + 2, 'processing instruction');
      continue;
    }

    if (xml.startsWith('</', open)) {
      const close = xml.indexOf('>', open + 2);
      if (close === -1) throw new ReturnXmlParseError('Unclosed closing tag.');
      const name = xml.slice(open + 2, close).trim();
      const current = stack.pop();
      if (!current) {
        throw new ReturnXmlParseError(`Unexpected closing tag ${name}.`);
      }
      if (current.name !== name) {
        throw new ReturnXmlParseError(
          `Mismatched closing tag ${name}; expected ${current.name}.`,
        );
      }
      index = close + 1;
      continue;
    }

    if (xml.startsWith('<!', open)) {
      throw new ReturnXmlParseError('Unsupported XML declaration.');
    }

    const close = findTagEnd(xml, open + 1);
    const rawTag = xml.slice(open + 1, close).trim();
    const selfClosing = rawTag.endsWith('/');
    const tag = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const name = tag.match(NAME_PATTERN)?.[1];
    if (!name) throw new ReturnXmlParseError('Tag name is missing.');

    const node: MutableReturnXmlNode = {
      name,
      localName: localName(name),
      attributes: parseAttributes(tag.slice(name.length)),
      children: [],
      text: '',
    };

    const parent = stack.at(-1);
    if (parent) {
      parent.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      throw new ReturnXmlParseError('XML document has multiple root elements.');
    }

    if (!selfClosing) stack.push(node);
    index = close + 1;
  }

  if (stack.length > 0) {
    throw new ReturnXmlParseError(`Unclosed tag ${stack.at(-1)?.name ?? ''}.`);
  }
  if (!root) throw new ReturnXmlParseError('XML document is empty.');
  return freezeNode(root);
}

function appendText(stack: MutableReturnXmlNode[], value: string): void {
  if (!value) return;
  const current = stack.at(-1);
  if (current) current.text += value;
  if (!current && value.trim().length > 0) {
    throw new ReturnXmlParseError('Text is not allowed outside the root element.');
  }
}

function skipUntil(
  xml: string,
  marker: string,
  from: number,
  label: string,
): number {
  const close = xml.indexOf(marker, from);
  if (close === -1) throw new ReturnXmlParseError(`Unclosed XML ${label}.`);
  return close + marker.length;
}

function findTagEnd(xml: string, from: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = from; index < xml.length; index += 1) {
    const char = xml[index];
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === '>' && quote === null) return index;
  }
  throw new ReturnXmlParseError('Unclosed opening tag.');
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1]!] = decodeXmlEntities(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function descendants(node: ReturnXmlNode): ReturnXmlNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function freezeNode(node: MutableReturnXmlNode): ReturnXmlNode {
  return {
    name: node.name,
    localName: node.localName,
    attributes: { ...node.attributes },
    children: node.children.map((child) => freezeNode(child)),
    text: node.text,
  };
}

function localName(name: string): string {
  return name.includes(':') ? name.split(':').at(-1)! : name;
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);/giu,
    (entity) => {
      switch (entity) {
        case '&amp;':
          return '&';
        case '&lt;':
          return '<';
        case '&gt;':
          return '>';
        case '&quot;':
          return '"';
        case '&apos;':
          return "'";
        default:
          if (entity.startsWith('&#x') || entity.startsWith('&#X')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16));
          }
          return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10));
      }
    },
  );
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}
