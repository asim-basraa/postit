export const ADDRESS = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Add address</title>
    <meta name="wave:spec" content="1">
    <meta name="wave:screen" content="checkout-address">
    <meta name="wave:flow" content="checkout">
    <meta name="wave:route" content="/checkout/address/:orderId">
    <meta name="wave:title" content="Add delivery address">
    <meta name="wave:tokens" content="tokens">
    <script type="application/wave+json" id="wave-resources">
      { "user/firstName": { "type": "string", "source": "auth profile", "description": "Given name" } }
    </script>
    <style>
      :root { --color-brand-500: #2255ff; }
      .btn { background: var(--color-brand-500); padding: 12px 16px; color: #ffffff; }
      .note { color: #ff00aa; margin: 7px; }
    </style>
  </head>
  <body>
    <main data-wave-id="n_main01" data-wave-slug="page">
      <h1 data-wave-id="n_head01" data-wave-slug="greeting">Hello Asim, add an address</h1>
      <form data-wave-id="n_form01" data-wave-slug="address-form" data-wave-role="form">
        <input data-wave-id="n_post01" data-wave-slug="postcode" data-wave-field="address/postcode" data-wave-validate="required; max:8" data-wave-states="default error" placeholder="Postcode">
        <p data-wave-id="n_err001" data-wave-slug="postcode-error" data-wave-state-of="n_post01" data-wave-state="error">Enter a valid postcode</p>
        <input data-wave-id="n_city01" data-wave-slug="city" placeholder="City">
        <button class="btn" data-wave-id="n_save01" data-wave-slug="save" data-wave-component="Button" data-wave-variant="primary" data-wave-action="action/checkout/add-address" data-wave-trigger="submit" data-wave-effect="api/address/create" data-wave-to="screen:checkout-review" data-wave-to-failure="node:checkout-address/postcode-error" data-wave-states="default loading disabled">Save address</button>
      </form>
      <ul data-wave-id="n_list01" data-wave-slug="saved" data-wave-repeat="addresses[]">
        <li data-wave-id="n_item01" data-wave-slug="saved-item" data-wave-item data-wave-content="dynamic" data-wave-bind="addresses[]/line1">1 High St</li>
      </ul>
      <p class="note" data-wave-id="n_note01" data-wave-content="dynamic">Delivery by Friday</p>
      <a href="#" data-wave-id="n_help01" data-wave-slug="help" data-wave-to="screen:nowhere">Help</a>
      <button>Cancel</button>
      <span data-wave-bogus="x" data-wave-slug="orphan-attr">x</span>
    </main>
  </body>
</html>
`;

export const REVIEW = `<!doctype html>
<html><head>
<meta name="wave:spec" content="1">
<meta name="wave:screen" content="checkout-review">
<meta name="wave:route" content="/checkout/review">
<title>Review</title>
</head><body>
<section data-wave-id="n_rev001" data-wave-slug="summary">
  <p data-wave-id="n_rev002" data-wave-slug="total" data-wave-content="dynamic" data-wave-bind="order/total" data-wave-format="currency:GBP">&pound;12.00</p>
  <button data-wave-id="n_rev003" data-wave-slug="back" data-wave-action="action/checkout/edit" data-wave-to="screen:checkout-address" data-wave-states="default" data-wave-visible-if="order/editable &amp;&amp; user/isLoggedIn">Edit address</button>
  <p data-wave-id="n_rev004" data-wave-slug="total">dupe slug</p>
</section>
</body></html>
`;

export const TOKENS = JSON.stringify({
  color: {
    $type: "color",
    brand: { "500": { $value: "#2255ff" } },
    text: { $value: "{color.white}" },
    white: { $value: "#ffffff" },
  },
  space: {
    $type: "dimension",
    "3": { $value: "12px" },
    "4": { $value: { value: 1, unit: "rem" } },
  },
});
