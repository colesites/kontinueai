// TextMate grammar for .gitignore-style files (Shiki doesn't ship one):
// `#` comments, `!` negation, glob characters and trailing-slash folders.

import type { LanguageRegistration } from "shiki/types";

export const ignoreGrammar = {
  name: "ignore",
  scopeName: "source.ignore",
  patterns: [
    {
      match: "^\\s*(#).*$",
      name: "comment.line.number-sign.ignore",
      captures: { "1": { name: "punctuation.definition.comment.ignore" } },
    },
    { match: "^\\s*!", name: "keyword.operator.negation.ignore" },
    { match: "\\*\\*|\\*|\\?", name: "keyword.operator.glob.ignore" },
    { match: "\\[[^\\]]*\\]", name: "constant.character.set.ignore" },
    { match: "/$", name: "punctuation.separator.directory.ignore" },
    { match: "\\\\.", name: "constant.character.escape.ignore" },
    // .gitattributes: `*.png binary`, `text=auto eol=lf`, `-diff`
    { match: "(?<=\\s)[-!]?[A-Za-z][\\w-]*(?==|\\s|$)", name: "entity.other.attribute-name.ignore" },
    { match: "(?<==)[^\\s]+", name: "string.unquoted.ignore" },
  ],
} as unknown as LanguageRegistration;
