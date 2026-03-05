/*
 * Copyright (c) 2026 Fiserv, Inc. or its affiliates. Fiserv is a trademark of Fiserv,
 * Inc., registered or used in the United States and foreign countries, and
 * may or may not be registered in your country. All trademarks, service
 * marks, and trade names referenced in this material are the property
 * of their respective owners. This work, including its contents and
 * programming, is confidential and its use is strictly limited. This work
 * is furnished only for use by duly authorized licensees of Fiserv, Inc. or
 * its affiliates, and their designated agents or employees responsible for
 * installation or operation of the products. Any other use, duplication, or
 * dissemination without the prior written consent of Fiserv, Inc. or its
 * affiliates is strictly prohibited. Except as specified by the agreement
 * under which the materials are furnished, Fiserv, Inc. and its affiliates do
 * not accept any liabilities with respect to the information contained herein
 * and are not responsible for any direct, indirect, special, consequential
 * or exemplary damages resulting from the use of this information. No
 * warranties, either express or implied, are granted or extended by this
 * work or the delivery of this work.
 */

/**
 * Minimal HTML entity decoder — replacement strings MUST be quoted.
 * Example: "Hello &amp;lt;strong&amp;gt;World&amp;lt;/strong&amp;gt; &amp;amp; enjoy &amp;quot;coding&amp;quot; &amp;#39;everyday&amp;#39;!"
 */
function decodeEntitiesFast(s) {
  return s
    .replace(/&lt;/g, '<') // ✅ quoted
    .replace(/&gt;/g, '>') // ✅ quoted
    .replace(/&amp;/g, '&') // ✅ quoted
    .replace(/&quot;/g, '"') // ✅ quoted
    .replace(/&#39;|&apos;/g, "'"); // ✅ quoted
}

/**
 * Normalize common problematic constructs.
 * Examples: "Some text <!-- This is a hidden note --> more text", "Here is a </br> line break", 'He said “Hello”', etc.
 */
function normalizeBasics(s){
  return (
    s
      // Replace all comments to avoid issues during compilation
      .replace(/<!--.*?-->/gs, '')
      // Remove raw and escaped HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/&lt;!--[\s\S]*?--&gt;/g, '')
      // Fix invalid </br>
      .replace(/<\/br>/gi, '<br />')
      // Normalize smart quotes
      .replace(/[“”]/g, '"')
      // Normalize smart single quotes/apostrophes
      .replace(/<\s*Insert\s+Email\s+address\s+here\s*>/i, '[ Email address here ]')
      .replace(/<p>/gi, '\n\n')
      .replace(/<\/p>/gi, '\n\n')
  );
}

// 3) Convert angle-bracketed bare domains: <www.opensource.org> -> www.opensource.org
//    - Matches domains like www.example.com, example.org, sub.example.co.uk
//    - Avoids matching real tags by requiring a dot and forbidding spaces/angle brackets inside.
function convertAngleBracketBareDomainsToLinks(s) {
  return s.replace(/<((?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s>]*)?)>/g, (_m, domain) => {
    // If it already looks like a path-only "/something", skip (that’s not a domain)
    if (domain.startsWith('/')) {
      return `<${domain}>`;
    }
    return `${domain}`;
  });
}

/**
 * Preprocess MDX to be CommonMark/remark-friendly.
 */
export function preprocessMdxToMarkdown(raw) {
  let s = normalizeBasics(raw);

  // Now decode entities and perform other fixes
  s = decodeEntitiesFast(s);

  // 🌐 Bare domains: <www.opensource.org>, <example.org/docs>
  // s = convertAngleBracketBareDomainsToLinks(s);

  return s;
}
