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

  if (phrases.length === 0) {
    throw new Error("No phrases found in input/phrases.txt");
  }

  const client = new OpenAI();

  await mkdir("output", { recursive: true });

  for (const [index, phrase] of phrases.entries()) {
    const fileNumber = String(index + 1).padStart(3, "0");
    const outputPath = `output/phrase-${fileNumber}.mp3`;

    console.log(
      `Generating ${index + 1}/${phrases.length}: ${phrase}`,
    );

    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: phrase,
      instructions: "Speak clearly and naturally for an English learner.",
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    await writeFile(outputPath, audioBuffer);

    console.log(`Created ${outputPath}`);
  }

  console.log(`Finished generating ${phrases.length} audio files.`);
}

main().catch((error: unknown) => {
  console.error("Failed to generate speech:", error);
  process.exitCode = 1;
});
