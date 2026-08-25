import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { projectRootDir } from "./config/project.js";
import { getApiSourceDir, getExamplesContentDir, getGuideContentDir, getIntroContentPath } from "./config/site.js";

const require = createRequire(import.meta.url);
const ts = require(path.resolve(projectRootDir, "node_modules/typescript"));

const examplesRoot = getExamplesContentDir();
const guideRoot = getGuideContentDir();
const apiRoot = getApiSourceDir();
const introRoot = getIntroContentPath();

function toDisplayPath(filePath) {
  const relativePath = path.relative(projectRootDir, filePath).split(path.sep).join("/");
  return relativePath.startsWith("..") ? relativePath : `/${relativePath}`;
}

function normalizeText(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanDocCommentText(value) {
  return normalizeText(String(value ?? "")).replace(/^-+\s*/, "").trim();
}

function toTitle(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const structuredDocTagNames = new Set([
  "callback",
  "class",
  "constructor",
  "enum",
  "function",
  "interface",
  "member",
  "method",
  "param",
  "property",
  "protected",
  "public",
  "private",
  "readonly",
  "return",
  "returns",
  "template",
  "type",
  "typeParam",
  "typedef",
  "override"
]);

async function collectExampleFiles(dir, root) {
  const dirEntries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const dirEntry of dirEntries) {
    const fullPath = path.join(dir, dirEntry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");

    if (dirEntry.isDirectory()) {
      if (relativePath === "addons" || relativePath.startsWith("addons/")) {
        continue;
      }
      files.push(...(await collectExampleFiles(fullPath, root)));
      continue;
    }

    if (dirEntry.isFile() && dirEntry.name.endsWith(".js")) {
      files.push(path.relative(root, fullPath));
    }
  }

  return files;
}

// Manual directory scans need explicit watcher wiring. Built-in loaders like
// `glob()` auto-watch, but these JS examples are loaded as raw source strings.
async function syncExampleEntries({ examplesRoot, parseData, store, meta, generateDigest }) {
  const relativePaths = (await collectExampleFiles(examplesRoot, examplesRoot)).sort((a, b) => a.localeCompare(b));
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const normalizedPath = relativePath.split(path.sep).join("/");
      const id = normalizedPath.replace(/\.js$/, "");
      const segments = id.split("/");
      const category = segments[0] || "uncategorized";
      const fileName = segments.at(-1) || "example";
      const absoluteFilePath = path.join(examplesRoot, relativePath);
      const storedFilePath = path.relative(projectRootDir, absoluteFilePath).split(path.sep).join("/");

      let source;
      try {
        source = await readFile(absoluteFilePath, "utf-8");
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }

        throw error;
      }

      return {
        id,
        filePath: storedFilePath,
        data: {
          title: toTitle(fileName),
          description: `${toTitle(category)} example`,
          category,
          filePath: toDisplayPath(absoluteFilePath),
          source
        }
      };
    })
  );

  const validEntries = entries.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
  const digest = generateDigest(validEntries);
  const previousDigest = meta.get("examples-digest");

  if (previousDigest === digest) {
    return false;
  }

  const parsedEntries = await Promise.all(
    validEntries.map(async (entry) => ({
      id: entry.id,
      filePath: entry.filePath,
      data: await parseData({
        id: entry.id,
        data: entry.data,
        filePath: path.resolve(projectRootDir, entry.filePath)
      })
    }))
  );

  store.clear();

  for (const entry of parsedEntries) {
    store.set({
      id: entry.id,
      data: entry.data,
      filePath: entry.filePath
    });
  }

  meta.set("examples-digest", digest);
  return true;
}

