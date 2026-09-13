class CursorUtil {
  public static encode(value: unknown): string {
    return btoa(JSON.stringify(value));
  }

  public static decode<T>(cursor: string | undefined): T | undefined {
    if (!cursor) return undefined;
    try {
      return JSON.parse(atob(cursor)) as T;
    } catch {
      return undefined;
    }
  }
}

export { CursorUtil };
