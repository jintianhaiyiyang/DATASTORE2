import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "a",
  "img",
  "code",
  "pre"
];

const allowedAttributes = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title"]
};

export function sanitizeArticleContent(content = "") {
  return sanitizeHtml(content, {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true)
    }
  });
}
