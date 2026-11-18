/**
 * Small, dependency-free syntax highlighter for chat code blocks.
 *
 * Web renders every code block on a fixed GitHub-dark panel (CodeBlock.tsx,
 * `bg-[#0d1117]`), so the token colors here are GitHub Dark's and stay the
 * same in light and dark app themes, exactly like the web panel. A full
 * grammar library would add a heavy dependency for little gain in a chat
 * bubble; this covers comments, strings, numbers, keywords, types, function
 * calls and markup tags for the languages models write most.
 */

export type TokenType =
  | "plain"
  | "comment"
  | "keyword"
  | "string"
  | "number"
  | "function"
  | "type"
  | "tag"
  | "attr";

export type CodeToken = { text: string; type: TokenType };

/** GitHub Dark, matching web's `#0d1117` code panel. */
export const CODE_THEME = {
  background: "#0d1117",
  header: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.10)",
  label: "rgba(255,255,255,0.45)",
  dots: ["#ff5f57", "#febc2e", "#28c840"] as const,
  tokens: {
    plain: "#e6edf3",
    comment: "#8b949e",
    keyword: "#ff7b72",
    string: "#a5d6ff",
    number: "#79c0ff",
    function: "#d2a8ff",
    type: "#ffa657",
    tag: "#7ee787",
    attr: "#79c0ff",
  } satisfies Record<TokenType, string>,
};

// Beyond this a block renders plain: highlighting huge pastes isn't worth the
// layout cost on a phone.
const MAX_HIGHLIGHT_CHARS = 20_000;

type Family = "c" | "python" | "shell" | "sql" | "json" | "markup" | "css" | "yaml" | "plain";

const FAMILY_BY_LANGUAGE: Record<string, Family> = {
  js: "c", javascript: "c", jsx: "c", mjs: "c", cjs: "c",
  ts: "c", typescript: "c", tsx: "c",
  java: "c", kotlin: "c", kt: "c", swift: "c", dart: "c", scala: "c",
  c: "c", h: "c", cpp: "c", "c++": "c", cc: "c", hpp: "c", cs: "c", csharp: "c",
  go: "c", golang: "c", rust: "c", rs: "c", php: "c", groovy: "c",
  python: "python", py: "python", ruby: "python", rb: "python", r: "python",
  bash: "shell", sh: "shell", shell: "shell", zsh: "shell", fish: "shell",
  console: "shell", powershell: "shell", ps1: "shell", dockerfile: "shell",
  makefile: "shell",
  sql: "sql", postgres: "sql", postgresql: "sql", mysql: "sql", sqlite: "sql",
  json: "json", jsonc: "json", json5: "json",
  html: "markup", xml: "markup", svg: "markup", vue: "markup", svelte: "markup",
  css: "css", scss: "css", sass: "css", less: "css",
  yaml: "yaml", yml: "yaml", toml: "yaml", ini: "yaml", env: "yaml",
};

const C_KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue debugger default " +
    "delete do else enum export extends false finally for from function get if " +
    "implements import in instanceof interface is keyof let new null of package " +
    "private protected public readonly return satisfies set static super switch " +
    "this throw true try type typeof undefined var void while with yield " +
    // Go / Rust / Swift / Kotlin / C-family extras
    "chan defer fallthrough func go map range select struct crate dyn fn impl " +
    "loop match mod move mut pub ref self Self trait unsafe use where " +
    "guard init let override protocol extension internal fileprivate " +
    "fun val when object companion lateinit data sealed open " +
    "int float double char long short unsigned signed bool boolean byte string " +
    "auto sizeof typedef union extern register volatile inline nil final"
  ).split(" "),
);

const PYTHON_KEYWORDS = new Set(
  (
    "and as assert async await break class continue def del elif else except " +
    "False finally for from global if import in is lambda None nonlocal not or " +
    "pass raise return True try while with yield self " +
    // Ruby / R
    "begin end module unless until then do puts require attr_accessor nil TRUE FALSE NULL function"
  ).split(" "),
);

const SHELL_KEYWORDS = new Set(
  (
    "if then else elif fi for while until do done case esac in function return " +
    "export local readonly unset echo cd sudo source alias set exit " +
    "FROM RUN CMD COPY ADD ENV ARG WORKDIR EXPOSE ENTRYPOINT USER VOLUME"
  ).split(" "),
);

const SQL_KEYWORDS = new Set(
  (
    "select from where and or not insert into values update set delete create table " +
    "drop alter add primary key foreign references join left right inner outer full " +
    "on as group by order having limit offset distinct union all case when then " +
    "else end null is in like between exists index view returning with default " +
    "constraint unique check cascade begin commit rollback transaction asc desc"
  ).split(" "),
);

const LITERALS = new Set(["true", "false", "null", "undefined", "None", "True", "False", "nil"]);

function familyFor(language: string): Family {
  return FAMILY_BY_LANGUAGE[language.trim().toLowerCase()] ?? "plain";
}

type Rule = { re: RegExp; type: TokenType | ((match: string, rest: string) => TokenType) };

