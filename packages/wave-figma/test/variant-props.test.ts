import { describe, expect, it } from "vitest";
import { variantProps } from "../src/convert";

const code = `type SelectProps = {
  className?: string;
  helper?: string;
  helper1?: boolean;
  optional?: boolean;
  state?: "Default" | "Filled" | "Open";
};`;

describe("variant properties as the reference component's props", () => {
  it("passes an On/Off variant to Figma's numbered boolean when a text property has its name", () => {
    expect(variantProps(code, { State: "Open", Helper: "On" })).toEqual({ state: "Open", helper1: true });
    expect(variantProps(code, { State: "Filled", Helper: "Off" })).toEqual({ state: "Filled", helper1: false });
  });

  it("keeps the plain name when it fits", () => {
    expect(variantProps(code, { Optional: "Yes" })).toEqual({ optional: true });
    expect(variantProps("type P = { size?: \"Full\" | \"Half\"; };", { Size: "Half" })).toEqual({ size: "Half" });
  });
});

import { strokeOutOfLayout } from "../src/convert";

describe("a stroke Figma leaves out of auto layout", () => {
  it("draws the border as an outline inside the box", () => {
    const cls = "bg-white border-[length:var(--border-width\\/default,1px)] border-[var(--color\\/border\\/default,#dcdcd8)] border-solid p-[6px] rounded-[10px]";
    expect(strokeOutOfLayout(cls, 1)).toBe("bg-white outline-[length:var(--border-width\\/default,1px)] outline-[var(--color\\/border\\/default,#dcdcd8)] outline-solid p-[6px] rounded-[10px] outline-offset-[calc(var(--border-width\\/default,1px)*-1)]");
  });
  it("leaves a border on some sides alone", () => {
    const cls = "border-b-[1px] border-solid";
    expect(strokeOutOfLayout(cls, 1)).toBe(cls);
  });
});
