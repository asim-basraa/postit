/** A select drawn with its Open state and Menu, an option component, chips, and a screen using them. */
export const css = `.field{display:flex;flex-direction:column;gap:4px;width:240px}.box{border:1px solid #ccc;height:40px;display:flex;align-items:center;padding:0 8px}.box-open{border-color:#2f4bdb}.ph{color:#999}.val{color:#111}.menu{display:flex;flex-direction:column;border:1px solid #ccc;background:#fff}.opt{padding:8px}.opt-on{background:#eef}.chip{display:inline-flex;padding:4px 8px;border:1px solid #ccc}.chip-on{background:#111;color:#fff}.sr{position:absolute;width:1px;height:1px;opacity:0}`;
export const page = (body: string, name?: string) => `<!DOCTYPE html><html><head>${name ? `<meta name="wave:component" content="${name}">` : ""}<style>${css}</style></head><body>${body}</body></html>`;

export const option = (state: string, text: string) => `<div class="opt${state ? " opt-on" : ""}" data-wave-component="Option"${state ? ` data-wave-state="${state}"` : ""}><p>${text}</p></div>`;
export const selectSpecimen = page(
  `<div data-wave-component="Select" class="field"><p>Size</p><div class="box"><p class="ph">Pick one</p></div></div>
   <div data-wave-component="Select" data-wave-state="filled" class="field"><p>Size</p><div class="box"><p class="val">Pick one</p></div></div>
   <div data-wave-component="Select" data-wave-state="open" class="field"><p>Size</p><div class="box box-open"><p class="ph">Pick one</p></div><div class="menu" data-figma-name="Menu">${option("selected", "Option")}${option("", "Option")}</div></div>`,
  "Select",
);
export const optionSpecimen = page(`${option("", "Option")}${option("selected", "Option")}`, "Option");
export const chip = (state: string) => `<label class="chip${state ? " chip-on" : ""}" data-wave-component="Chip"${state ? ` data-wave-state="${state}"` : ""}><input class="sr" type="radio" name="x" data-wave-insert><p>A</p></label>`;

export const screen = page(`<form>
  <div data-wave-component="Select" class="field"><p>Size</p><button type="button" class="box" data-wave-tag="div" data-wave-role="select" aria-haspopup="listbox" aria-label="Size" data-wave-field="lead/size" data-wave-options="Small|Large"><p class="ph">Pick one</p></button></div>
  <div role="radiogroup" aria-label="Pick" data-wave-field="lead/pick">
    <label class="chip" data-wave-component="Chip"><input class="sr" type="radio" name="x" value="a" data-wave-insert><p>A</p></label>
    <label class="chip" data-wave-component="Chip"><input class="sr" type="radio" name="x" value="b" data-wave-insert><p>B</p></label>
  </div>
</form>`);
