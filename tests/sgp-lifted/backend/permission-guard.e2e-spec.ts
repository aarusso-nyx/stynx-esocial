import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const MUTATING_DECORATORS = new Set(['Post', 'Put', 'Patch', 'Delete']);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return controllerFiles(path);
    return path.endsWith('.controller.ts') ? [path] : [];
  });
}

function decoratorNames(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  return (ts.getDecorators(node) ?? []).map((decorator) => {
    const expression = decorator.expression;
    const name = ts.isCallExpression(expression)
      ? expression.expression.getText(sourceFile)
      : expression.getText(sourceFile);
    return name.split('.').pop() ?? name;
  });
}

describe('permission guard route coverage', () => {
  it('requires every registered non-public route handler to declare a permission', () => {
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

      const visit = (node: ts.Node) => {
        if (ts.isMethodDeclaration(node)) {
          const methodDecorators = decoratorNames(node, sourceFile);
          const classDecorators = decoratorNames(node.parent, sourceFile);
          const isRoute = methodDecorators.some((name) =>
            HTTP_DECORATORS.has(name),
          );
          const isCovered =
            methodDecorators.includes('RequirePermission') ||
            methodDecorators.includes('Public') ||
            classDecorators.includes('RequirePermission') ||
            classDecorators.includes('Public');
          if (isRoute && !isCovered) {
            missing.push(
              `${filePath.replace(`${srcDir}/`, '')}:${node.name.getText(sourceFile)}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    expect(missing).toEqual([]);
  });

  it('keeps every mutating route protected by a concrete permission', () => {
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

      const visit = (node: ts.Node) => {
        if (ts.isMethodDeclaration(node)) {
          const methodDecorators = decoratorNames(node, sourceFile);
          const classDecorators = decoratorNames(node.parent, sourceFile);
          const isMutating = methodDecorators.some((name) =>
            MUTATING_DECORATORS.has(name),
          );
          const hasPermission =
            methodDecorators.includes('RequirePermission') ||
            classDecorators.includes('RequirePermission');
          if (
            isMutating &&
            !hasPermission &&
            !methodDecorators.includes('Public')
          ) {
            missing.push(
              `${filePath.replace(`${srcDir}/`, '')}:${node.name.getText(sourceFile)}`,
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
