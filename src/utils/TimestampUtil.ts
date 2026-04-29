class TimestampUtil {
  public static getCurrentUnixTimestampInSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  public static addDays(timestampSeconds: number, days: number): number {
    return timestampSeconds + days * 24 * 60 * 60;
  }

  public static addMinutes(timestampSeconds: number, minutes: number): number {
    return timestampSeconds + minutes * 60;
  }
}

export { TimestampUtil };
