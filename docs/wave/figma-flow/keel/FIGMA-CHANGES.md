# Figma changes made on the designer's behalf

File: "Keel - New File (Updated - 22:05)" (`OmgjhCFSzYeTIzZZTBQS5K`). Each change below was made by Claude in Figma, one off, because Asim asked for it, to get the file through Wave. Nothing on any screen moved. Next time, please draw it this way from the start: each entry says what Wave needs and why.

## 5 October 2026

### 1. Button: "Show icon" on/off became a variant, Icon = Yes / No

- **Where:** Button component set `28:197` (design system page).
- **Before:** a boolean property, Show icon, hid and showed the arrow on Primary, Ghost and Link.
- **After:** a variant property, Icon = Yes / No. Primary, Ghost and Link each have both (9 new Icon=No variants: `6035:324`, `6035:328`, `6035:332`, `6035:336`, `6035:340`, `6035:344`, `6035:348`, `6035:352`, `6035:356`). Secondary has no icon, so it is Icon=No. The Show icon property is gone. The 7 Buttons on the screens kept their look (6 with the arrow, Back to website without).
- **Why:** Wave takes a part that is shown or hidden only as a variant. A boolean toggled on an instance is a look the specimen never draws, so engineers cannot build it from the catalogue (the entry gate rule "Boolean property shows or hides a part").
- **Be mindful:** when a part can be there or not (an icon, a helper line, a badge), make it a variant property (Yes / No) and draw both.

### 2. Button Icon=No variants: label tied to the Label property

- **Where:** the 9 new variants above (text layers `6035:325` … `6035:358`).
- **What:** the duplicated variants' text was a fixed "Continue", not tied to the Label text property. Claude's own slip when duplicating; fixed before anything was published.
- **Be mindful:** after duplicating a variant, check its text layers still use the component's text properties (the property icon next to the text in the right panel).

### 3. Budget & Timing: canvas stacking set to "Last on top"

- **Where:** screen Budget-&-Timing `28:728`: the form `28:795`, its fields `28:796`, and the team-size wrapper `28:854`.
- **Before:** auto layout Canvas stacking "First on top".
- **After:** "Last on top", Figma's default. Nothing moved; the open team-size menu still shows above the page in the prototype (Wave lifts an open menu itself).
- **Why:** "First on top" becomes z-index numbers on the page (2, 3, 4). Wave wants every value from a token, and Figma has no variables for stacking order, so the page could only pass with a waiver. The entry gate now refuses it (rule "Canvas stacking first on top").
- **Be mindful:** leave Canvas stacking on "Last on top". Draw an open menu or popover in its component's Open variant; Wave puts it above the page.

## Earlier (stage 2, agreed with Asim)

### 4. Select option: width bound to a size variable

- **Where:** Select option `4007:374` (its 3 variants) and the 12 rows in the Select's Open menus.
- **What:** the fixed width 308 bound to a new variable `size/select-option` (308). Nothing moved.
- **Why:** a fixed size has to be a token (the gate rule "Fixed size without a variable").
- **Be mindful:** bind every fixed width and height to a size variable, or let the layer Hug or Fill.

### 5. Select: menu rows and the helper line

- The six menu rows were fixed at the component's width.
- Select's "Show helper" boolean became a Helper variant (On / Off), for the same reason as the Button's icon.

## How to check before handing over

Run the Wave Figma gate on the file (Wave Figma Gate skill, or ask Claude to "run the gate"). It lists every one of these, with a link to each layer, before Wave sees the file.
