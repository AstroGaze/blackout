const names = new Intl.DisplayNames(['en'], { type: 'language' });

/** "Spanish" for "es": a language's name in English, or the code when it has none. */
export function languageName(code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
