import { loadEnvFile } from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";

loadEnvFile(".env");

async function main(): Promise<void> {
  const content = await readFile("input/phrases.txt", "utf8");

  const phrases = content
    .split(/\r?\n/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);

  const firstPhrase = phrases[0];

  if (!firstPhrase) {
    throw new Error("No phrases found in input/phrases.txt");
  }

  const client = new OpenAI();

  console.log(`Generating speech: ${firstPhrase}`);

  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "coral",
    input: firstPhrase,
    instructions: "Speak clearly and naturally for an English learner.",
  });

  await mkdir("output", { recursive: true });

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  await writeFile("output/phrase-001.mp3", audioBuffer);

  console.log("Created output/phrase-001.mp3");
}

main().catch((error: unknown) => {
  console.error("Failed to generate speech:", error);
  process.exitCode = 1;
});
