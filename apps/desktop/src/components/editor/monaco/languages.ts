// Languages the editor knows: how a file is matched, which TextMate grammar
// highlights it (VS Code's grammars, shipped with Shiki) and which language
// configuration drives comments, brackets, auto-closing and indentation.
//
// Language configurations come from Monaco's own definitions where they exist
// (the same ones VS Code uses), so Cmd+/ inserts the right comment for each
// language, including code embedded in HTML, Vue, Svelte and Astro.

import type { languages } from "monaco-editor/editor";
import type { LanguageRegistration } from "shiki/types";

type Conf = languages.LanguageConfiguration;
type GrammarModule = { default: LanguageRegistration[] };

export type LanguageDef = {
  id: string;
  label: string;
  extensions?: string[];
  /** Exact file names (case-insensitive). */
  filenames?: string[];
  /** Grammar to load (a Shiki language module). */
  grammar?: () => Promise<GrammarModule>;
  /** Extra grammars that this one embeds (e.g. fenced code in Markdown). */
  embeds?: Array<() => Promise<GrammarModule>>;
  conf: () => Promise<Conf | undefined>;
  /** TextMate selectors whose brackets are not real brackets (arrows, generics). */
  unbalancedBrackets?: string[];
  /** Scopes inside this language that use another language's settings. */
  embeddedScopes?: Record<string, string>;
};

const ts = () => import("monaco-editor/languages/definitions/typescript/typescript").then((m) => m.conf);
const js = () => import("monaco-editor/languages/definitions/javascript/javascript").then((m) => m.conf);
const html = () => import("monaco-editor/languages/definitions/html/html").then((m) => m.conf);
const cpp = () => import("monaco-editor/languages/definitions/cpp/cpp").then((m) => m.conf);
const ini = () => import("monaco-editor/languages/definitions/ini/ini").then((m) => m.conf);

const hashComments = async (): Promise<Conf> => ({
  comments: { lineComment: "#" },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"', notIn: ["string", "comment"] },
    { open: "'", close: "'", notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
});

const cStyle = async (): Promise<Conf> => ({
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"', notIn: ["string"] },
    { open: "'", close: "'", notIn: ["string", "comment"] },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
});

/** HTML-like single-file components: markup comments, HTML indentation. */
const component = async (): Promise<Conf> => {
  const base = (await html()) ?? {};
  return {
    ...base,
    comments: { blockComment: ["<!--", "-->"] },
    brackets: [
      ["<!--", "-->"],
      ["<", ">"],
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: "`", close: "`", notIn: ["string", "comment"] },
      { open: "<!--", close: "-->", notIn: ["comment", "string"] },
    ],
  };
};

