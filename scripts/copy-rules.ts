/**
 * The unslop rules a script can check (.agents/skills/unslop/SKILL.md). The
 * rule numbers are that skill's. Rules that need judgment, such as forced
 * threes, a second name for one thing, or a sentence that says nothing, are
 * not here, so a clean result does not replace reading the copy against the
 * skill.
 */
export interface CopyFinding {
  readonly line: number;
  readonly rule: number;
  readonly message: string;
  readonly found: string;
}

interface Pattern {
  readonly rule: number;
  readonly message: string;
  readonly match: RegExp;
}

const word = (alternatives: string): RegExp =>
  new RegExp(`\\b(?:${alternatives})\\b`, "giu");

const patterns: readonly Pattern[] = [
  {
    rule: 7,
    message: "AI vocabulary. Use the plain word or cut it.",
    match: word(
      "additionally|crucial(?:ly)?|delv(?:e|es|ed|ing)|enhanc(?:e|es|ed|ing|ement|ements)|foster(?:s|ed|ing)?|landscapes?|pivotal|showcas(?:e|es|ed|ing)|testament|underscor(?:e|es|ed|ing)|vibrant",
    ),
  },
  {
    rule: 8,
    message: 'Say "is" or "has".',
    match: word("serves? as|stands? as|boasts?"),
  },
  {
    rule: 9,
    message: 'No "not just X, but Y". State the point.',
    match: word("not (?:just|only|merely)"),
  },
  {
    rule: 13,
    message: "No dash. Use a period or a comma.",
    match: /[—–]|(?<=\S) - (?=\S)/gu,
  },
  {
    rule: 18,
    message: "No decorative emoji.",
    match: /\p{Extended_Pictographic}/gu,
  },
  {
    rule: 19,
    message: "Straight quotes.",
    match: /[“”‘’]/gu,
  },
  {
    rule: 20,
    message: "Chatbot phrase. Cut it.",
    match: word(
      "i hope this helps|let me know if|feel free to|happy to help|hope that helps",
    ),
  },
  {
    rule: 22,
    message: "No praise or agreement opener.",
    match: word("great question|you're absolutely right|good catch"),
  },
  {
    rule: 23,
    message: "Filler. Cut it.",
    match: word(
      "in order to|it is important to note|it(?:'s| is) worth noting|it should be noted",
    ),
  },
  {
    rule: 26,
    message: "Abstract metaphor noun. Use the concrete word.",
    match: word(
      "substrates?|wedges?|vectors?|nexus|primitives?|harness(?:es)?|surfaces?|scaffolding|paradigms?|ratchets?|north star|flywheels?",
    ),
  },
  {
    rule: 31,
    message: 'Use the plain word, such as "use".',
    match: word("utili[sz](?:e|es|ed|ing|ation)|leverag(?:e|es|ed|ing)"),
  },
  {
    rule: 33,
    message: "Spell out the arrow.",
    match: /[→←⇒⇐]|(?<![-=<])[-=]>/gu,
  },
];

/**
 * Blanks what the rules do not apply to: code, and words quoted exactly as
 * the app shows them. A Play named "Stick — Thunder" keeps its dash.
 */
function withoutQuotedText(line: string): string {
  return line
    .replace(/`[^`]*`/gu, (span) => " ".repeat(span.length))
    .replace(/"[^"]*"/gu, (span) => " ".repeat(span.length))
    .replace(/<!--.*?-->/gu, (span) => " ".repeat(span.length))
    .replace(/\]\([^)]*\)/gu, (span) => " ".repeat(span.length))
    .replace(/https?:\/\/\S+/gu, (span) => " ".repeat(span.length));
}

/** Checks prose. Fenced code blocks are skipped. */
export function checkCopy(text: string): CopyFinding[] {
  const findings: CopyFinding[] = [];
  let fenced = false;
  text.split("\n").forEach((raw, index) => {
    if (/^\s*(?:```|~~~)/u.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = withoutQuotedText(raw);
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern.match)) {
        findings.push({
          line: index + 1,
          rule: pattern.rule,
          message: pattern.message,
          found: match[0],
        });
      }
    }
  });
  return findings;
}
