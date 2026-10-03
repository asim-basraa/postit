import { describe, expect, it, vi } from "vitest";
import { createRenderCache, renderMarkdown } from "../src/index";
import type { SpaceContext } from "../src/context";

const readable = (...targets: string[]): SpaceContext => ({
  resolveLink: (t) => (targets.includes(t) ? { href: `/s/x/${t}` } : null),
});

describe("the render cache", () => {
  it("renders an unchanged page once", async () => {
    const cache = createRenderCache();
    const renderer = vi.fn(renderMarkdown);
    const first = await cache.render("# T\n\nsee [[plan]]", readable("plan"), renderer);
    const second = await cache.render("# T\n\nsee [[plan]]", readable("plan"), renderer);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("never hands one viewer's links to another", async () => {
    const cache = createRenderCache();
    const renderer = vi.fn(renderMarkdown);
    const insider = await cache.render("see [[secret]]", readable("secret"), renderer);
    const outsider = await cache.render("see [[secret]]", readable(), renderer);
    expect(insider.html).toContain('href="/s/x/secret"');
    expect(outsider.html).not.toContain("/s/x/secret");
    expect(outsider).toEqual(await renderMarkdown("see [[secret]]", readable()));
    expect(renderer).toHaveBeenCalledTimes(2);
    // Both variants are remembered.
    await cache.render("see [[secret]]", readable("secret"), renderer);
    await cache.render("see [[secret]]", readable(), renderer);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("renders again when the text changes", async () => {
    const cache = createRenderCache();
    const renderer = vi.fn(renderMarkdown);
    await cache.render("one", readable(), renderer);
    const changed = await cache.render("two", readable(), renderer);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(changed.html).toContain("two");
  });

  it("forgets the least recently read page first", async () => {
    const cache = createRenderCache(2);
    const renderer = vi.fn(renderMarkdown);
    await cache.render("a", readable(), renderer);
    await cache.render("b", readable(), renderer);
    await cache.render("a", readable(), renderer);
    await cache.render("c", readable(), renderer);
    expect(cache.size).toBe(2);
    await cache.render("a", readable(), renderer);
    expect(renderer).toHaveBeenCalledTimes(3);
    await cache.render("b", readable(), renderer);
    expect(renderer).toHaveBeenCalledTimes(4);
  });

  it("gives callers a copy they may change", async () => {
    const cache = createRenderCache();
    const first = await cache.render("## H", readable(), renderMarkdown);
    first.headings.length = 0;
    const second = await cache.render("## H", readable(), renderMarkdown);
    expect(second.headings).toHaveLength(1);
  });
});
