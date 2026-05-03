/** Framework detail routes stay under /frameworks. */
export function isPrimaryNavActive(navPath: string, pathname: string): boolean {
  if (navPath === "/frameworks") {
    return pathname === "/frameworks" || pathname.startsWith("/frameworks/");
  }
  return pathname === navPath;
}
