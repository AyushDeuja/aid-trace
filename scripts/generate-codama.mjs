import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import renderJavaScriptVisitor from "@codama/renderers-js";

const idl = JSON.parse(
  await readFile(
    new URL("../anchor/target/idl/aidtrace.json", import.meta.url),
    "utf8"
  )
);
const codama = createFromRoot(rootNodeFromAnchor(idl));

await codama.accept(renderJavaScriptVisitor(resolve("app/generated/aidtrace")));