const NUMBER = /\b(?:0x[\da-fA-F_]+|0b[01_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b/y;
const IDENT = /[A-Za-z_$][\w$]*/y;

function identifierType(keywords: Set<string>, caseInsensitive = false) {
  return (word: string, rest: string): TokenType => {
    const key = caseInsensitive ? word.toLowerCase() : word;
    if (LITERALS.has(word)) return "number";
    if (keywords.has(key)) return "keyword";
    if (/^\s*\(/.test(rest)) return "function";
    if (/^[A-Z][a-z]/.test(word)) return "type";
    return "plain";
  };
}

function rulesFor(family: Family): Rule[] {
  switch (family) {
    case "c":
      return [
        { re: /\/\/[^\n]*/y, type: "comment" },
        { re: /\/\*[\s\S]*?(?:\*\/|$)/y, type: "comment" },
        { re: /`(?:\\[\s\S]|[^`\\])*`?/y, type: "string" },
        { re: /"(?:\\.|[^"\\\n])*"?/y, type: "string" },
        { re: /'(?:\\.|[^'\\\n])*'?/y, type: "string" },
        { re: /@[A-Za-z_]\w*/y, type: "type" },
        { re: NUMBER, type: "number" },
        { re: IDENT, type: identifierType(C_KEYWORDS) },
      ];
    case "python":
      return [
        { re: /#[^\n]*/y, type: "comment" },
        { re: /("""|''')[\s\S]*?(?:\1|$)/y, type: "string" },
        { re: /[fbru]{0,2}"(?:\\.|[^"\\\n])*"?/y, type: "string" },
        { re: /[fbru]{0,2}'(?:\\.|[^'\\\n])*'?/y, type: "string" },
        { re: /@[A-Za-z_][\w.]*/y, type: "function" },
        { re: NUMBER, type: "number" },
        { re: IDENT, type: identifierType(PYTHON_KEYWORDS) },
      ];
    case "shell":
      return [
        { re: /#[^\n]*/y, type: "comment" },
        { re: /"(?:\\.|[^"\\])*"?/y, type: "string" },
        { re: /'[^']*'?/y, type: "string" },
        { re: /\$\{?[A-Za-z_][\w]*\}?|\$[0-9@#?*!$-]/y, type: "attr" },
        { re: /--?[A-Za-z][\w-]*/y, type: "attr" },
        { re: NUMBER, type: "number" },
        { re: /[A-Za-z_][\w.-]*/y, type: (word) => (SHELL_KEYWORDS.has(word) ? "keyword" : "plain") },
      ];
    case "sql":
      return [
        { re: /--[^\n]*/y, type: "comment" },
        { re: /\/\*[\s\S]*?(?:\*\/|$)/y, type: "comment" },
        { re: /'(?:''|[^'])*'?/y, type: "string" },
        { re: /"(?:[^"])*"?/y, type: "attr" },
        { re: NUMBER, type: "number" },
        { re: IDENT, type: identifierType(SQL_KEYWORDS, true) },
      ];
    case "json":
      return [
        { re: /\/\/[^\n]*/y, type: "comment" },
        {
          re: /"(?:\\.|[^"\\\n])*"?/y,
          type: (_match, rest) => (/^\s*:/.test(rest) ? "attr" : "string"),
        },
        { re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, type: "number" },
        { re: /\b(?:true|false|null)\b/y, type: "keyword" },
      ];
    case "markup":
      return [
        { re: /<!--[\s\S]*?(?:-->|$)/y, type: "comment" },
        { re: /<\/?[A-Za-z][\w:.-]*/y, type: "tag" },
        { re: /\/?>/y, type: "tag" },
        { re: /"[^"]*"?|'[^']*'?/y, type: "string" },
        { re: /[A-Za-z_:][\w:.-]*(?=\s*=)/y, type: "attr" },
      ];
    case "css":
      return [
        { re: /\/\*[\s\S]*?(?:\*\/|$)/y, type: "comment" },
        { re: /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y, type: "string" },
        { re: /@[\w-]+/y, type: "keyword" },
        { re: /#[\da-fA-F]{3,8}\b/y, type: "number" },
        { re: /-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?/y, type: "number" },
        { re: /[\w-]+(?=\s*:)/y, type: "attr" },
        { re: /[.#][\w-]+/y, type: "tag" },
      ];
    case "yaml":
      return [
        { re: /#[^\n]*/y, type: "comment" },
        { re: /"(?:\\.|[^"\\\n])*"?|'[^'\n]*'?/y, type: "string" },
        { re: /^[ \t-]*[\w.-]+(?=\s*[:=])/my, type: "attr" },
        { re: /\[[\w.-]+\]/y, type: "tag" },
        { re: /\b(?:true|false|null|yes|no|on|off)\b/y, type: "keyword" },
        { re: NUMBER, type: "number" },
      ];
    default:
      return [
        { re: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y, type: "string" },
        { re: NUMBER, type: "number" },
      ];
  }
}

/** Splits code into colored tokens; adjacent same-type text is merged. */
export function highlightCode(code: string, language: string): CodeToken[] {
  if (!code || code.length > MAX_HIGHLIGHT_CHARS) return [{ text: code, type: "plain" }];
  const rules = rulesFor(familyFor(language));
  const tokens: CodeToken[] = [];
  const push = (text: string, type: TokenType) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else tokens.push({ text, type });
  };

  let index = 0;
  while (index < code.length) {
    let matched = false;
    for (const rule of rules) {
      rule.re.lastIndex = index;
      const match = rule.re.exec(code);
      if (match && match[0].length > 0) {
        const text = match[0];
        const type =
          typeof rule.type === "function"
            ? rule.type(text, code.slice(index + text.length, index + text.length + 4))
            : rule.type;
        push(text, type);
        index += text.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      push(code[index]!, "plain");
      index += 1;
    }
  }
  return tokens;
}