async function collectSourceFiles(dir, root) {
  const dirEntries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const dirEntry of dirEntries) {
    const fullPath = path.join(dir, dirEntry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");

    if (dirEntry.isDirectory()) {
      if (dirEntry.name === "node_modules" || dirEntry.name === "dist" || dirEntry.name === "build") {
        continue;
      }

      files.push(...(await collectSourceFiles(fullPath, root)));
      continue;
    }

    if (!dirEntry.isFile() || !dirEntry.name.endsWith(".js")) {
      continue;
    }

    if (relativePath.endsWith("content.config.js")) {
      continue;
    }

    files.push(path.relative(root, fullPath));
  }

  return files;
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function getDocCommentText(node, sourceFile) {
  const jsDocNodes = node.jsDoc ?? [];
  const firstDoc = jsDocNodes[0];
  const description = normalizeText(ts.getTextOfJSDocComment(firstDoc?.comment) ?? "");
  const tags = [];

  for (const jsDoc of jsDocNodes) {
    for (const tag of jsDoc.tags ?? []) {
      if (structuredDocTagNames.has(tag.tagName?.text ?? "")) {
        continue;
      }

      tags.push(normalizeInlineText(tag.getText(sourceFile)));
    }
  }

  return {
    description,
    tags
  };
}

function hasJSDocTag(node, tagName) {
  for (const jsDoc of node.jsDoc ?? []) {
    for (const tag of jsDoc.tags ?? []) {
      if (tag.tagName?.text === tagName) {
        return true;
      }
    }
  }

  return false;
}

function formatParameterList(parameters, sourceFile) {
  return parameters.map((parameter) => normalizeInlineText(parameter.getText(sourceFile))).join(", ");
}

function stripOuterBraces(value) {
  const trimmed = normalizeInlineText(String(value ?? ""));

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function getNameText(name, sourceFile) {
  if (!name) {
    return "";
  }

  return normalizeInlineText(name.getText(sourceFile));
}

function getClassMemberSignature(member, sourceFile, checker) {
  if (ts.isConstructorDeclaration(member)) {
    return buildCallableInfo(member, sourceFile, checker, "constructor", "constructor")?.signature ?? `constructor(${formatParameterList(member.parameters, sourceFile)})`;
  }

  if (ts.isMethodDeclaration(member)) {
    return buildCallableInfo(member, sourceFile, checker, "method", getNameText(member.name, sourceFile))?.signature ?? getNameText(member.name, sourceFile);
  }

  if (ts.isGetAccessorDeclaration(member)) {
    return buildCallableInfo(member, sourceFile, checker, "getter", getNameText(member.name, sourceFile))?.signature ?? `get ${getNameText(member.name, sourceFile)}()`;
  }

  if (ts.isSetAccessorDeclaration(member)) {
    return buildCallableInfo(member, sourceFile, checker, "setter", getNameText(member.name, sourceFile))?.signature ?? `set ${getNameText(member.name, sourceFile)}(${formatParameterList(member.parameters, sourceFile)})`;
  }

  if (ts.isPropertyDeclaration(member)) {
    return getNameText(member.name, sourceFile);
  }

  return getNameText(member.name, sourceFile);
}

function unwrapExpression(expression) {
  let current = expression;

  while (
    current &&
    (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      (ts.isSatisfiesExpression?.(current) ?? false)
    )
  ) {
    current = current.expression;
  }

  return current;
}

function getEnumMemberSignature(member, sourceFile) {
  const name = getNameText(member.name, sourceFile);

  if (member.initializer) {
    return `${name} = ${normalizeInlineText(member.initializer.getText(sourceFile))}`;
  }

  return name;
}

function getTopLevelSignature(statement, sourceFile, checker) {
  if (ts.isClassDeclaration(statement)) {
    return `class ${getNameText(statement.name, sourceFile) || "default"}`;
  }

  if (ts.isEnumDeclaration(statement)) {
    const prefix = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ConstKeyword) ? "const " : "";
    return `${prefix}enum ${getNameText(statement.name, sourceFile) || "default"}`;
  }

  if (ts.isFunctionDeclaration(statement)) {
    return buildCallableInfo(statement, sourceFile, checker, "function", getNameText(statement.name, sourceFile) || "default")?.signature ?? `function ${getNameText(statement.name, sourceFile) || "default"}(${formatParameterList(statement.parameters, sourceFile)})`;
  }

  if (ts.isVariableStatement(statement)) {
    const declarationKeyword =
      statement.declarationList.flags & ts.NodeFlags.Const
        ? "const"
        : statement.declarationList.flags & ts.NodeFlags.Let
          ? "let"
          : "var";

    return statement.declarationList.declarations
      .map((declaration) => `${declarationKeyword} ${getNameText(declaration.name, sourceFile)}`)
      .join(", ");
  }

  if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly) {
      return "export type";
    }

    if (!statement.exportClause) {
      return `export * from ${statement.moduleSpecifier?.getText(sourceFile) ?? ""}`;
    }

    return `export ${statement.exportClause.getText(sourceFile)}${statement.moduleSpecifier ? ` from ${statement.moduleSpecifier.getText(sourceFile)}` : ""}`;
  }

  return statement.getText(sourceFile).split("\n", 1)[0].trim();
}

