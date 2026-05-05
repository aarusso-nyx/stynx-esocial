import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const MUTATING_DECORATORS = new Set(['Post', 'Put', 'Patch', 'Delete']);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return controllerFiles(path);
    return path.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('audit coverage', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('requires every registered mutating route to call auditMutation', () => {
    expect(process.env.NODE_ENV).toBe('production');

    const srcDir = join(__dirname, '..', '..', 'backend', 'src');
    const missing: string[] = [];

    for (const filePath of controllerFiles(srcDir)) {
      const source = readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const classHasAuditMutation = [
        ...source.matchAll(/@AuditMutation\(/g),
      ].some((match) => {
        const after = source.slice(match.index ?? 0, (match.index ?? 0) + 300);
        return after.includes('class ');
      });

      const visit = (node: ts.Node) => {
        if (ts.isMethodDeclaration(node)) {
          const decorators = ts.getDecorators(node) ?? [];
          const mutatingDecorator = decorators.find((decorator) => {
            const expression = decorator.expression;
            if (!ts.isCallExpression(expression)) return false;
            const name = expression.expression.getText(sourceFile);
            return MUTATING_DECORATORS.has(name);
          });

          if (
            mutatingDecorator &&
            !classHasAuditMutation &&
            !node.getFullText(sourceFile).includes('@AuditMutation(') &&
            !node.body?.getText(sourceFile).includes('auditMutation(')
          ) {
            const methodName = node.name.getText(sourceFile);
            const decoratorName = (
              mutatingDecorator.expression as ts.CallExpression
            ).expression.getText(sourceFile);
            missing.push(
              `${filePath.replace(`${srcDir}/`, '')}:${decoratorName}:${methodName}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    expect(missing).toEqual([]);
  });
});

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
