import sanitizeHtml from "sanitize-html";

const RICH_TEXT_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "a",
    "img",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        target: attribs.target === "_blank" ? "_blank" : undefined,
        rel: "noopener noreferrer nofollow",
      },
    }),
    img: (_tagName, attribs) => ({
      tagName: "img",
      attribs: { ...attribs, loading: "lazy" },
    }),
  },
};

export function sanitizeRichText(value) {
  return sanitizeHtml(String(value || ""), RICH_TEXT_OPTIONS).trim();
}

function decodeTextEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi, (match, code) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] || match;
    const isHex = code[1]?.toLowerCase() === "x";
    const point = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return match;
    return String.fromCodePoint(point);
  });
}

export function cleanText(value, maxLength) {
  const stripped = sanitizeHtml(String(value || ""), {
    allowedTags: [],
    allowedAttributes: {},
  });
  return decodeTextEntities(stripped).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function cleanTags(value, { maxTags = 10, maxLength = 30 } = {}) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => cleanText(tag, maxLength)).filter(Boolean))].slice(
    0,
    maxTags
  );
}

export function isHttpUrl(value) {
  try {
    return new URL(String(value)).protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafeLogoUrl(value) {
  if (!value) return true;
  if (isHttpUrl(value)) return true;
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

export function sanitizeArticle(article) {
  if (!article || typeof article !== "object") return article;
  return {
    ...article,
    title: cleanText(article.title, 120),
    summary: cleanText(article.summary, 500),
    content: sanitizeRichText(article.content),
    tags: cleanTags(article.tags),
  };
}

export function sanitizeDataset(dataset) {
  if (!dataset || typeof dataset !== "object") return dataset;
  return {
    ...dataset,
    name: cleanText(dataset.name, 120),
    description: cleanText(dataset.description, 1000),
    richContent: sanitizeRichText(dataset.richContent),
    tags: cleanTags(dataset.tags),
    baiduLink: isHttpUrl(dataset.baiduLink) ? dataset.baiduLink : null,
    downloadUrl: isHttpUrl(dataset.downloadUrl) ? dataset.downloadUrl : null,
  };
}