function getMemberKind(member) {
  if (ts.isConstructorDeclaration(member)) return "constructor";
  if (ts.isMethodDeclaration(member)) return "method";
  if (ts.isGetAccessorDeclaration(member)) return "getter";
  if (ts.isSetAccessorDeclaration(member)) return "setter";
  if (ts.isPropertyDeclaration(member)) return "property";
  return "member";
}

function getParameterTags(node) {
  const tags = [];

  for (const jsDoc of node.jsDoc ?? []) {
    for (const tag of jsDoc.tags ?? []) {
      if (tag.kind === ts.SyntaxKind.JSDocParameterTag) {
        tags.push(tag);
      }
    }
  }

  return tags;
}

function getReturnTag(node) {
  for (const jsDoc of node.jsDoc ?? []) {
    for (const tag of jsDoc.tags ?? []) {
      if (tag.kind === ts.SyntaxKind.JSDocReturnTag) {
        return tag;
      }
    }
  }

  return null;
}

function buildTypeParameters(node, sourceFile) {
  if (node.typeParameters?.length) {
    return node.typeParameters.map((typeParameter) => ({
      name: getNameText(typeParameter.name, sourceFile),
      constraint: typeParameter.constraint ? normalizeInlineText(typeParameter.constraint.getText(sourceFile)) : undefined,
      default: typeParameter.default ? normalizeInlineText(typeParameter.default.getText(sourceFile)) : undefined,
      description: ""
    }));
  }

  const typeParameters = [];

  for (const jsDoc of node.jsDoc ?? []) {
    for (const tag of jsDoc.tags ?? []) {
      if (tag.kind !== ts.SyntaxKind.JSDocTemplateTag) {
        continue;
      }

      const constraint = stripOuterBraces(tag.constraint?.getText(sourceFile) ?? "");
      const description = cleanDocCommentText(tag.comment ?? "");

      for (const typeParameter of tag.typeParameters ?? []) {
        typeParameters.push({
          name: getNameText(typeParameter.name, sourceFile),
          constraint: constraint || undefined,
          default: typeParameter.default ? normalizeInlineText(typeParameter.default.getText(sourceFile)) : undefined,
          description
        });
      }
    }
  }

  return typeParameters;
}

function getParameterDisplayName(parameter, symbol, sourceFile, tagName) {
  if (ts.isIdentifier(parameter.name)) {
    return getNameText(parameter.name, sourceFile);
  }

  if (tagName) {
    return tagName;
  }

  if (symbol?.name && !symbol.name.startsWith("__")) {
    return symbol.name;
  }

  return normalizeInlineText(parameter.name.getText(sourceFile));
}

function getCallableSignatureText(signatureText, node, kind, name) {
  if (kind === "constructor") {
    const separatorIndex = signatureText.lastIndexOf("): ");
    return `constructor${separatorIndex >= 0 ? signatureText.slice(0, separatorIndex + 1) : signatureText}`;
  }

  const prefix =
    kind === "getter"
      ? `get ${name}`
      : kind === "setter"
        ? `set ${name}`
        : name;
  const staticPrefix = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ? "static " : "";

  return `${staticPrefix}${prefix}${signatureText}`;
}