// Inside JSX tags and children, comments are {/* ... */} (VS Code's "jsx-tags").
const jsxTags = async (): Promise<Conf> => {
  const base = (await html()) ?? {};
  return {
    comments: { blockComment: ["{/*", "*/}"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "/**", close: " */", notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "<", close: ">" },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
    onEnterRules: base.onEnterRules,
  };
};

const jsxScopes = (lang: "tsx" | "js", id: string): Record<string, string> => ({
  [`meta.tag.${lang}`]: "jsx-tags",
  [`meta.tag.without-attributes.${lang}`]: "jsx-tags",
  [`meta.tag.attributes.${lang}`]: id,
  [`meta.embedded.expression.${lang}`]: id,
});

// VS Code's list for TypeScript/JavaScript: `=>`, `<`/`>` operators and
// generic angle brackets are not bracket pairs.
const TS_UNBALANCED = [
  "keyword.operator.relational",
  "storage.type.function.arrow",
  "keyword.operator.bitwise.shift",
  "meta.brace.angle",
  "punctuation.definition.tag",
  "keyword.operator.assignment.compound.bitwise",
];

export const LANGUAGES: LanguageDef[] = [
  {
    id: "typescript",
    label: "TypeScript",
    extensions: [".ts", ".mts", ".cts"],
    grammar: () => import("shiki/langs/typescript.mjs"),
    conf: ts,
    unbalancedBrackets: TS_UNBALANCED,
  },
  {
    id: "typescriptreact",
    label: "TypeScript JSX",
    extensions: [".tsx"],
    grammar: () => import("shiki/langs/tsx.mjs"),
    conf: ts,
    unbalancedBrackets: TS_UNBALANCED,
    embeddedScopes: jsxScopes("tsx", "typescriptreact"),
  },
  {
    id: "javascript",
    label: "JavaScript",
    // VS Code's JavaScript grammar covers JSX too.
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".es6"],
    filenames: ["jakefile"],
    grammar: () => import("shiki/langs/javascript.mjs"),
    conf: js,
    unbalancedBrackets: TS_UNBALANCED,
    embeddedScopes: jsxScopes("js", "javascript"),
  },
  {
    // Not a file type: the settings used inside JSX markup.
    id: "jsx-tags",
    label: "JSX",
    conf: jsxTags,
  },
  {
    id: "json",
    label: "JSON",
    extensions: [".json", ".jsonc", ".json5", ".code-workspace", ".har", ".webmanifest", ".map"],
    filenames: [".babelrc", ".eslintrc", ".prettierrc", ".jshintrc", ".swcrc", ".watchmanconfig", "composer.lock", "flake.lock"],
    // One grammar for JSON and JSON with comments: comments show as comments.
    grammar: () => import("shiki/langs/jsonc.mjs"),
    conf: async () => undefined, // set by Monaco's JSON service
  },
  {
    id: "css",
    label: "CSS",
    extensions: [".css", ".pcss", ".postcss"],
    grammar: () => import("shiki/langs/css.mjs"),
    conf: () => import("monaco-editor/languages/definitions/css/css").then((m) => m.conf),
  },
  {
    id: "scss",
    label: "SCSS",
    extensions: [".scss", ".sass"],
    grammar: () => import("shiki/langs/scss.mjs"),
    conf: () => import("monaco-editor/languages/definitions/scss/scss").then((m) => m.conf),
  },
  {
    id: "less",
    label: "Less",
    extensions: [".less"],
    grammar: () => import("shiki/langs/less.mjs"),
    conf: () => import("monaco-editor/languages/definitions/less/less").then((m) => m.conf),
  },
  {
    id: "html",
    label: "HTML",
    extensions: [".html", ".htm", ".xhtml", ".shtml"],
    grammar: () => import("shiki/langs/html.mjs"),
    conf: html,
  },
  {
    id: "vue",
    label: "Vue",
    extensions: [".vue"],
    grammar: () => import("shiki/langs/vue.mjs"),
    conf: component,
    unbalancedBrackets: TS_UNBALANCED,
  },
  {
    id: "svelte",
    label: "Svelte",
    extensions: [".svelte"],
    grammar: () => import("shiki/langs/svelte.mjs"),
    conf: component,
    unbalancedBrackets: TS_UNBALANCED,
  },
  {
    id: "astro",
    label: "Astro",
    extensions: [".astro"],
    grammar: () => import("shiki/langs/astro.mjs"),
    conf: component,
    unbalancedBrackets: TS_UNBALANCED,
  },
  {
    id: "markdown",
    label: "Markdown",
    extensions: [".md", ".markdown", ".mdown", ".mkd", ".mdx"],
    grammar: () => import("shiki/langs/markdown.mjs"),
    // Fenced code blocks in these languages get highlighted too.
    embeds: [
      () => import("shiki/langs/typescript.mjs"),
      () => import("shiki/langs/tsx.mjs"),
      () => import("shiki/langs/javascript.mjs"),
      () => import("shiki/langs/jsonc.mjs"),
      () => import("shiki/langs/json.mjs"),
      () => import("shiki/langs/shellscript.mjs"),
      () => import("shiki/langs/python.mjs"),
      () => import("shiki/langs/css.mjs"),
      () => import("shiki/langs/html.mjs"),
      () => import("shiki/langs/yaml.mjs"),
      () => import("shiki/langs/rust.mjs"),
      () => import("shiki/langs/diff.mjs"),
    ],
    conf: () => import("monaco-editor/languages/definitions/markdown/markdown").then((m) => m.conf),
  },
  {
    id: "python",
    label: "Python",
    extensions: [".py", ".pyw", ".pyi", ".rpy", ".gyp", ".gypi", ".ipy"],
    filenames: ["sconstruct", "sconscript", "snakefile"],
    grammar: () => import("shiki/langs/python.mjs"),
    conf: () => import("monaco-editor/languages/definitions/python/python").then((m) => m.conf),
  },
  {
    id: "rust",
    label: "Rust",
    extensions: [".rs"],
    grammar: () => import("shiki/langs/rust.mjs"),
    conf: () => import("monaco-editor/languages/definitions/rust/rust").then((m) => m.conf),
  },
  {
    id: "go",
    label: "Go",
    extensions: [".go"],
    grammar: () => import("shiki/langs/go.mjs"),
    conf: () => import("monaco-editor/languages/definitions/go/go").then((m) => m.conf),
  },
  {
    id: "java",
    label: "Java",
    extensions: [".java", ".jav"],
    grammar: () => import("shiki/langs/java.mjs"),
    conf: () => import("monaco-editor/languages/definitions/java/java").then((m) => m.conf),
  },
  {
    id: "c",
    label: "C",
    extensions: [".c", ".h", ".i"],
    grammar: () => import("shiki/langs/c.mjs"),
    conf: cpp,
  },
  {
    id: "cpp",
    label: "C++",
    extensions: [".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++", ".ipp", ".inl", ".tpp", ".ino", ".cu"],
    grammar: () => import("shiki/langs/cpp.mjs"),
    conf: cpp,
  },
  {
    id: "csharp",
    label: "C#",
    extensions: [".cs", ".csx", ".cake"],
    grammar: () => import("shiki/langs/csharp.mjs"),
    conf: () => import("monaco-editor/languages/definitions/csharp/csharp").then((m) => m.conf),
  },
  {
    id: "php",
    label: "PHP",
    extensions: [".php", ".phtml", ".php4", ".php5", ".phps", ".ctp"],
    grammar: () => import("shiki/langs/php.mjs"),
    conf: () => import("monaco-editor/languages/definitions/php/php").then((m) => m.conf),
  },
  {
    id: "swift",
    label: "Swift",
    extensions: [".swift"],
    grammar: () => import("shiki/langs/swift.mjs"),
    conf: () => import("monaco-editor/languages/definitions/swift/swift").then((m) => m.conf),
  },
  {
    id: "kotlin",
    label: "Kotlin",
    extensions: [".kt", ".kts"],
    grammar: () => import("shiki/langs/kotlin.mjs"),
    conf: () => import("monaco-editor/languages/definitions/kotlin/kotlin").then((m) => m.conf),
  },
  {
    id: "yaml",
    label: "YAML",
    extensions: [".yml", ".yaml", ".eyaml", ".eyml", ".cff"],
    filenames: [".clang-format", ".clang-tidy", ".clangd"],
    grammar: () => import("shiki/langs/yaml.mjs"),
    conf: () => import("monaco-editor/languages/definitions/yaml/yaml").then((m) => m.conf),
  },
  {
    id: "toml",
    label: "TOML",
    extensions: [".toml"],
    filenames: ["cargo.lock", "poetry.lock", "pipfile", "uv.lock"],
    grammar: () => import("shiki/langs/toml.mjs"),
    conf: hashComments,
  },
  {
    id: "sql",
    label: "SQL",
    extensions: [".sql", ".dsql", ".psql", ".pgsql"],
    grammar: () => import("shiki/langs/sql.mjs"),
    conf: () => import("monaco-editor/languages/definitions/sql/sql").then((m) => m.conf),
  },
  {
    id: "shell",
    label: "Shell",
    extensions: [".sh", ".bash", ".zsh", ".ksh", ".fish", ".command", ".bats", ".ebuild"],
    filenames: [
      ".bashrc",
      ".bash_profile",
      ".bash_login",
      ".bash_logout",
      ".bash_aliases",
      ".zshrc",
      ".zprofile",
      ".zshenv",
      ".zlogin",
      ".zlogout",
      ".profile",
      ".kshrc",
      "pkgbuild",
      "apkbuild",
    ],
    grammar: () => import("shiki/langs/shellscript.mjs"),
    conf: () => import("monaco-editor/languages/definitions/shell/shell").then((m) => m.conf),
  },
  {
    id: "dockerfile",
    label: "Dockerfile",
    extensions: [".dockerfile", ".containerfile"],
    filenames: ["dockerfile", "containerfile"],
    grammar: () => import("shiki/langs/docker.mjs"),
    conf: () => import("monaco-editor/languages/definitions/dockerfile/dockerfile").then((m) => m.conf),
  },
  {
    id: "graphql",
    label: "GraphQL",
    extensions: [".graphql", ".gql", ".graphqls"],
    grammar: () => import("shiki/langs/graphql.mjs"),
    conf: () => import("monaco-editor/languages/definitions/graphql/graphql").then((m) => m.conf),
  },
  {
    id: "xml",
    label: "XML",
    extensions: [".xml", ".xsd", ".xsl", ".xslt", ".svg", ".plist", ".csproj", ".fsproj", ".vbproj", ".props", ".targets", ".resx", ".storyboard", ".xib", ".xaml", ".wsdl", ".rss", ".atom", ".entitlements"],
    grammar: () => import("shiki/langs/xml.mjs"),
    conf: () => import("monaco-editor/languages/definitions/xml/xml").then((m) => m.conf),
  },
  {
    id: "dotenv",
    label: "Environment",
    extensions: [".env"],
    grammar: () => import("shiki/langs/dotenv.mjs"),
    conf: hashComments,
  },
  {
    id: "ini",
    label: "INI",
    extensions: [".ini", ".cfg", ".conf", ".properties", ".editorconfig", ".npmrc", ".yarnrc", ".pypirc", ".gitconfig"],
    filenames: [".editorconfig", ".npmrc", ".yarnrc", ".gitconfig", ".gitmodules", "gitconfig", ".pylintrc", "setup.cfg", "tox.ini", "pytest.ini", ".flake8"],
    grammar: () => import("shiki/langs/ini.mjs"),
    conf: ini,
  },
  {
    id: "ignore",
    label: "Ignore",
    extensions: [".gitignore", ".dockerignore", ".npmignore", ".prettierignore", ".eslintignore", ".vercelignore", ".gcloudignore"],
    filenames: [".gitignore", ".gitattributes", ".dockerignore", ".npmignore", ".prettierignore", ".eslintignore", ".vercelignore", ".gcloudignore", ".stylelintignore", ".ignore", "codeowners", ".git-blame-ignore-revs"],
    grammar: () => import("./ignore-grammar").then((m) => ({ default: [m.ignoreGrammar] })),
    conf: async () => ({ comments: { lineComment: "#" } }),
  },
  {
    id: "git-commit",
    label: "Git Commit",
    filenames: ["commit_editmsg", "merge_msg", "tag_editmsg"],
    grammar: () => import("shiki/langs/git-commit.mjs"),
    conf: async () => ({ comments: { lineComment: "#" } }),
  },
  {
    id: "diff",
    label: "Diff",
    extensions: [".diff", ".patch", ".rej"],
    grammar: () => import("shiki/langs/diff.mjs"),
    conf: async () => ({}),
  },
  {
    id: "makefile",
    label: "Makefile",
    extensions: [".mk", ".mak"],
    filenames: ["makefile", "gnumakefile", "bsdmakefile"],
    grammar: () => import("shiki/langs/make.mjs"),
    conf: hashComments,
  },
  {
    id: "ruby",
    label: "Ruby",
    extensions: [".rb", ".rbx", ".gemspec", ".rake", ".ru", ".erb"],
    filenames: ["gemfile", "rakefile", "podfile", "fastfile", "brewfile", "vagrantfile", "guardfile"],
    grammar: () => import("shiki/langs/ruby.mjs"),
    conf: () => import("monaco-editor/languages/definitions/ruby/ruby").then((m) => m.conf),
  },
  {
    id: "lua",
    label: "Lua",
    extensions: [".lua"],
    grammar: () => import("shiki/langs/lua.mjs"),
    conf: () => import("monaco-editor/languages/definitions/lua/lua").then((m) => m.conf),
  },
  {
    id: "dart",
    label: "Dart",
    extensions: [".dart"],
    grammar: () => import("shiki/langs/dart.mjs"),
    conf: () => import("monaco-editor/languages/definitions/dart/dart").then((m) => m.conf),
  },
  {
    id: "scala",
    label: "Scala",
    extensions: [".scala", ".sc", ".sbt"],
    grammar: () => import("shiki/langs/scala.mjs"),
    conf: () => import("monaco-editor/languages/definitions/scala/scala").then((m) => m.conf),
  },
  {
    id: "elixir",
    label: "Elixir",
    extensions: [".ex", ".exs"],
    grammar: () => import("shiki/langs/elixir.mjs"),
    conf: () => import("monaco-editor/languages/definitions/elixir/elixir").then((m) => m.conf),
  },
  {
    id: "powershell",
    label: "PowerShell",
    extensions: [".ps1", ".psm1", ".psd1"],
    grammar: () => import("shiki/langs/powershell.mjs"),
    conf: () => import("monaco-editor/languages/definitions/powershell/powershell").then((m) => m.conf),
  },
  {
    id: "hcl",
    label: "Terraform",
    extensions: [".tf", ".tfvars", ".hcl"],
    grammar: () => import("shiki/langs/terraform.mjs"),
    conf: () => import("monaco-editor/languages/definitions/hcl/hcl").then((m) => m.conf),
  },
  {
    id: "proto",
    label: "Protocol Buffers",
    extensions: [".proto"],
    grammar: () => import("shiki/langs/proto.mjs"),
    conf: () => import("monaco-editor/languages/definitions/protobuf/protobuf").then((m) => m.conf),
  },
  {
    id: "prisma",
    label: "Prisma",
    extensions: [".prisma"],
    grammar: () => import("shiki/langs/prisma.mjs"),
    conf: cStyle,
  },
  {
    id: "zig",
    label: "Zig",
    extensions: [".zig", ".zon"],
    grammar: () => import("shiki/langs/zig.mjs"),
    conf: async () => ({ ...(await cStyle()), comments: { lineComment: "//" } }),
  },
  {
    id: "nginx",
    label: "Nginx",
    filenames: ["nginx.conf"],
    grammar: () => import("shiki/langs/nginx.mjs"),
    conf: hashComments,
  },
  {
    id: "plaintext",
    label: "Plain Text",
    extensions: [".txt", ".text", ".log"],
    filenames: ["license", "licence", "authors", "contributors", "notice"],
    conf: async () => ({}),
  },
];

