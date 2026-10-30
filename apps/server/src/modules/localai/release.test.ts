import { describe, expect, test } from "bun:test";
import { chooseFile } from "./huggingface";
import { parseRelease, pickAsset, variantsFor } from "./release";

const URL = "https://github.com/ggml-org/llama.cpp/releases/download/b9999";
const asset = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  size: 1000,
  browser_download_url: `${URL}/${name}`,
  ...extra,
});
const SHA = "a".repeat(64);

describe("llama.cpp releases (ADR 0038)", () => {
  const release = parseRelease({
    tag_name: "b9999",
    assets: [
      asset("llama-b9999-bin-macos-arm64.tar.gz", { digest: `sha256:${SHA}` }),
      asset("llama-b9999-bin-macos-x64.tar.gz"),
      asset("llama-b9999-bin-ubuntu-x64.tar.gz"),
      asset("llama-b9999-bin-ubuntu-vulkan-x64.tar.gz"),
      asset("llama-b9999-bin-win-cpu-x64.zip"),
      asset("llama-b9999-bin-win-vulkan-x64.zip"),
      asset("llama-b9999-bin-win-cuda-12.4-x64.zip"),
      asset("cudart-llama-bin-win-cuda-12.4-x64.zip"),
      asset("llama-b9999-xcframework.zip"),
      {
        name: "evil.zip",
        size: 1,
        browser_download_url: "https://evil.example/llama-bin-win-cpu-x64.zip",
      },
    ],
  });

  test("assets from anywhere but ggml-org/llama.cpp are dropped; the stated checksum is kept", () => {
    expect(release.assets.map((a) => a.name)).not.toContain("evil.zip");
    expect(release.assets.find((a) => a.name.includes("macos-arm64"))?.sha256).toBe(SHA);
    expect(release.assets.find((a) => a.name.includes("macos-x64"))?.sha256).toBeNull();
  });

  test("each system gets its own build: Metal on a Mac, Vulkan then CPU elsewhere", () => {
    expect(variantsFor("darwin", "arm64")).toEqual(["metal"]);
    expect(variantsFor("win32", "x64")).toEqual(["vulkan", "cpu"]);
    expect(variantsFor("linux", "arm64")).toEqual(["cpu"]);
    const name = (p: string, a: string, v: "metal" | "vulkan" | "cpu") =>
      pickAsset(release.assets, p, a, v)?.name;
    expect(name("darwin", "arm64", "metal")).toBe("llama-b9999-bin-macos-arm64.tar.gz");
    expect(name("darwin", "x64", "metal")).toBe("llama-b9999-bin-macos-x64.tar.gz");
    expect(name("win32", "x64", "vulkan")).toBe("llama-b9999-bin-win-vulkan-x64.zip");
    expect(name("win32", "x64", "cpu")).toBe("llama-b9999-bin-win-cpu-x64.zip");
    expect(name("linux", "x64", "cpu")).toBe("llama-b9999-bin-ubuntu-x64.tar.gz");
    expect(name("linux", "x64", "vulkan")).toBe("llama-b9999-bin-ubuntu-vulkan-x64.tar.gz");
    // No such build in this release.
    expect(name("linux", "arm64", "cpu")).toBeUndefined();
    expect(name("freebsd", "x64", "cpu")).toBeUndefined();
  });

  test("a model file is chosen by quantization, never a shard or a projector", () => {
    const siblings = [
      { rfilename: "README.md" },
      { rfilename: "Qwen3-4B-Q8_0.gguf", size: 4_300_000_000 },
      {
        rfilename: "Qwen3-4B-Q4_K_M.gguf",
        size: 2_500_000_000,
        lfs: { sha256: SHA, size: 2_500_000_000 },
      },
      { rfilename: "mmproj-F16.gguf", size: 1 },
      { rfilename: "big/Qwen3-Q4_K_M-00001-of-00002.gguf", size: 1 },
    ];
    const file = chooseFile("unsloth/Qwen3-4B-GGUF", siblings, "Q4_K_M");
    expect(file).toMatchObject({ file: "Qwen3-4B-Q4_K_M.gguf", size: 2_500_000_000, sha256: SHA });
    expect(file.url).toBe(
      "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
    );
    expect(() => chooseFile("x/y", siblings, "IQ2_XS")).toThrow('no "IQ2_XS" file');
    expect(() => chooseFile("x/y", [{ rfilename: "a.txt" }], "Q4_K_M")).toThrow("no single-file");
  });
});