function buildCallableInfo(node, sourceFile, checker, kind, name) {
  const signature = checker.getSignatureFromDeclaration(node);

  if (!signature) {
    return null;
  }

  const signatureText = checker.signatureToString(
    signature,
    node,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature
  );
  const parameterTags = getParameterTags(node);
  const parameters = signature.getParameters().map((parameterSymbol, index) => {
    const parameter = node.parameters[index];

    if (!parameter) {
      return null;
    }

    const parameterTag = parameterTags[index] ?? null;
    const tagName = parameterTag?.name ? getNameText(parameterTag.name, sourceFile) : "";
    const displayName = getParameterDisplayName(parameter, parameterSymbol, sourceFile, tagName);
    const type = checker.getTypeOfSymbolAtLocation(parameterSymbol, parameter);

    return {
      name: displayName,
      type: checker.typeToString(type, parameter, ts.TypeFormatFlags.NoTruncation),
      optional: Boolean(parameter.questionToken || parameter.initializer),
      rest: Boolean(parameter.dotDotDotToken),
      defaultValue: parameter.initializer ? normalizeInlineText(parameter.initializer.getText(sourceFile)) : "",
      description: parameterTag ? cleanDocCommentText(parameterTag.comment ?? "") : ""
    };
  }).filter((parameter) => parameter !== null);

  const returnTag = getReturnTag(node);
  const returnType = checker.typeToString(signature.getReturnType(), node, ts.TypeFormatFlags.NoTruncation);

  return {
    signature: getCallableSignatureText(signatureText, node, kind, name),
    typeParameters: buildTypeParameters(node, sourceFile),
    parameters,
    returns: kind === "constructor" || kind === "setter"
      ? undefined
      : {
          type: returnType,
          description: returnTag ? cleanDocCommentText(returnTag.comment ?? "") : ""
        }
  };
}

function isSupportedTopLevelKind(kind) {
  return kind === "class" || kind === "enum" || kind === "function" || kind === "variable" || kind === "constant" || kind === "typedef";
}

