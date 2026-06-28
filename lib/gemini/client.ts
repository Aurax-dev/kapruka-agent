import { GoogleGenAI } from "@google/genai";

let instance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!instance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    instance = new GoogleGenAI({ apiKey: key });
  }
  return instance;
}