const byId = new Map(LANGUAGES.map((lang) => [lang.id, lang]));
const byFilename = new Map<string, string>();
const byExtension = new Map<string, string>();
for (const lang of LANGUAGES) {
  for (const name of lang.filenames ?? []) byFilename.set(name.toLowerCase(), lang.id);
  for (const ext of lang.extensions ?? []) byExtension.set(ext.toLowerCase(), lang.id);
}

export function languageDef(id: string): LanguageDef | undefined {
  return byId.get(id);
}

/** Embedded scope → Monaco language, so comments and brackets follow the code under the cursor. */
export const EMBEDDED_SCOPES: Record<string, string> = {
  "source.js": "javascript",
  "source.js.jsx": "javascript",
  "source.ts": "typescript",
  "source.tsx": "typescriptreact",
  "source.css": "css",
  "source.css.scss": "scss",
  "source.css.less": "less",
  "source.postcss": "css",
  "text.html.basic": "html",
  "text.html.derivative": "html",
  "source.json": "json",
  "source.json.comments": "json",
  "source.yaml": "yaml",
  "source.toml": "toml",
  "source.graphql": "graphql",
  "source.python": "python",
  "source.shell": "shell",
  "source.sql": "sql",
  "source.rust": "rust",
  "source.diff": "diff",
  "text.html.markdown": "markdown",
  "meta.embedded.block.typescript": "typescript",
  "meta.embedded.block.tsx": "typescriptreact",
  "meta.embedded.block.javascript": "javascript",
  "meta.embedded.block.json": "json",
  "meta.embedded.block.shellscript": "shell",
  "meta.embedded.block.python": "python",
  "meta.embedded.block.css": "css",
  "meta.embedded.block.html": "html",
  "meta.embedded.block.yaml": "yaml",
  "meta.embedded.block.rust": "rust",
};