function slugify(value) {
  return normalizeInlineText(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getApiKindLabel(kind) {
  switch (kind) {
    case "class":
      return "Class";
    case "enum":
      return "Enum";
    case "function":
      return "Function";
    case "constant":
      return "Constant";
    case "variable":
      return "Variable";
    case "typedef":
      return "Typedef";
    default:
      return toTitle(kind);
  }
}

function getApiEntryId(relativePath, kind, name) {
  const baseId = normalizeApiId(relativePath);
  const entrySlug = `${kind}-${slugify(name || "entry")}`;

  if (!baseId || baseId === "index") {
    return entrySlug;
  }

  return `${baseId}/${entrySlug}`;
}

function getApiEntryTitle(kind, name) {
  return `${getApiKindLabel(kind)} ${name || "default"}`;
}

function parseStandaloneDocBlocks(source) {
  const blocks = [];
  const matches = source.matchAll(/\/\*\*[\s\S]*?\*\//g);

  for (const match of matches) {
    const raw = match[0];
    if (!/@(callback|typedef|interface|enum)\b/.test(raw) || /@import\b/.test(raw)) {
      continue;
    }

    const after = source.slice((typeof match.index === "number" ? match.index : source.indexOf(raw)) + raw.length).trimStart();
    if (/^(export|class|function|const|let|var|import)\b/.test(after)) {
      continue;
    }

    const lines = raw
      .replace(/^\/\*\*|\*\/$/g, "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd());
    const descriptionLines = [];
    const tagBlocks = [];
    let sawTag = false;
    let currentTag = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (!sawTag) {
          descriptionLines.push("");
        } else if (currentTag) {
          currentTag.push("");
        }
        continue;
      }

      if (trimmed.startsWith("@")) {
        sawTag = true;
        currentTag = [trimmed];
        tagBlocks.push(currentTag);
        continue;
      }

      if (!sawTag) {
        descriptionLines.push(trimmed);
      } else if (currentTag) {
        currentTag.push(trimmed);
      }
    }

    const tags = tagBlocks.map((parts) => normalizeInlineText(parts.join(" ")));
    const displayTags = tags.filter((tag) => {
      const tagName = tag.match(/^@(\w+)/)?.[1] ?? "";
      return !structuredDocTagNames.has(tagName);
    });
    const typeTag = tags.find((tag) => /@(?:callback|typedef|interface|enum)\b/.test(tag)) ?? "";
    const index = typeof match.index === "number" ? match.index : source.indexOf(raw);
    const rawKind = typeTag.match(/^@(\w+)/)?.[1] ?? "type";
    const kind = rawKind === "callback" || rawKind === "interface" ? "typedef" : rawKind;
    const name = extractStandaloneDocName(typeTag);

    if (!name) {
      continue;
    }

    blocks.push({
      order: index,
      parent: undefined,
      kind,
      name,
      signature: typeTag || name,
      description: normalizeText(descriptionLines.join("\n")),
      tags: displayTags
    });
  }

  return blocks;
}

function extractStandaloneDocName(tagText) {
  const body = normalizeInlineText(tagText.replace(/^@\w+\s*/, ""));

  if (!body) {
    return "";
  }

  const closingIndex = Math.max(
    body.lastIndexOf("}"),
    body.lastIndexOf("]"),
    body.lastIndexOf(")"),
    body.lastIndexOf(">")
  );
  const candidate = closingIndex >= 0 ? body.slice(closingIndex + 1).trim() : body;

  return candidate.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "";
}

function collectEnumMemberSections(statement, enumName, sourceFile, declaration = null) {
  const sections = [];

  if (ts.isEnumDeclaration(statement)) {
    for (const member of statement.members) {
      sections.push({
        order: member.getStart(sourceFile),
        parent: enumName,
        kind: "value",
        name: getNameText(member.name, sourceFile),
        signature: getEnumMemberSignature(member, sourceFile),
        ...getDocCommentText(member, sourceFile)
      });
    }

    return sections;
  }

  if (!ts.isVariableStatement(statement)) {
    return sections;
  }

  const declarations = declaration ? [declaration] : statement.declarationList.declarations;

  for (const declarationNode of declarations) {
    if (!ts.isIdentifier(declarationNode.name)) {
      continue;
    }

    const initializer = declarationNode.initializer ? unwrapExpression(declarationNode.initializer) : null;

    if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
      continue;
    }

    for (const property of initializer.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      sections.push({
        order: property.getStart(sourceFile),
        parent: enumName,
        kind: "value",
        name: getNameText(property.name, sourceFile),
        signature: `${getNameText(property.name, sourceFile)} = ${normalizeInlineText(property.initializer.getText(sourceFile))}`,
        ...getDocCommentText(property, sourceFile)
      });
    }
  }

  return sections;
}

function collectApiSections(sourceFile, checker) {
  const sections = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      continue;
    }

    if (!hasExportModifier(statement)) {
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      const className = getNameText(statement.name, sourceFile) || "default";
      sections.push({
        order: statement.getStart(sourceFile),
        parent: undefined,
        kind: "class",
        name: className,
        signature: getTopLevelSignature(statement, sourceFile, checker),
        ...getDocCommentText(statement, sourceFile)
      });

      for (const member of statement.members) {
        if (ts.isConstructorDeclaration(member)) {
          const callable = buildCallableInfo(member, sourceFile, checker, "constructor", "constructor");
          sections.push({
            order: member.getStart(sourceFile),
            parent: className,
            kind: getMemberKind(member),
            name: "constructor",
            signature: callable?.signature ?? getClassMemberSignature(member, sourceFile, checker),
            callable: callable ?? undefined,
            ...getDocCommentText(member, sourceFile)
          });
          continue;
        }

        if (!member.name || ts.isPrivateIdentifier(member.name)) {
          continue;
        }

        const memberKind = getMemberKind(member);
        const callable =
          memberKind === "method" ||
          memberKind === "getter" ||
          memberKind === "setter"
            ? buildCallableInfo(member, sourceFile, checker, memberKind, getNameText(member.name, sourceFile))
            : null;

        sections.push({
          order: member.getStart(sourceFile),
          parent: className,
          kind: memberKind,
          name: getNameText(member.name, sourceFile),
          signature: callable?.signature ?? getClassMemberSignature(member, sourceFile, checker),
          callable: callable ?? undefined,
          ...getDocCommentText(member, sourceFile)
        });
      }

      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      const enumName = getNameText(statement.name, sourceFile) || "default";
      sections.push({
        order: statement.getStart(sourceFile),
        parent: undefined,
        kind: "enum",
        name: enumName,
        signature: getTopLevelSignature(statement, sourceFile, checker),
        ...getDocCommentText(statement, sourceFile)
      });
      sections.push(...collectEnumMemberSections(statement, enumName, sourceFile));
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      const name = getNameText(statement.name, sourceFile) || "default";
      const callable = buildCallableInfo(statement, sourceFile, checker, "function", name);
      sections.push({
        order: statement.getStart(sourceFile),
        parent: undefined,
        kind: "function",
        name,
        signature: callable?.signature ?? getTopLevelSignature(statement, sourceFile, checker),
        callable: callable ?? undefined,
        ...getDocCommentText(statement, sourceFile)
      });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const statementDoc = getDocCommentText(statement, sourceFile);
      const declarationKeyword =
        statement.declarationList.flags & ts.NodeFlags.Const
          ? "const"
          : statement.declarationList.flags & ts.NodeFlags.Let
            ? "let"
            : "var";
      const hasEnumTag = hasJSDocTag(statement, "enum");
      const sectionKind = hasEnumTag ? "enum" : declarationKeyword === "const" ? "constant" : "variable";
      const signatureKeyword = hasEnumTag ? "enum" : declarationKeyword;

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }

        const enumName = getNameText(declaration.name, sourceFile);

        sections.push({
          order: declaration.getStart(sourceFile),
          parent: undefined,
          kind: sectionKind,
          name: enumName,
          signature: `${signatureKeyword} ${enumName}`,
          ...statementDoc
        });

        if (hasEnumTag) {
          sections.push(...collectEnumMemberSections(statement, enumName, sourceFile, declaration));
        }
      }
    }
  }

  sections.push(...parseStandaloneDocBlocks(sourceFile.getFullText()));

  return sections
    .filter((section) => section.parent || isSupportedTopLevelKind(section.kind))
    .sort((a, b) => a.order - b.order);
}

