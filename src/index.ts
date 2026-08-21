import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const content = await readFile("input/phrases.txt", "utf8");

  const phrases = content
    .split(/\r?\n/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);

  console.log(`Loaded ${phrases.length} phrases.`);

  phrases.forEach((phrase, index) => {
    console.log(`${index + 1}: ${phrase}`);
  });
}

main().catch((error: unknown) => {
  console.error("Failed to load phrases:", error);
  process.exitCode = 1;
});
