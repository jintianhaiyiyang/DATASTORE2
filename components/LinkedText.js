import { Fragment } from "react";

// http(s) links and e-mail addresses inside plain text become links.
// Text is never rendered as HTML.
const TOKEN = /(https?:\/\/[^\s<>"'，。；、）】]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export default function LinkedText({ text, className }) {
  return String(text ?? "").split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
    const email = !/^https?:\/\//i.test(part);
    return email
      ? <a key={index} href={`mailto:${part}`} className={className}>{part}</a>
      : <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow" className={className}>{part}</a>;
  });
}
