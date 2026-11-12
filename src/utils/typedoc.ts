import { ReflectionKind } from "typedoc";
import type { JSONOutput } from "typedoc";
import { getLink } from "../config/link-map.ts";

interface ParsedJSDocLink {
  target: string;
  text: string;
  codeStyle: boolean;
}

interface MarkdownLinkPart {
  target?: Extract<JSONOutput.CommentDisplayPart, { kind: "inline-tag" }>["target"] | JSONOutput.SomeReflection;
  text?: string;
  tsLinkText?: string;
}

interface FormattedTypeParameter {
  name: string;
  type?: JSONOutput.SomeType;
  constraint?: string;
  default?: JSONOutput.SomeType;
  defaultValue: string;
  description: string;
}

const structuredTagNames = new Set([
  "@callback",
  "@class",
  "@constructor",
  "@enum",
  "@extends",
  "@function",
  "@interface",
  "@implements",
  "@member",
  "@method",
  "@param",
  "@property",
  "@protected",
  "@public",
  "@private",
  "@readonly",
  "@return",
  "@returns",
  "@template",
  "@type",
  "@typeParam",
  "@typedef",
  "@override",
  "@category",
  "@throws",
  "@example"
]);

const kindLabels = new Map([
  [ReflectionKind.Class, ["Class", "Classes"]],
  [ReflectionKind.Enum, ["Enum", "Enums"]],
  [ReflectionKind.Function, ["Function", "Functions"]],
  [ReflectionKind.Variable, ["Variable", "Variables"]],
  [ReflectionKind.Interface, ["Interface", "Interfaces"]],
  [ReflectionKind.TypeAlias, ["Type alias", "Type aliases"]]
]);

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value: string | undefined): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function normalizeMarkdown(value: string | undefined): string {
  return (value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getReflectionKindName(kind: number): string {
  const name = ReflectionKind[kind];
  return typeof name === "string" ? name : `Kind ${kind}`;
}

function getReflectionMemberBadge(kind: number): { letter: string; name: string } | null {
  if ([ReflectionKind.Constructor, ReflectionKind.ConstructorSignature].includes(kind)) {
    return { letter: "C", name: "constructor" };
  }

  if (kind === ReflectionKind.Method) {
    return { letter: "M", name: "method" };
  }

  if ([ReflectionKind.Property, ReflectionKind.Accessor].includes(kind)) {
    return { letter: "P", name: "property" };
  }

  if ([ReflectionKind.Function, ReflectionKind.CallSignature].includes(kind)) {
    return { letter: "F", name: "function" };
  }

  return null;
}

function getReflectionMemberAnchor(reflection: JSONOutput.SomeReflection | undefined): string {
  const name = reflection?.name.trim() ?? "";
  const anchor = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return anchor || "member";
}

function getReflectionKindSlug(kind: number): string {
  return getReflectionKindName(kind).replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function getReflectionKindLabel(kind: number, plural = false): string {
  const labels = kindLabels.get(kind);
  if (labels) {
    return labels[plural ? 1 : 0];
  }

  return getReflectionKindName(kind);
}

function displayPartsToText(parts: JSONOutput.CommentDisplayPart[] | undefined): string {
  return normalizeText((parts ?? [])
    .map((part) => part.text)
    .join(""));
}

function displayPartsToRawText(parts: JSONOutput.CommentDisplayPart[] | undefined): string {
  return (parts ?? [])
    .map((part) => part.text)
    .join("");
}

function escapeMarkdownLinkLabel(value: string | undefined): string {
  return (value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("~", "\\~");
}

function escapeMarkdownCode(value: string | undefined): string {
  return (value ?? "").replaceAll("`", "\\`");
}

function parseJSDocLink(value: string): ParsedJSDocLink | undefined {
  const match = value.match(/^\{@(link|linkcode)\s+([^{}]+)\}$/);
  if (!match) {
    return undefined;
  }

  const body = match[2].trim();
  const pipeIndex = body.indexOf("|");
  let target: string | undefined;
  let labelPart = "";

  if (pipeIndex >= 0) {
    target = body.slice(0, pipeIndex).trim();
    labelPart = body.slice(pipeIndex + 1).trim();
  } else {
    const words = body.split(/\s+/);
    target = words.shift();
    labelPart = words.join(" ");
  }

  if (!target) {
    return undefined;
  }

  const importTarget = target.match(/^import\([^)]*\)\.(.+)$/);
  const label = labelPart.trim() || importTarget?.[1] || target;

  return {
    target,
    text: label,
    codeStyle: match[1] === "linkcode"
  };
}

function renderJSDocLink(value: string): string | undefined {
  const part = parseJSDocLink(value);
  if (!part) {
    return undefined;
  }

  const href = resolveMarkdownLink(part);
  const display = part.codeStyle
    ? `\`${escapeMarkdownCode(part.text)}\``
    : escapeMarkdownLinkLabel(part.text);

  return href ? `[${display}](<${href}>)` : display;
}

function convertJSDocLinks(value: string | undefined): string {
  return (value ?? "").replace(/(\{@(?:link|linkcode)\s+[^{}]+\})/g, (match) => (
    renderJSDocLink(match) ?? match
  ));
}

function getTargetName(
  target: Extract<JSONOutput.CommentDisplayPart, { kind: "inline-tag" }>["target"] |
  JSONOutput.SomeReflection |
  undefined
): string {
  if (typeof target === "string") {
    return target;
  }

  if (target && typeof target === "object") {
    return "name" in target && typeof target.name === "string"
      ? target.name
      : "qualifiedName" in target && typeof target.qualifiedName === "string"
        ? target.qualifiedName
        : "";
  }

  return "";
}

function getTargetNames(
  target: Extract<JSONOutput.CommentDisplayPart, { kind: "inline-tag" }>["target"] |
  JSONOutput.SomeReflection |
  undefined
): string[] {
  if (!target || typeof target !== "object") {
    return [];
  }

  return [
    "name" in target && typeof target.name === "string" ? target.name : undefined,
    "qualifiedName" in target && typeof target.qualifiedName === "string" ? target.qualifiedName : undefined
  ].filter((value): value is string => Boolean(value)).map((value) => value.trim());
}

function resolveMarkdownLink(part: MarkdownLinkPart): string | undefined {
  const target = part.target;
  const targetValue = typeof target === "string" ? target.trim() : "";

  const candidates = [
    targetValue,
    ...getTargetNames(target),
    part?.tsLinkText,
    part?.text
  ]
    .filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const exactLink = getLink(candidate);
    if (exactLink) {
      return exactLink;
    }

    const separatorIndex = candidate.search(/[.#~]/);
    if (separatorIndex > 0) {
      const parentLink = getLink(candidate.slice(0, separatorIndex));
      if (parentLink) {
        return parentLink;
      }
    }
  }

  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(targetValue)) {
    return targetValue;
  }

  return undefined;
}

function displayPartsToMarkdown(parts: JSONOutput.CommentDisplayPart[] | undefined): string {
  const markdown = (parts ?? [])
    .map((part) => {
      if (part?.kind === "inline-tag") {
        const label = (part.tsLinkText ?? part.text ?? getTargetName(part.target) ?? "link").trim();
        const href = resolveMarkdownLink(part);
        const display = part.tag === "@linkcode"
          ? `\`${escapeMarkdownCode(label)}\``
          : escapeMarkdownLinkLabel(label);

        return href ? `[${display}](<${href}>)` : display;
      }

      // TypeDoc already stores examples and @default blocks as Markdown code
      // fences. Preserve those fences instead of wrapping them a second time.
      return part.text;
    })
    .join("");

  return normalizeMarkdown(convertJSDocLinks(markdown));
}

function getReflectionComment(
  reflection: JSONOutput.SomeReflection | undefined,
  signature?: JSONOutput.SomeReflection | null
): JSONOutput.Comment | undefined {
  return signature?.comment ?? reflection?.comment;
}

function getReflectionDescriptionMarkdown(
  reflection: JSONOutput.SomeReflection | undefined,
  signature?: JSONOutput.SomeReflection | null
): string {
  return displayPartsToMarkdown(getReflectionComment(reflection, signature)?.summary);
}

function getReflectionTags(
  reflection: JSONOutput.SomeReflection | undefined,
  signature?: JSONOutput.SomeReflection | null
): string[] {
  return (getReflectionComment(reflection, signature)?.blockTags ?? [])
    .filter((tag) => !structuredTagNames.has(tag.tag))
    .map((tag) => {
      const content = displayPartsToText(tag.content);
      return normalizeInlineText([tag.tag, tag.name, content].filter(Boolean).join(" "));
    })
    .filter(Boolean);
}

function getReflectionThrowsMarkdown(
  reflection: JSONOutput.SomeReflection | undefined,
  signature?: JSONOutput.SomeReflection | null
): string[] {
  return (getReflectionComment(reflection, signature)?.blockTags ?? [])
    .filter((tag) => tag.tag === "@throws")
    .map((tag) => displayPartsToMarkdown(tag.content))
    .filter(Boolean);
}

function getReflectionExamples(
  reflection: JSONOutput.SomeReflection | undefined,
  signature?: JSONOutput.SomeReflection | null
): Array<{ code: string; language: string }> {
  return (getReflectionComment(reflection, signature)?.blockTags ?? [])
    .filter((tag) => tag.tag === "@example")
    .map((tag) => {
      const content = displayPartsToRawText(tag.content).replace(/\r\n?/g, "\n").trim();
      const fenced = content.match(/```([^\n]*)\n([\s\S]*?)\n```/);
      const language = fenced?.[1].trim().split(/\s+/, 1)[0] || "js";
      const code = (fenced?.[2] ?? content).trim();

      return { code, language };
    })
    .filter((example) => example.code);
}

function getBlockTag(
  reflection: JSONOutput.SomeReflection | undefined,
  signature: JSONOutput.SomeReflection | null | undefined,
  names: string[]
): JSONOutput.CommentTag | undefined {
  return (getReflectionComment(reflection, signature)?.blockTags ?? [])
    .find((tag) => names.includes(tag.tag));
}

function getBlockTagMarkdown(
  reflection: JSONOutput.SomeReflection | undefined,
  signature: JSONOutput.SomeReflection | null | undefined,
  names: string[]
): string {
  return displayPartsToMarkdown(getBlockTag(reflection, signature, names)?.content);
}

function getReflectionCategory(reflection: JSONOutput.SomeReflection | undefined): string | undefined {
  const comments = [
    getReflectionSignatures(reflection)[0]?.comment,
    reflection?.comment
  ];

  for (const comment of comments) {
    const tag = comment?.blockTags?.find((item) => item.tag === "@category");
    if (!tag) {
      continue;
    }

    const category = normalizeInlineText(displayPartsToText(tag.content) || tag.name);
    if (category) {
      return category;
    }
  }

  return undefined;
}

function formatLiteralValue(
  value: Extract<JSONOutput.SomeType, { type: "literal" }>["value"]
): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return `${value}`;
}

function formatType(type: JSONOutput.SomeType | undefined): string {
  if (!type) {
    return "";
  }

  switch (type.type) {
    case "intrinsic":
      return type.name ?? "unknown";
    case "reference": {
      const name = type.name ?? type.qualifiedName ?? "unknown";
      const typeArguments = (type.typeArguments ?? []).map(formatType).join(", ");
      return typeArguments ? `${name}<${typeArguments}>` : name;
    }
    case "array": {
      const elementType = formatType(type.elementType) || "unknown";
      const wrapped = /\s[|&]\s/.test(elementType) ? `(${elementType})` : elementType;
      return `${wrapped}[]`;
    }
    case "union":
      return (type.types ?? []).map(formatType).filter(Boolean).join(" | ");
    case "intersection":
      return (type.types ?? []).map(formatType).filter(Boolean).join(" & ");
    case "tuple":
      return `[${(type.elements ?? []).map(formatType).join(", ")}]`;
    case "literal":
      return formatLiteralValue(type.value);
    case "typeOperator":
      return `${type.operator ?? ""} ${formatType(type.target)}`.trim();
    case "indexedAccess":
      return `${formatType(type.objectType)}[${formatType(type.indexType)}]`;
    case "query":
      return `typeof ${formatType(type.queryType)}`;
    case "conditional":
      return `${formatType(type.checkType)} extends ${formatType(type.extendsType)} ? ${formatType(type.trueType)} : ${formatType(type.falseType)}`;
    case "namedTupleMember": {
      const name = type.name ?? "item";
      const optional = type.isOptional ? "?" : "";
      const rest = type.isRest ? "..." : "";
      return `${rest}${name}${optional}: ${formatType(type.element)}`;
    }
    case "optional":
      return `${formatType(type.elementType)}?`;
    case "rest":
      return `...${formatType(type.elementType)}`;
    case "inferred":
      return `infer ${type.name ?? "T"}`;
    case "predicate":
      return `${type.name ?? "value"} is ${formatType(type.targetType)}`;
    case "templateLiteral":
      return type.head ?? "template literal";
    case "reflection":
      return "object";
    default: {
      const name = "name" in type
        ? type.name
        : "qualifiedName" in type
          ? type.qualifiedName
          : undefined;
      if (name) {
        return name;
      }

      return type.type ? type.type : "unknown";
    }
  }
}

function formatDefaultValue(value: string | JSONOutput.SomeType | undefined): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return typeof value === "string" ? value : formatType(value);
}

function getTypeParameters(
  reflection: JSONOutput.SomeReflection | undefined
): FormattedTypeParameter[] {
  if (!reflection || !("typeParameters" in reflection)) {
    return [];
  }

  return (reflection.typeParameters ?? []).map((typeParameter) => ({
    name: typeParameter.name,
    type: typeParameter.type,
    constraint: formatType(typeParameter.type),
    default: typeParameter.default,
    defaultValue: formatDefaultValue(typeParameter.default),
    description: displayPartsToMarkdown(typeParameter.comment?.summary)
  }));
}

function formatParameter(parameter: JSONOutput.ParameterReflection): string {
  const flags = parameter.flags ?? {};
  const name = normalizeInlineText(parameter.name || "parameter");
  const rest = flags.isRest ? "..." : "";
  const optional = flags.isOptional && !flags.isRest ? "?" : "";
  const type = formatType(parameter.type) || "unknown";
  const defaultValue = formatDefaultValue(parameter.defaultValue);

  return `${rest}${name}${optional}: ${type}${defaultValue ? ` = ${defaultValue}` : ""}`;
}

function getReflectionSignatures(
  reflection: JSONOutput.SomeReflection | undefined
): JSONOutput.SignatureReflection[] {
  if (!reflection || reflection.variant !== "declaration") {
    return [];
  }

  const signatures = [...(reflection.signatures ?? [])];

  for (const signature of [reflection.getSignature, reflection.setSignature]) {
    if (signature && !signatures.some((item) => item.id === signature.id)) {
      signatures.push(signature);
    }
  }

  return signatures;
}

function getParameterDescriptionMarkdown(parameter: JSONOutput.ParameterReflection): string {
  return displayPartsToMarkdown(parameter.comment?.summary);
}

function getReturnDescriptionMarkdown(
  reflection: JSONOutput.SomeReflection | undefined,
  signature: JSONOutput.SomeReflection | null | undefined
): string {
  return getBlockTagMarkdown(reflection, signature, ["@return", "@returns"]);
}

function getSourceOrder(reflection: JSONOutput.SomeReflection | undefined): number {
  const source = reflection?.sources?.[0];
  const line = source?.line ?? Number.MAX_SAFE_INTEGER;
  const character = source?.character ?? 0;
  return line * 1000000 + character;
}

function getVisibleReflectionChildren(
  reflection: JSONOutput.SomeReflection | undefined
): JSONOutput.DeclarationReflection[] {
  if (!reflection || !("children" in reflection)) {
    return [];
  }

  return [...(reflection.children ?? [])]
    .filter((child): child is JSONOutput.DeclarationReflection => child.variant === "declaration")
    .filter((child) => !child.flags?.isInherited)
    .sort((a, b) => getSourceOrder(a) - getSourceOrder(b) || a.name.localeCompare(b.name));
}

export {
  ReflectionKind,
  displayPartsToMarkdown,
  displayPartsToText,
  formatDefaultValue,
  formatParameter,
  formatType,
  getParameterDescriptionMarkdown,
  getReflectionComment,
  getReflectionCategory,
  getReflectionDescriptionMarkdown,
  getReflectionExamples,
  getReflectionMemberBadge,
  getReflectionMemberAnchor,
  getReflectionKindLabel,
  getReflectionKindName,
  getReflectionKindSlug,
  getReflectionSignatures,
  getReflectionTags,
  getReflectionThrowsMarkdown,
  getReturnDescriptionMarkdown,
  getSourceOrder,
  getTypeParameters,
  getVisibleReflectionChildren
};
