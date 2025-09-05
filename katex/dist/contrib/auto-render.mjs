import katex from '../katex.mjs';

/* eslint no-constant-condition:0 */
var findEndOfMath = function findEndOfMath(delimiter, text, startIndex) {
  // Adapted from
  // https://github.com/Khan/perseus/blob/master/src/perseus-markdown.jsx
  var index = startIndex;
  var braceLevel = 0;
  var delimLength = delimiter.length;

  while (index < text.length) {
    var character = text[index];

    if (braceLevel <= 0 && text.slice(index, index + delimLength) === delimiter) {
      return index;
    } else if (character === "\\") {
      index++;
    } else if (character === "{") {
      braceLevel++;
    } else if (character === "}") {
      braceLevel--;
    }

    index++;
  }

  return -1;
};

var escapeRegex = function escapeRegex(string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
};

var amsRegex = /^\\begin{/;

var splitAtDelimiters = function splitAtDelimiters(text, delimiters) {
  var index;
  var data = [];
  var regexLeft = new RegExp("(" + delimiters.map(x => escapeRegex(x.left)).join("|") + ")");

  while (true) {
    index = text.search(regexLeft);

    if (index === -1) {
      break;
    }

    if (index > 0) {
      data.push({
        type: "text",
        data: text.slice(0, index)
      });
      text = text.slice(index); // now text starts with delimiter
    } // ... so this always succeeds:


    var i = delimiters.findIndex(delim => text.startsWith(delim.left));
    index = findEndOfMath(delimiters[i].right, text, delimiters[i].left.length);

    if (index === -1) {
      break;
    }

    var rawData = text.slice(0, index + delimiters[i].right.length);
    var math = amsRegex.test(rawData) ? rawData : text.slice(delimiters[i].left.length, index);
    data.push({
      type: "math",
      data: math,
      rawData,
      display: delimiters[i].display
    });
    text = text.slice(index + delimiters[i].right.length);
  }

  if (text !== "") {
    data.push({
      type: "text",
      data: text
    });
  }

  return data;
};

/* eslint no-console:0 */
/* Note: optionsCopy is mutated by this method. If it is ever exposed in the
 * API, we should copy it before mutating.
 */

var renderMathInText = function renderMathInText(text, optionsCopy) {
  var data = splitAtDelimiters(text, optionsCopy.delimiters);

  if (data.length === 1 && data[0].type === 'text') {
    // There is no formula in the text.
    // Let's return null which means there is no need to replace
    // the current text node with a new one.
    return null;
  }

  var fragment = document.createDocumentFragment();

  for (var i = 0; i < data.length; i++) {
    if (data[i].type === "text") {
      fragment.appendChild(document.createTextNode(data[i].data));
    } else {
      var span = document.createElement("span");
      var math = data[i].data; // Override any display mode defined in the settings with that
      // defined by the text itself

      optionsCopy.displayMode = data[i].display;

      try {
        if (optionsCopy.preProcess) {
          math = optionsCopy.preProcess(math);
        }

        katex.render(math, span, optionsCopy);
      } catch (e) {
        if (!(e instanceof katex.ParseError)) {
          throw e;
        }

        optionsCopy.errorCallback("KaTeX auto-render: Failed to parse `" + data[i].data + "` with ", e);
        fragment.appendChild(document.createTextNode(data[i].rawData));
        continue;
      }

      fragment.appendChild(span);
    }
  }

  return fragment;
};

var renderElem = function renderElem(elem, optionsCopy) {
  for (var i = 0; i < elem.childNodes.length; i++) {
    var childNode = elem.childNodes[i];

    if (childNode.nodeType === 3) {
      // Text node
      // Concatenate all sibling text nodes.
      // Webkit browsers split very large text nodes into smaller ones,
      // so the delimiters may be split across different nodes.
      var textContentConcat = childNode.textContent;
      var sibling = childNode.nextSibling;
      var nSiblings = 0;

      while (sibling && sibling.nodeType === Node.TEXT_NODE) {
        textContentConcat += sibling.textContent;
        sibling = sibling.nextSibling;
        nSiblings++;
      }

      var frag = renderMathInText(textContentConcat, optionsCopy);

      if (frag) {
        // Remove extra text nodes
        for (var j = 0; j < nSiblings; j++) {
          childNode.nextSibling.remove();
        }

        i += frag.childNodes.length - 1;
        elem.replaceChild(frag, childNode);
      } else {
        // If the concatenated text does not contain math
        // the siblings will not either
        i += nSiblings;
      }
    } else if (childNode.nodeType === 1) {
      (function () {
        // Element node
        var className = ' ' + childNode.className + ' ';
        var shouldRender = optionsCopy.ignoredTags.indexOf(childNode.nodeName.toLowerCase()) === -1 && optionsCopy.ignoredClasses.every(x => className.indexOf(' ' + x + ' ') === -1);

        if (shouldRender) {
          renderElem(childNode, optionsCopy);
        }
      })();
    } // Otherwise, it's something else, and ignore it.

  }
};

var renderMathInElement = function renderMathInElement(elem, options) {
  if (!elem) {
    throw new Error("No element provided to render");
  }

  var optionsCopy = {
    delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
    ],
    ignoredTags: [
        'script', 'noscript', 'style', 'textarea', 'pre', 'code', 'img', 'video', 'audio',
    ],
    errorCallback: (error, math, element) => {
        console.error(`KaTeX Math Error for "${math}":`, error);
        const errorSpan = document.createElement('span');
        errorSpan.className = 'katex-error-message';
        errorSpan.style.color = 'red';
        errorSpan.style.fontWeight = 'bold';
        errorSpan.textContent = `[Math Error: ${error.message || 'Unknown'}]`;
        element.parentNode.replaceChild(errorSpan, element);
    },
    throwOnError: false,
    errorColor: '#cc0000',
    macros: {
        "\\f": "#1f(#2)",
        "\\set": "\\mathbb{#1}",
        "\\vec": "\\mathbf{#1}",
        "\\bm": "\\boldsymbol{#1}",
        "\\abs": "|#1|", 
        "\\norm": "\\|#1\\|",
        "\\defby": "\\stackrel{\\text{def}}{=}", 
        "\\dint": "\\int\\!",
        "\\textadj": "\\quad\\text{#1}\\quad",
        "\\RR": "\\mathbb{R}", 
        "\\NN": "\\mathbb{N}",
        "\\QQ": "\\mathbb{Q}",
        "\\CC": "\\mathbb{C}",
        "\\epsilon": "\\varepsilon",
        "\\argmin": "\\mathop{\\mathrm{argmin}}", 
        "\\argmax": "\\mathop{\\mathrm{argmax}}",
        "\\implies": "\\Rightarrow",
        "\\iff": "\\iff",  
        "\\pder": "\\frac{\\partial #1}{\\partial #2}", 
        "\\iprod": "\\langle #1, #2 \\rangle"
    },
    minRuleThickness: 0.05,
    maxSize: 1000,
    maxExpand: 1000,
    strict: 'warn',
    leqno: false,
    output: 'htmlAndMathml',
    conversion: true,
    trust: (context) => {
        switch (context.command) {
            case '\\url':
            case '\\href':
                return true;
            case '\\htmlid':
            case '\\htmlClass':
            case '\\htmlStyle':
            case '\\htmlData':
                return true;
            case '\\htmlNode':
            case '\\phantom':
                return true;
            default:
                return false;
        }
    },
};
  for (var option in options) {
    if (options.hasOwnProperty(option)) {
      optionsCopy[option] = options[option];
    }
  }

  optionsCopy.ignoredTags = optionsCopy.ignoredTags || ["script", "noscript", "style", "textarea", "pre", "code", "option"];
  optionsCopy.ignoredClasses = optionsCopy.ignoredClasses || [];
  optionsCopy.errorCallback = optionsCopy.errorCallback || console.error;

  optionsCopy.macros = optionsCopy.macros || {};
  renderElem(elem, optionsCopy);
};

export { renderMathInElement as default };
