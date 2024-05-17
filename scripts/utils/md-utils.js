/*
 * Copyright (c) 2021 Fiserv, Inc. or its affiliates. Fiserv is a trademark of Fiserv,
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

const showdown = require('showdown');
const hljs = require('highlight.js'); 
const classAttr = 'class="';
  

const mdExtension = () => {
  let tabIndex = 0;

  const replaceComments = (out, obj) => {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return;
    }
    const type = 'type',
      titles = 'titles';
    if (type in obj) {
      switch (obj[type].toLowerCase()) {
        case 'row':
          out.push('<div class="row">');
          break;
        case 'row-end':
          out.push('</div>');
          break;
        case 'card':
          out.push('<div class="col m-3 p-0"><div class="card h-100"><div class="card-body m-0 p-4">');
          obj.title && out.push(`<div class="font-size-18 black font-bold m-0 pb-4">${obj.title}</div>`);
          obj.description && out.push(`<div class="font-size-16 black m-0 pt-2 pb-4">${obj.description}</div>`);
          obj.link && out.push(`<a class="font-size-14" href="${obj.link}">Learn More</a>`);
          out.push('</div></div></div>');
          break;
        case 'tab-end':
          out.push('</div></div>');
          break;
        case 'tab':
          if (titles in obj) {
            tabIndex = 0;
            out.push('<div><div class="border-gray-bottom mb-4 products-type d-flex">');
            obj[titles].split(',').map((t, tInx) => {
              out.push(
                `<span data-tab-index=${tInx} class="pb-2 me-4 ms-1 font-size-20 font-bold cursor-pointer ${
                  tInx === 0 ? 'orange products-type-border' : 'grey-disable'
                }">${t.trim()}</span>`
              );
            });
            out.push(`</div><div data-tab-index=${tabIndex++}>`);
          } else {
            out.push(`</div><div data-tab-index=${tabIndex++} class="d-none">`);
          }
          break;
      }
    }
  };

  const parseComment = (c) => {
    const o = {};
    if (c.match(/\s*\w+\s*:\s*\S+/)) {
      const [k, v] = c.match(/\s*(\w+)\s*:(.+)/).slice(1);
      o[k.toLowerCase()] = v.trim();
    }
    return o;
  };

  const filter = function (text) {
    let line,
      comments = {},
      commenting = false;
    const out = [],
      lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      line = lines[i];
      if (line.trim().match(/<!--\s*\w+\s*:\s*\S+\s*-->/)) {
        comments = parseComment(line.trim().match(/<!--\s*(.+)-->/)[1]);
        replaceComments(out, comments);
        continue;
      } else if (line.trim().match(/<!--.*?-->/)) {
        line = line.replace(/<!--.*?-->/g, '');
      } else if (line.trim().match(/<!--/)) {
        comments = {};
        if (line.trim().match(/<!--\s*\w+\s*:\s*\S+/)) {
          comments = parseComment(line.trim().match(/<!--\s*(.+)/)[1]);
        }
        commenting = true;
        continue;
      } else if (line.trim().match(/-->/)) {
        if (line.trim().match(/\s*\w+\s*:\s*\S+\s*-->/)) {
          Object.assign(comments, parseComment(line.trim().match(/\s*(.*)-->/)[1]));
        }
        commenting = false;
        replaceComments(out, comments);
        continue;
      } else if (commenting) {
        if (line.trim().match(/\s*\w+\s*:\s*\S+\s*/)) {
          Object.assign(comments, parseComment(line.trim().match(/\s*(.+)/)[1]));
        }
        continue;
      }
      if (comments.align === 'center' && line.trim().match(/<img\s[^>]+>/)) {
        line = line.replace('<img ', '<img class="mx-auto d-block" ');
        comments = {};
      } else if (comments.theme && line.trim().match(/<blockquote[^>]*>/)) {
        line = line.replace('<blockquote', `<blockquote class="ds-bq-${comments.theme.toLowerCase()}"`);
        comments = {};
      }
      out.push(line);
    }
    return out.join('\n');
  };

  return [{ type: 'output', filter }];
};

