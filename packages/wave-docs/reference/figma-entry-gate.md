# Figma entry gate rules

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

What in a Figma file Wave does not take as it is. Blocking items are fixed in Figma and the gate runs again; `wave-figma convert` refuses a file that has not passed.

## Blocking

| Rule | What | Fix in Figma |
| --- | --- | --- |
| `color.unbound` | Colour without a variable | Bind the fill or stroke to a colour variable. Wave only takes colours from tokens. |
| `color.stale` | Colour does not match its variable | The paint is bound to a variable but draws another colour. Re-apply the variable (detach and bind again) so the drawing and the token agree. |
| `variable.remote` | Variable from another file | The value is bound to a library variable this file does not define. Make the variable local, or publish the tokens from this file. |
| `spacing.unbound` | Spacing without a variable | Bind the gap or padding to a spacing variable. |
| `radius.unbound` | Corner radius without a variable | Bind the radius to a radius variable. |
| `stroke.unbound` | Stroke width without a variable | Bind the stroke width to a border-width variable. |
| `opacity.unbound` | Layer opacity without a variable | Bind the opacity to an opacity variable, or put the transparency in the colour variable. |
| `effect.unbound` | Shadow or blur without tokens | Use an effect style, or bind the effect's colour and sizes to variables. |
| `effect.under-stroke` | Inner shadow under an inside stroke | Figma draws the stroke over the inner shadow, a browser draws the shadow inside the border, so the two differ. Remove the inner shadow (when the stroke covers it, it shows nothing), or remove the stroke and let the shadow be the ring. |
| `text.style` | Text without a text style | Apply one of the file's text styles. |
| `layout.none` | Layers placed by hand | Use auto layout. Hand-placed layers become absolutely positioned HTML that does not reflow and does not match its component. |
| `layout.group` | Group | Replace the group with an auto layout frame. Groups place their layers absolutely. |
| `layout.absolute` | Absolute position with an offset | A layer placed at an offset becomes a pixel position. Let auto layout place it (alignment, padding bound to spacing variables); an overlay at 0,0 is fine. |
| `size.fixed` | Fixed size without a variable | Set the layer to Hug or Fill, or bind its width or height to a size variable. |
| `text.fixed` | Text with a fixed width | Set the text to Hug (auto width) or Fill its container. |
| `instance.boolean` | Boolean property away from its default | Wave's catalogue draws a component's variants, so an instance that shows or hides a layer with a boolean has a shape none of them is. Make the property a variant property and draw the variant. |
| `instance.resized` | Instance at another size than its component | Keep the instance at its component's size (Hug where the component hugs). For another size, give the component a variant or a size variable for it. |
| `set.layout` | Component set without auto layout | Give the component set auto layout with gap and padding bound to spacing variables. It becomes the specimen page's canvas. |
| `instance.detached` | Detached instance | A frame carries a component's name but is not an instance. Replace it with an instance of the component. |
| `instance.remote` | Component from another library | Wave's catalogue is this file's design-system page. Bring the component into it, or use the local one. |
| `instance.override` | Instance restyled | The instance overrides how the component looks. Make the look a variant of the component and use that variant; only text, visibility, swaps and component properties may change per instance. |
| `component.description` | Component without a description | Write what the component is for in its description. It becomes the catalogue entry. |

## Advice

| Rule | What | Fix in Figma |
| --- | --- | --- |
| `color.gradient` | Gradient | Gradients cannot be tokens yet; they are copied as drawn. Use a solid colour variable if the gradient is not essential. |
| `text.mixed` | Mixed text styles in one layer | Split the layer, or check that each run uses a text style; mixed runs become spans. |
| `instance.outside` | Component outside the design-system page | Move the main component to the design-system page so it becomes a catalogue specimen. |
| `instance.recolor` | Instance recoloured with variables | Fine for an icon taking its parent's colour. If the colour is a state of the component, make it a variant instead. |
| `geometry.subpixel` | Fractional position or size | Snap to whole pixels. Browsers round fractions differently from Figma, which shows as a pixel difference. |
| `layer.hidden` | Hidden layer | Hidden layers are dropped. Delete it, or make the hidden look a variant. |
| `layer.name` | Default layer name | Name the layer for what it is; names become element names and help the semantic pass. |
| `proto.unlinked` | Button without a prototype link | Add a prototype interaction so the prototype knows where it goes. |
