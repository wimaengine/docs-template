import { ReflectionKind } from "typedoc";

const structuredTagNames = new Set([
  "@callback",
  "@class",
  "@constructor",
  "@enum",
  "@function",
  "@interface",
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
  "@override"
]);

const kindLabels = new Map([
  [ReflectionKind.Class, ["Class", "Classes"]],
  [ReflectionKind.Enum, ["Enum", "Enums"]],
  [ReflectionKind.Function, ["Function", "Functions"]],
  [ReflectionKind.Variable, ["Variable", "Variables"]],
  [ReflectionKind.Interface, ["Interface", "Interfaces"]],
  [ReflectionKind.TypeAlias, ["Type alias", "Type aliases"]]
]);

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function getReflectionKindName(kind) {
  const name = ReflectionKind[kind];
  return typeof name === "string" ? name : `Kind ${kind}`;
}

function getReflectionKindSlug(kind) {
  return getReflectionKindName(kind).replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function getReflectionKindLabel(kind, plural = false) {
  const labels = kindLabels.get(kind);
  if (labels) {
    return labels[plural ? 1 : 0];
  }

  return getReflectionKindName(kind);
}

function displayPartsToText(parts) {
  if (typeof parts === "string") {
    return normalizeText(parts);
  }

  return normalizeText((parts ?? [])
    .map((part) => typeof part === "string" ? part : String(part?.text ?? ""))
    .join(""));
}

function getReflectionComment(reflection, signature) {
  return signature?.comment ?? reflection?.comment ?? null;
}

function getReflectionDescription(reflection, signature) {
  return displayPartsToText(getReflectionComment(reflection, signature)?.summary);
}

function getReflectionTags(reflection, signature) {
  return (getReflectionComment(reflection, signature)?.blockTags ?? [])
    .filter((tag) => !structuredTagNames.has(tag.tag))
    .map((tag) => {
      const content = displayPartsToText(tag.content);
      return normalizeInlineText([tag.tag, tag.name, content].filter(Boolean).join(" "));
    })
    .filter(Boolean);
}

function getBlockTag(reflection, signature, names) {
  return (getReflectionComment(reflection, signature)?.blockTags ?? [])
    .find((tag) => names.includes(tag.tag));
}

function getBlockTagDescription(reflection, signature, names) {
  return displayPartsToText(getBlockTag(reflection, signature, names)?.content);
}

function formatLiteralValue(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatType(type) {
  if (!type) {
    return "";
  }

  if (typeof type === "string") {
    return type;
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
      const name = type.name ?? type.qualifiedName;
      if (name) {
        return name;
      }

      return type.type ? String(type.type) : "unknown";
    }
  }
}

function formatDefaultValue(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return typeof value === "string" ? value : formatType(value);
}

function getTypeParameters(reflection) {
  return (reflection?.typeParameters ?? []).map((typeParameter) => ({
    name: typeParameter.name,
    type: typeParameter.type,
    constraint: formatType(typeParameter.type),
    default: typeParameter.default,
    defaultValue: formatDefaultValue(typeParameter.default),
    description: displayPartsToText(typeParameter.comment?.summary)
  }));
}

function formatParameter(parameter) {
  const flags = parameter.flags ?? {};
  const name = normalizeInlineText(parameter.name || "parameter");
  const rest = flags.isRest ? "..." : "";
  const optional = flags.isOptional && !flags.isRest ? "?" : "";
  const type = formatType(parameter.type) || "unknown";
  const defaultValue = formatDefaultValue(parameter.defaultValue);

  return `${rest}${name}${optional}: ${type}${defaultValue ? ` = ${defaultValue}` : ""}`;
}

function getReflectionSignatures(reflection) {
  const signatures = [...(reflection?.signatures ?? [])];

  for (const signature of [reflection?.getSignature, reflection?.setSignature]) {
    if (signature && !signatures.some((item) => item.id === signature.id)) {
      signatures.push(signature);
    }
  }

  return signatures;
}

function getReflectionDescriptionForDisplay(reflection) {
  const signatures = getReflectionSignatures(reflection);
  return getReflectionDescription(reflection, signatures[0]);
}

function getReflectionTagsForDisplay(reflection) {
  const signatures = getReflectionSignatures(reflection);
  return getReflectionTags(reflection, signatures[0]);
}

function getParameterDescription(parameter) {
  return displayPartsToText(parameter.comment?.summary);
}

function getReturnDescription(reflection, signature) {
  return getBlockTagDescription(reflection, signature, ["@return", "@returns"]);
}

function getSourceOrder(reflection) {
  const source = reflection?.sources?.[0];
  const line = Number.isFinite(source?.line) ? source.line : Number.MAX_SAFE_INTEGER;
  const character = Number.isFinite(source?.character) ? source.character : 0;
  return line * 1000000 + character;
}

function getVisibleReflectionChildren(reflection) {
  return [...(reflection?.children ?? [])]
    .filter((child) => !child.flags?.isInherited)
    .sort((a, b) => getSourceOrder(a) - getSourceOrder(b) || a.name.localeCompare(b.name));
}

function splitParagraphs(value) {
  return normalizeText(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export {
  ReflectionKind,
  displayPartsToText,
  formatDefaultValue,
  formatParameter,
  formatType,
  getBlockTagDescription,
  getParameterDescription,
  getReflectionComment,
  getReflectionDescription,
  getReflectionDescriptionForDisplay,
  getReflectionKindLabel,
  getReflectionKindName,
  getReflectionKindSlug,
  getReflectionSignatures,
  getReflectionTags,
  getReflectionTagsForDisplay,
  getReturnDescription,
  getSourceOrder,
  getTypeParameters,
  getVisibleReflectionChildren,
  splitParagraphs
};
