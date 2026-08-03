// Renders the announcement markdown subset as React elements.
//
// The parser (shared/markdown.ts) hands back tokens, and this builds nodes from
// them — no dangerouslySetInnerHTML anywhere in the path, so an announcement
// body can't inject markup no matter what an admin (or anyone who got hold of
// the admin password) types into the form.

import { Fragment } from "react";
import { parseMarkdown, type Span } from "../../shared/markdown";

function renderSpan(span: Span, key: number) {
  switch (span.type) {
    case "strong":
      return <strong key={key}>{span.text}</strong>;
    case "em":
      return <em key={key}>{span.text}</em>;
    case "link": {
      // Same-site paths (/privacy, /?date=…) navigate in place; anything
      // off-site opens in a new tab so a player mid-round doesn't lose the
      // board — and never with a window.opener handle back to us.
      const external = /^https?:/i.test(span.href);
      return (
        <a
          key={key}
          href={span.href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {span.text}
        </a>
      );
    }
    default:
      return <Fragment key={key}>{span.text}</Fragment>;
  }
}

export default function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((paragraph, pi) => (
        <p key={pi}>
          {paragraph.lines.map((spans, li) => (
            <Fragment key={li}>
              {li > 0 && <br />}
              {spans.map(renderSpan)}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}
