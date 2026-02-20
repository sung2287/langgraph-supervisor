import fs from "node:fs";
import path from "node:path";

interface YamlLine {
  indent: number;
  text: string;
  lineNo: number;
}

class YamlSubsetParser {
  private idx = 0;

  constructor(
    private readonly lines: YamlLine[],
    private readonly absPath: string
  ) {}

  parse(): unknown {
    if (this.lines.length === 0) {
      return {};
    }

    const rootIndent = this.lines[0].indent;
    const value = this.parseNode(rootIndent);

    if (this.idx !== this.lines.length) {
      const line = this.lines[this.idx];
      throw new Error(
        `${this.absPath}:${line.lineNo} unexpected content '${line.text}'`
      );
    }

    return value;
  }

  private parseNode(indent: number): unknown {
    const current = this.peek();
    if (!current) {
      throw new Error(`${this.absPath}: unexpected EOF`);
    }
    if (current.indent !== indent) {
      throw new Error(
        `${this.absPath}:${current.lineNo} invalid indentation for '${current.text}'`
      );
    }
    if (current.text.startsWith("- ")) {
      return this.parseSequence(indent);
    }
    return this.parseMapping(indent);
  }

  private parseMapping(indent: number): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.parseMappingEntries(out, indent);
    return out;
  }

  private parseMappingEntries(
    out: Record<string, unknown>,
    indent: number
  ): void {
    while (true) {
      const line = this.peek();
      if (!line || line.indent < indent) {
        return;
      }
      if (line.indent > indent) {
        throw new Error(
          `${this.absPath}:${line.lineNo} invalid indentation for '${line.text}'`
        );
      }
      if (line.text.startsWith("- ")) {
        return;
      }

      const { key, rest } = this.parseKeyValue(line.text, line.lineNo);
      this.idx += 1;

      let value: unknown;
      if (rest === "") {
        const nested = this.peek();
        if (nested && nested.indent > indent) {
          value = this.parseNode(nested.indent);
        } else {
          value = {};
        }
      } else {
        value = this.parseScalar(rest, line.lineNo);
      }

      out[key] = value;
    }
  }

  private parseSequence(indent: number): unknown[] {
    const out: unknown[] = [];

    while (true) {
      const line = this.peek();
      if (!line || line.indent < indent) {
        return out;
      }
      if (line.indent > indent) {
        throw new Error(
          `${this.absPath}:${line.lineNo} invalid indentation for '${line.text}'`
        );
      }
      if (!line.text.startsWith("- ")) {
        return out;
      }

      const rest = line.text.slice(2).trim();
      const lineNo = line.lineNo;
      this.idx += 1;

      if (rest === "") {
        const nested = this.peek();
        if (nested && nested.indent > indent) {
          out.push(this.parseNode(nested.indent));
        } else {
          out.push(null);
        }
        continue;
      }

      if (this.looksLikeKeyValue(rest)) {
        const obj: Record<string, unknown> = {};
        const { key, rest: inlineRest } = this.parseKeyValue(rest, lineNo);
        if (inlineRest === "") {
          const nested = this.peek();
          if (nested && nested.indent > indent) {
            obj[key] = this.parseNode(nested.indent);
          } else {
            obj[key] = {};
          }
        } else {
          obj[key] = this.parseScalar(inlineRest, lineNo);
        }

        const nestedIndent = indent + 2;
        const next = this.peek();
        if (next && next.indent > indent) {
          if (next.indent !== nestedIndent) {
            throw new Error(
              `${this.absPath}:${next.lineNo} invalid indentation for '${next.text}'`
            );
          }
          this.parseMappingEntries(obj, nestedIndent);
        }

        out.push(obj);
        continue;
      }

      out.push(this.parseScalar(rest, lineNo));
    }
  }

  private looksLikeKeyValue(value: string): boolean {
    const idx = value.indexOf(":");
    return idx > 0;
  }

  private parseKeyValue(
    value: string,
    lineNo: number
  ): { key: string; rest: string } {
    const idx = value.indexOf(":");
    if (idx <= 0) {
      throw new Error(`${this.absPath}:${lineNo} expected 'key: value'`);
    }

    const key = value.slice(0, idx).trim();
    const rest = value.slice(idx + 1).trim();
    if (key === "") {
      throw new Error(`${this.absPath}:${lineNo} empty key is not allowed`);
    }
    return { key, rest };
  }

  private parseScalar(value: string, lineNo: number): unknown {
    const trimmed = value.trim();

    if (trimmed === "{}") {
      return {};
    }
    if (trimmed === "[]") {
      return [];
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
    if (trimmed === "null") {
      return null;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    if (trimmed === "") {
      throw new Error(`${this.absPath}:${lineNo} empty scalar is not allowed`);
    }
    return trimmed;
  }

  private peek(): YamlLine | undefined {
    return this.lines[this.idx];
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function toYamlLines(raw: string, absPath: string): YamlLine[] {
  const lines = stripBom(raw).split(/\r?\n/);
  const out: YamlLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i];
    if (line.includes("\t")) {
      throw new Error(`${absPath}:${lineNo} tab indentation is not supported`);
    }

    const noComment = line.replace(/\s+#.*$/, "");
    const trimmed = noComment.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const indent = noComment.length - noComment.trimStart().length;
    out.push({
      indent,
      text: noComment.trimEnd().slice(indent),
      lineNo,
    });
  }

  return out;
}

export function loadYamlFile<T>(absPath: string): T {
  if (!path.isAbsolute(absPath)) {
    throw new Error(`POLICY_LOAD_ERROR ${absPath}: path must be absolute`);
  }

  if (!fs.existsSync(absPath)) {
    throw new Error(`POLICY_LOAD_ERROR ${absPath}: file does not exist`);
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    throw new Error(`POLICY_LOAD_ERROR ${absPath}: not a file`);
  }

  const raw = fs.readFileSync(absPath, "utf8");

  try {
    const parser = new YamlSubsetParser(toYamlLines(raw, absPath), absPath);
    return parser.parse() as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`POLICY_LOAD_ERROR ${absPath}: ${message}`);
  }
}
