// Replaces msw's cookie store in the prototype bundle. The real one reads
// localStorage when it loads, which throws in the prototype's sandboxed frame
// (an opaque origin has no storage), and brings a cookie library the frame
// cannot use anyway: it has no cookies.
export const cookieStore = {
  getCookies(_url: string): { key: string; value: string }[] {
    return [];
  },
  async setCookie(_cookie: string, _url: string): Promise<void> {},
};
