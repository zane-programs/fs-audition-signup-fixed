import { Fragment, useMemo } from "react";
import {
  Link,
  ListItem,
  OrderedList,
  Text,
  UnorderedList,
} from "@chakra-ui/react";

/**
 * Renders a small, allow-listed subset of HTML that came from SignUpGenius.
 *
 * The sign-up blurb is written in SignUpGenius' rich-text editor, so it
 * arrives as HTML. Rather than trusting it with `dangerouslySetInnerHTML`,
 * this parses it and rebuilds it out of React elements: anything not on the
 * list below is dropped, and no attribute other than a vetted `href` is ever
 * read. Styling comes from the theme, not from the scraped markup.
 */

// Inline tags we keep, and the styling each one earns.
const INLINE_STYLES: { [tagName: string]: object } = {
  STRONG: { fontWeight: "700" },
  B: { fontWeight: "700" },
  EM: { fontStyle: "italic" },
  I: { fontStyle: "italic" },
  U: { textDecoration: "underline" },
  SPAN: {},
  FONT: {},
};

// Tags whose *contents* must be thrown away too, not just unwrapped —
// otherwise e.g. a <script> body would be rendered as visible text.
const DROPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "MATH",
  "FORM",
  "INPUT",
  "BUTTON",
]);

const SAFE_LINK = /^(https?:|mailto:)/i;

export default function RichText({ html }: { html: string }) {
  const nodes = useMemo(() => {
    if (!html?.trim()) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    return renderChildren(doc.body);
  }, [html]);

  return <>{nodes}</>;
}

function renderChildren(parent: Node): React.ReactNode[] {
  return Array.from(parent.childNodes).map(renderNode);
}

function renderNode(node: Node, index: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  const tagName = element.tagName.toUpperCase();

  if (DROPPED_TAGS.has(tagName)) return null;
  if (tagName === "BR") return <br key={index} />;

  const children = renderChildren(element);

  switch (tagName) {
    case "P":
    case "DIV":
      return (
        <Text key={index} fontSize="sm" color="#fffd">
          {children}
        </Text>
      );
    case "UL":
      return (
        <UnorderedList key={index} fontSize="sm" color="#fffd" pl="2">
          {children}
        </UnorderedList>
      );
    case "OL":
      return (
        <OrderedList key={index} fontSize="sm" color="#fffd" pl="2">
          {children}
        </OrderedList>
      );
    case "LI":
      return <ListItem key={index}>{children}</ListItem>;
    case "A": {
      const href = element.getAttribute("href") ?? "";
      // Anything that isn't plainly a web or mail link loses its href — that
      // rules out javascript: and data: URLs.
      if (!SAFE_LINK.test(href)) return <Fragment key={index}>{children}</Fragment>;
      return (
        <Link key={index} href={href} isExternal textDecoration="underline">
          {children}
        </Link>
      );
    }
    default:
      if (tagName in INLINE_STYLES) {
        return (
          <Text key={index} as="span" {...INLINE_STYLES[tagName]}>
            {children}
          </Text>
        );
      }
      // Unrecognized tag: keep what it said, drop the tag itself.
      return <Fragment key={index}>{children}</Fragment>;
  }
}