function buildApiEntries(relativePath, filePath, source, sections) {
  const topLevelSections = sections.filter((section) => !section.parent && isSupportedTopLevelKind(section.kind));
  const childSections = new Map();
  const groupedTopLevelSections = new Map();

  for (const section of sections) {
    if (!section.parent) {
      continue;
    }

    if (!childSections.has(section.parent)) {
      childSections.set(section.parent, []);
    }

    childSections.get(section.parent)?.push(section);
  }

  for (const section of topLevelSections) {
    const key = `${section.kind}:${section.name}`;
    const existing = groupedTopLevelSections.get(key);

    if (!existing) {
      groupedTopLevelSections.set(key, {
        kind: section.kind,
        name: section.name,
        order: section.order,
        sections: [section]
      });
      continue;
    }

    existing.sections.push(section);
    existing.order = Math.min(existing.order, section.order);
  }

  return [...groupedTopLevelSections.values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((group) => {
      const detailSections =
        group.kind === "class" || group.kind === "enum"
          ? [...group.sections, ...(childSections.get(group.name) ?? [])]
          : group.sections;
      const orderedSections = [...detailSections].sort((a, b) => a.order - b.order);
      const title = getApiEntryTitle(group.kind, group.name);

      return {
        id: getApiEntryId(relativePath, group.kind, group.name),
        title,
        name: group.name,
        kind: group.kind,
        description: summarizeSections(orderedSections, `${title} API reference`),
        filePath: toDisplayPath(filePath),
        source,
        sections: orderedSections
      };
    });
}

function summarizeSections(sections, fallback) {
  const section = sections.find((item) => item.description || item.tags.length > 0);
  if (!section) {
    return fallback;
  }

  return section.description || section.signature || fallback;
}

function normalizeApiId(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const withoutExt = normalizedPath.replace(/\.js$/, "");

  if (withoutExt.endsWith("/index")) {
    return withoutExt.slice(0, -"/index".length);
  }

  return withoutExt;
}

function createApiProgram(rootNames) {
  const configPath = path.resolve(projectRootDir, ".configs/tsconfig.lib.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
    throw new Error(`Unable to read TypeScript config for API docs: ${message}`);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

  return ts.createProgram({
    rootNames,
    options: parsedConfig.options
  });
}

const examples = defineCollection({
  loader: {
    name: "examples-loader",
    async load({ store, parseData, watcher, logger, meta, generateDigest }) {
      await syncExampleEntries({
        examplesRoot,
        parseData,
        store,
        meta,
        generateDigest
      });

      if (!watcher) {
        return;
      }

      watcher.add(examplesRoot);

      let syncQueue = Promise.resolve();
      const scheduleSync = () => {
        syncQueue = syncQueue
          .then(async () => {
            const changed = await syncExampleEntries({
              examplesRoot,
              parseData,
              store,
              meta,
              generateDigest
            });
            if (changed) {
              logger.info("Reloaded examples");
            }
          })
          .catch((error) => {
            logger.error(
              `Failed to reload examples: ${error instanceof Error ? error.message : String(error)}`
            );
          });

        return syncQueue;
      };

      watcher.on("add", scheduleSync);
      watcher.on("change", scheduleSync);
      watcher.on("unlink", scheduleSync);
    }
  },
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    filePath: z.string(),
    source: z.string()
  })
});

