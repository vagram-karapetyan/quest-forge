export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function sanitizeUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  // Strip control characters and ASCII whitespace used in obfuscated schemes like "java\tscript:"
  // eslint-disable-next-line no-control-regex
  const normalized = trimmed.replace(/[\u0000-\u0020]+/g, '');
  const lower = normalized.toLowerCase();

  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('/') ||
    lower.startsWith('./') ||
    lower.startsWith('../') ||
    lower.startsWith('#')
  ) {
    // Reject protocol-relative "//evil.example" if unintended? Allow only safe single "/" paths or http/https.
    if (lower.startsWith('//')) {
      return null;
    }
    return trimmed;
  }

  return null;
}

function renderInlineMarkdown(escapedLine: string): string {
  const codeTokens: string[] = [];
  let text = escapedLine.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${code}</code>`);
    return `\uE000CODE${idx}\uE001`;
  });

  // Images: ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, rawUrl: string) => {
    const safe = sanitizeUrl(unescapeBasicHtmlEntities(rawUrl));
    if (!safe) {
      return alt ? `[${alt}]` : '';
    }
    return `<img src="${escapeHtml(safe)}" alt="${alt}" loading="lazy" />`;
  });

  // Links: [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, rawUrl: string) => {
    const safe = sanitizeUrl(unescapeBasicHtmlEntities(rawUrl));
    if (!safe) {
      return label;
    }
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Bold **text** or __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic *text* or _text_
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_a-zA-Z0-9])_([^_\n]+)_(?![_a-zA-Z0-9])/g, '$1<em>$2</em>');

  // Restore inline code tokens
  text = text.replace(/\uE000CODE(\d+)\uE001/g, (_m, idxStr: string) => {
    const token = codeTokens[Number(idxStr)];
    return token ?? '';
  });

  return text;
}

function unescapeBasicHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export function renderMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push('<hr />');
      i += 1;
      continue;
    }

    // Headings H1-H3
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const content = renderInlineMarkdown(escapeHtml(headingMatch[2] ?? ''));
      blocks.push(`<h${level}>${content}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const line = (lines[i] ?? '').trim();
        if (!line.startsWith('>')) {
          break;
        }
        quoteLines.push(renderInlineMarkdown(escapeHtml(line.replace(/^>\s?/, ''))));
        i += 1;
      }
      blocks.push(`<blockquote><p>${quoteLines.join('<br />')}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const line = (lines[i] ?? '').trim();
        const itemMatch = /^[-*+]\s+(.+)$/.exec(line);
        if (!itemMatch) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(escapeHtml(itemMatch[1] ?? ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const line = (lines[i] ?? '').trim();
        const itemMatch = /^\d+\.\s+(.+)$/.exec(line);
        if (!itemMatch) {
          break;
        }
        items.push(`<li>${renderInlineMarkdown(escapeHtml(itemMatch[1] ?? ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph (until blank line or block starter)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i] ?? '';
      const lineTrimmed = line.trim();
      if (
        !lineTrimmed ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(lineTrimmed) ||
        /^(#{1,3})\s+/.test(lineTrimmed) ||
        lineTrimmed.startsWith('>') ||
        /^[-*+]\s+/.test(lineTrimmed) ||
        /^\d+\.\s+/.test(lineTrimmed)
      ) {
        break;
      }
      paraLines.push(renderInlineMarkdown(escapeHtml(line)));
      i += 1;
    }
    blocks.push(`<p>${paraLines.join('<br />')}</p>`);
  }

  return blocks.join('\n');
}