const tagsExtension = () => {
  const filter = function (text) {
    let line;
    const lines = text.split('\n'),
      out = [];
    for (let i = 0; i < lines.length; i += 1) {
      line = lines[i];
      if (line.trim().match(/^tags: \[(.+?)\]/)) {
        line = line.trim();
        const arrTags = line.trim().match(/^tags: \[(.+?)\]/) || [];
        if (arrTags.length > 1) {
          const tagsList = arrTags[1].split(',');
          const tagHtml = [];
          for (let t = 0; t < tagsList.length; t++) {
            const tag = tagsList[t];
            tagHtml.push(' <span class="badge badge-primary">' + tag + '</span>');
          }
          out.push(tagHtml.join(''));
          out[i - 1] = '\n';
          out[i + 1] = '\n';
          i++;
        }
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  };
  return [
    {
      type: 'lang',
      filter: filter,
    },
  ];
};

const isAbsoluteURL = (url = '') => {
  return url.startsWith('http:') || url.startsWith('https:');
};

const parseURL = (baseURL = '', path = '') => {
  path = path.replace(/(\.\.\/|\.\/|^\/)/g, '');
  baseURL = baseURL.replace(/(\/$)/g, '');
  return `${baseURL}/${path}`;
};

const imgPathParser = () => {
  return [
    {
      type: 'output',
      regex: '<img src="(.+?)" (.*)/>',
      replace: function (strChunk, match1, match2) {
        
        const url = isAbsoluteURL(match1) ? match1 : parseURL('https://localhost:8080', match1);
        return `<img src="${url}" ${match2}/>`;
      },
    },
  ];
};

const tocId = (id) => id.replace(/[^\w-]/g, '');

const enrichHTMLFromMarkup = () => {
  const tagsMap = {
    h1: (id) => `<a class="anchor" href="#${id}" aria-hidden="true"><span class="octicon octicon-link"></span></a>`,
    h2: (id) => `<a class="anchor" href="#${id}" aria-hidden="true"><span class="octicon octicon-link"></span></a>`,
    h3: (id) => `<a class="anchor" href="#${id}" aria-hidden="true"><span class="octicon octicon-link"></span></a>`,
    h4: (id) => `<a class="anchor" href="#${id}" aria-hidden="true"><span class="octicon octicon-link"></span></a>`,
  };

  const bindings = Object.keys(tagsMap).map((tag) => ({
    type: 'output',
    regex: new RegExp(`<${tag} id="(.*)">(.*)</${tag}>`, 'g'),
    replace: function (strChunk, match1, match2) {
      const strFn = tagsMap[tag];
      const id = tocId(match1);
      const innerTag = strFn ? strFn(id) : '';
      return `<${tag} class="jump-link" id="${id}">${innerTag}${match2}</${tag}>`;
    },
  }));
  const tagsExt = tagsExtension();
  const imgParser = imgPathParser( );
  return [...bindings, ...tagsExt, ...imgParser];
};

const showdownHighlight = () => {
  const htmlunencode = (text) => {
    return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  };
  return [
    {
      type: 'output',
      filter (text) {
        const left = '<pre><code\\b[^>]*>',
          right = '</code></pre>',
          flags = 'g',
          replacement = (wholeMatch, match, left, right) => {
            match = htmlunencode(match);
            const lang = (left.match(/class=([^]+)/) || [])[1];

            if (left.includes(classAttr)) {
              const attrIndex = left.indexOf(classAttr) + classAttr.length;
              left = left.slice(0, attrIndex) + 'hljs ' + left.slice(attrIndex);
            } else {
              left = left.slice(0, -1) + ' class="hljs">';
            }

            if (lang && hljs.getLanguage(lang)) {
              return left + hljs.highlight(lang, match).value + right;
            } else {
              return left + hljs.highlightAuto(match).value + right;
            }
          };

        return showdown.helper.replaceRecursiveRegExp(text, replacement, left, right, flags);
      },
    },
  ];
};
 
module.exports = {
  enrichHTMLFromMarkup,
  showdownHighlight: showdownHighlight(), 
  mdExtension,
};
