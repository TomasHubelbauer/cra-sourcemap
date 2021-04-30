# Create-React-App Sourcemap Issue Repro

1. Scaffold a new TypeScript CRA: `npx create-react-app . --template typescript`
   (I've tried with JavaScript CRA as well, see below. Spoiler: it's the same.)
2. `npm run build` to produce the optimized production bundle with sourcemaps
3. Walk the generated JavaScript files and load their AST using TypeScript:

`index.js`
```js
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
        console.log(`  source: src/${map.source}:${map.line}:${map.column + 1}`);
        console.log(`  target: ${relative(process.cwd(), file.path)}:1:${node.pos + 1}`);
      }
    } while (nodes.length > 0);
  }
}()
```

4. Inspect which string literal nodes in the output are correctly mapped and not:

From `output.log`: does the `source` code location lead to the same string
literal symbol as the `target` code location (adjusting for JSX pointing to the
tag name):

```js
// Irrelevant - no good way to map to the SVG
"static/media/logo.5d5d9eef.svg"
  source: src/logo.svg:1:44
  target: build\static\js\main.2cd7b09f.chunk.js:1:119

// Okay - points to the JSX tag name
"div"
  source: src/App.tsx:7:5
  target: build\static\js\main.2cd7b09f.chunk.js:1:366

// Okay - points to the attribute value string literal
"App"
  source: src/App.tsx:7:20
  target: build\static\js\main.2cd7b09f.chunk.js:1:383

// Okay - points to the JSX tag name
"header"
  source: src/App.tsx:8:7
  target: build\static\js\main.2cd7b09f.chunk.js:1:408

// Okay - points to the attribute value string literal
"App-header"
  source: src/App.tsx:8:25
  target: build\static\js\main.2cd7b09f.chunk.js:1:428

// Okay - points to the JSX tag name
"img"
  source: src/App.tsx:9:9
  target: build\static\js\main.2cd7b09f.chunk.js:1:460

// Okay - points to the attribute value string literal
"App-logo"
  source: src/App.tsx:9:35
  target: build\static\js\main.2cd7b09f.chunk.js:1:485

// Okay - points to the attribute value string literal
"logo"
  source: src/App.tsx:9:50
  target: build\static\js\main.2cd7b09f.chunk.js:1:500

// Okay - points to the JSX tag name
"p"
  source: src/App.tsx:10:9
  target: build\static\js\main.2cd7b09f.chunk.js:1:527

// !!! Incorrect - points to the parent JSX element's tag name
"Edit "
  source: src/App.tsx:10:9
  target: build\static\js\main.2cd7b09f.chunk.js:1:536

// Okay - points to the JSX tag name
"code"
  source: src/App.tsx:11:16
  target: build\static\js\main.2cd7b09f.chunk.js:1:562

// !!! Incorrect - points to the preceeding JSX element's tag name
"src/App.tsx"
  source: src/App.tsx:11:16
  target: build\static\js\main.2cd7b09f.chunk.js:1:574

// !!! Incorrect - points to the parent JSX element's tag name
" and save to reload."
  source: src/App.tsx:10:9
  target: build\static\js\main.2cd7b09f.chunk.js:1:589

// Okay - points to the JSX tag name
"a"
  source: src/App.tsx:13:9
  target: build\static\js\main.2cd7b09f.chunk.js:1:631

// Okay - points to the attribute value string literal
"App-link"
  source: src/App.tsx:14:21
  target: build\static\js\main.2cd7b09f.chunk.js:1:646

// Okay - points to the attribute value string literal
"https://reactjs.org"
  source: src/App.tsx:15:16
  target: build\static\js\main.2cd7b09f.chunk.js:1:662

// Okay - points to the attribute value string literal
"_blank"
  source: src/App.tsx:16:18
  target: build\static\js\main.2cd7b09f.chunk.js:1:691

// Okay - points to the attribute value string literal
"noopener noreferrer"
  source: src/App.tsx:17:15
  target: build\static\js\main.2cd7b09f.chunk.js:1:704

// !!! Incorrect - points to the parent JSX element's tag name
"Learn React"
  source: src/App.tsx:13:9
  target: build\static\js\main.2cd7b09f.chunk.js:1:727

// Okay - points to the string literal
"localhost"
  source: src/serviceWorker.ts:14:32
  target: build\static\js\main.2cd7b09f.chunk.js:1:754

// Okay - points to the string literal
"[::1]"
  source: src/serviceWorker.ts:16:34
  target: build\static\js\main.2cd7b09f.chunk.js:1:794

// Okay - points to the string literal
"root"
  source: src/index.tsx:7:50
  target: build\static\js\main.2cd7b09f.chunk.js:1:981

// Okay - points to the string literal
"serviceWorker"
  source: src/serviceWorker.ts:140:7
  target: build\static\js\main.2cd7b09f.chunk.js:1:990
```

It looks as though in JSX, React children which are bare string literals, are
not mapped to the correct range in the original source code. Instead of mapping
onto the range where the literal string resides, the resolved code location
points to either the tag name of the parent JSX element if the string literal
child is the first child or it is preceeded by another string literal child. In
case it is preceeded by a JSX element, the code location resolves to its tag
name.

I've also tried to see how replacing `pos` with `end` in the script will behave.
Taking `end` and mapping it back to the original source location should return a
location which is at the end of the string literal, but it turns out, it will
always map at the start of the string literal in the case where `pos` worked as
expected and will map incorrectly to the exact same positions as `pos` did for
the cases which weren't working correctly even with `post`.

This leads me to believe the source map might not have enough information in it
to be able to correctly place every location and the best we can get is the
start of the symbol when querying any location within the symbol in the output,
but this would not be a problem as we can derive the source end locations easily
just by using the start location and the string literal symbol text length.
However, with this bug, this approach won't work as we're not even getting the
correct start locations.

The result of the script when ran with `end` instead of `pos` is in
`output-end.log`.

## JavaScript CRA

To distinguish whether this is a problem with TypeScript source map generator or
a general problem of CRA, I reran the same experiment on a JavaScript CRA
scaffold. The script used is the same, I just copied it and ran it in the `js`
directory where I placed the JS CRA scaffold.

```sh
npx create-react-app js
cd js
cp ../index.js .
npm i klaw fs-extra typescript source-map
npm run build
node index.js
```

The result is exactly the same - the incorrect mapping of JSX string literal
children onto the predecesor or parent (if no JSX predecesor) element tag name.

## To-Do

### Help solve the Babel source map issue this ended up being

- [GitHub issue](https://github.com/babel/babel/issues/10869)
- [Slack thread](https://babeljs.slack.com/archives/C062RC35M/p1619742006022600)

### Work on cra-ast-localize once the issue is resolved

That's the repo I've originally spotted the issue in.
