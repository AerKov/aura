import { expect, test } from "bun:test";
import { assertPublic, fetchPublic, isPrivateHost } from "./public-fetch";

const publicDns = async () => ["93.184.216.34"];

test("local and private spellings are refused, IPv4 inside IPv6 included", () => {
  for (const host of [
    "localhost",
    "printer.local",
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.1",
    "172.20.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "[::1]",
    "::ffff:127.0.0.1",
    "[::ffff:7f00:1]",
    "fd00::1",
  ])
    expect({ host, private: isPrivateHost(host) }).toEqual({ host, private: true });
  expect(isPrivateHost("example.com")).toBe(false);
  expect(isPrivateHost("8.8.8.8")).toBe(false);
});

test("a public name that resolves to this machine is refused", async () => {
  await expect(
    assertPublic(new URL("http://127.0.0.1.nip.io/"), async () => ["127.0.0.1"]),
  ).rejects.toThrow(/private/);
  await expect(assertPublic(new URL("http://2130706433/"), publicDns)).rejects.toThrow();
  await expect(assertPublic(new URL("file:///etc/passwd"), publicDns)).rejects.toThrow();
  await assertPublic(new URL("https://example.com/"), publicDns);
});

test("a redirect to the local network is refused before it is requested", async () => {
  const asked: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.startsWith("https://example.com/a"))
      return new Response(null, { status: 302, headers: { location: "https://example.com/b" } });
    if (url.startsWith("https://example.com/b"))
      return new Response(null, { status: 301, headers: { location: "http://192.168.1.1/admin" } });
    return new Response("ok");
  }) as unknown as typeof fetch;
  await expect(
    fetchPublic("https://example.com/a", {}, { fetch: fakeFetch, resolve: publicDns }),
  ).rejects.toThrow(/private/);
  expect(asked).toEqual(["https://example.com/a", "https://example.com/b"]);
  const res = await fetchPublic(
    "https://example.com/c",
    {},
    { fetch: fakeFetch, resolve: publicDns },
  );
  expect(await res.text()).toBe("ok");
});
