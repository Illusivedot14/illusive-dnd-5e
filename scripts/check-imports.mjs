import fs from "node:fs";
import path from "node:path";

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, a);
    else if (e.name.endsWith(".mjs")) a.push(f);
  }
  return a;
}

const patterns = [
  /from\s+["'](\.[^"']+)["']/g,
  /import\(\s*["'](\.[^"']+)["']\s*\)/g
];
let bad = 0;
for (const file of [...walk("src"), ...walk("test")]) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1];
      const resolved = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(resolved)) {
        console.log("MISSING", path.relative(".", file), "->", spec);
        bad += 1;
      }
    }
  }
}
console.log("bad", bad);