const SHEBANGS: Array<[RegExp, string]> = [
  [/\b(node|bun|deno|tsx|ts-node)\b/, "javascript"],
  [/\bpython[0-9.]*\b/, "python"],
  [/\b(ba|z|k|fi)?sh\b/, "shell"],
  [/\bruby\b/, "ruby"],
  [/\blua\b/, "lua"],
];

/** Monaco language id for a project-relative path (and optional first line). */
export function detectLanguage(path: string, firstLine = ""): string {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const lowerPath = path.toLowerCase();

  // .env, .env.local, .env.production, app.env
  if (name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) return "dotenv";
  if (/(^|\/)\.git\/(config|info\/exclude)$/.test(lowerPath)) return lowerPath.endsWith("exclude") ? "ignore" : "ini";
  if (/(^|\/)\.vscode\/.*\.json$/.test(lowerPath)) return "json";
  if (name.startsWith("dockerfile") || name.startsWith("containerfile")) return "dockerfile";
  if (name.startsWith("docker-compose") || name.startsWith("compose.")) {
    if (name.endsWith(".yml") || name.endsWith(".yaml")) return "yaml";
  }
  if (name.startsWith("tsconfig") && name.endsWith(".json")) return "json";

  const exact = byFilename.get(name);
  if (exact) return exact;

  // Longest matching extension wins (".d.ts" style names still end in ".ts").
  const dot = name.indexOf(".", 1);
  if (dot !== -1) {
    const parts = name.slice(dot).split(".").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const ext = `.${parts.slice(i).join(".")}`;
      const id = byExtension.get(ext);
      if (id) return id;
    }
  } else if (name.startsWith(".")) {
    const id = byExtension.get(name);
    if (id) return id;
  }

  if (firstLine.startsWith("#!")) {
    for (const [pattern, id] of SHEBANGS) if (pattern.test(firstLine)) return id;
  }
  if (/^<\?xml\b/.test(firstLine)) return "xml";
  return "plaintext";
}