const api = defineCollection({
  loader: async () => {
    const relativePaths = (await collectSourceFiles(apiRoot, apiRoot)).sort((a, b) => a.localeCompare(b));
    const filePaths = relativePaths.map((relativePath) => path.join(apiRoot, relativePath));
    const program = createApiProgram(filePaths);
    const checker = program.getTypeChecker();

    const entries = await Promise.all(
      relativePaths.map(async (relativePath) => {
        const filePath = path.join(apiRoot, relativePath);
        const source = await readFile(filePath, "utf-8");
        const sourceFile = program.getSourceFile(filePath) ?? ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const sections = collectApiSections(sourceFile, checker);
        return buildApiEntries(relativePath, filePath, source, sections);
      })
    );

    return entries.flat().filter((entry) => entry.sections.length > 0);
  },
  schema: z.object({
    title: z.string(),
    name: z.string(),
    kind: z.string(),
    description: z.string(),
    filePath: z.string(),
    source: z.string(),
    sections: z.array(
      z.object({
        order: z.number(),
        parent: z.string().optional(),
        kind: z.string(),
        name: z.string(),
        signature: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        callable: z.object({
          signature: z.string(),
          typeParameters: z.array(
            z.object({
              name: z.string(),
              constraint: z.string().optional(),
              default: z.string().optional(),
              description: z.string()
            })
          ),
          parameters: z.array(
            z.object({
              name: z.string(),
              type: z.string(),
              optional: z.boolean(),
              rest: z.boolean(),
              defaultValue: z.string(),
              description: z.string()
            })
          ),
          returns: z.object({
            type: z.string(),
            description: z.string()
          }).optional()
        }).optional()
      })
    )
  })
});

const guide = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: guideRoot,
    deferRender: true
  }),
  schema: z.object({
    title: z.string()
  })
});

const intro = defineCollection({
  loader: glob({
    pattern: path.basename(introRoot),
    base: path.dirname(introRoot),
    deferRender: true
  }),
  schema: z.object({
    title: z.string().optional()
  })
});

export const collections = {
  intro,
  examples,
  guide,
  api
};
