# @wave/prototype

A feature's screens played as one working prototype on a mock API.

- `parseApiDocument(text)` reads an OpenAPI 3 document, JSON or YAML.
- `readApi(doc, mocks)` turns it into what the prototype serves: every
  operation with its path parameters' examples, the data roots it provides
  (`x-wave-provides`), the action effects that call it (`x-wave-effect`), its
  delay (`x-wave-delay`) and every response it can give (examples, named
  examples, `$ref`s, or a body made from the schema). A mock file (a JSON body
  named by operationId) replaces the first success response's body.
- `generateApi(feature, screens)` drafts that document from screens'
  `data-wave-*` attributes, with the values the design shows as examples.
  `screenData`, `checkCoverage` and `renderRequirements` describe what screens
  read, collect and call, what the API does not serve, and the data
  requirements page.
- `PROTOTYPE_SOURCE` is the runtime (bundled with MSW; run `npm run build`
  here after editing `src/runtime.ts` or upgrading msw; the test fails while
  the bundle is stale). `injectPrototype(html, src)` adds it first in the head.
- `protocol.ts`: the messages between the viewer and the frame, and
  `readFrameMessage`, which checks everything the frame sends.
