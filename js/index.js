const klaw = require('klaw');
const fs = require('fs-extra');
const ts = require('typescript');
const sourcemap = require('source-map');
const { relative } = require('path');

void async function () {
  for await (const file of klaw('build')) {
    if (!file.stats.isFile()) {
      continue;
    }

    if (!file.path.endsWith('.js')) {
      continue;
    }

    let sourceMap;
    try {
      sourceMap = await new sourcemap.SourceMapConsumer(String(await fs.readFile(file.path + '.map')));
    }
    catch (error) {
      // Ignore files without sourcemaps
      continue;
    }

    const sourceFile = ts.createSourceFile(
      file.path,
      String(await fs.readFile(file.path)),
      ts.ScriptTarget.ES5, // tsconfig.json
      true
    );

    const nodes = [sourceFile];
    do {
      const node = nodes.shift();
      nodes.unshift(...node.getChildren());
      if (node.kind === ts.SyntaxKind.StringLiteral) {
        const map = sourceMap.originalPositionFor({ line: 1, column: node.pos });
        if (map.source === null || map.source === '../webpack/bootstrap') {
          continue;
        }

        console.log(JSON.stringify(node.text));
        console.log(`  source: js/src/${map.source}:${map.line}:${map.column + 1}`);
        console.log(`  target: js/${relative(process.cwd(), file.path)}:1:${node.pos + 1}`);
      }
    } while (nodes.length > 0);
  }
}()
