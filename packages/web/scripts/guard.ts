/**
 * Safety guard shared by the operator scripts. Every script refuses to write to
 * a non-local database unless the operator passes --target=<exact host> that
 * matches DATABASE_URL. This keeps an accidental run from touching the
 * production-candidate Turso database.
 */
export function dbTarget() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("file:")) return { local: true, label: url };
  let host = "unknown";
  try {
    host = new URL(url.replace(/^libsql:/, "https:")).host;
  } catch {
    /* keep unknown */
  }
  return { local: false, label: host };
}

export function assertWritable(argv: string[], dryRun: boolean) {
  const t = dbTarget();
  if (dryRun || t.local) return t;
  const flag = argv.find((a) => a.startsWith("--target="))?.slice("--target=".length);
  if (flag !== t.label) {
    console.error(
      `Refusing to write to remote database "${t.label}". Re-run with --dry-run, point DATABASE_URL at a local file, ` +
        `or (only with an approved change window and a fresh backup) pass --target=${t.label}.`,
    );
    process.exit(2);
  }
  return t;
}

export const arg = (argv: string[], name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
