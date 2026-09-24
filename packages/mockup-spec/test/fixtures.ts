export const ADDRESS = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Add address</title>
    <meta name="pi:spec" content="1">
    <meta name="pi:screen" content="checkout-address">
    <meta name="pi:flow" content="checkout">
    <meta name="pi:route" content="/checkout/address/:orderId">
    <meta name="pi:title" content="Add delivery address">
    <meta name="pi:tokens" content="tokens">
    <script type="application/pi+json" id="pi-resources">
      { "user/firstName": { "type": "string", "source": "auth profile", "description": "Given name" } }
    </script>
    <style>
      :root { --color-brand-500: #2255ff; }
      .btn { background: var(--color-brand-500); padding: 12px 16px; color: #ffffff; }
      .note { color: #ff00aa; margin: 7px; }
    </style>
  </head>
  <body>
    <main data-pi-id="n_main01" data-pi-slug="page">
      <h1 data-pi-id="n_head01" data-pi-slug="greeting">Hello Asim, add an address</h1>
      <form data-pi-id="n_form01" data-pi-slug="address-form" data-pi-role="form">
        <input data-pi-id="n_post01" data-pi-slug="postcode" data-pi-field="address/postcode" data-pi-validate="required; max:8" data-pi-states="default error" placeholder="Postcode">
        <p data-pi-id="n_err001" data-pi-slug="postcode-error" data-pi-state-of="n_post01" data-pi-state="error">Enter a valid postcode</p>
        <input data-pi-id="n_city01" data-pi-slug="city" placeholder="City">
        <button class="btn" data-pi-id="n_save01" data-pi-slug="save" data-pi-component="Button" data-pi-variant="primary" data-pi-action="action/checkout/add-address" data-pi-trigger="submit" data-pi-effect="api/address/create" data-pi-to="screen:checkout-review" data-pi-to-failure="node:checkout-address/postcode-error" data-pi-states="default loading disabled">Save address</button>
      </form>
      <ul data-pi-id="n_list01" data-pi-slug="saved" data-pi-repeat="addresses[]">
        <li data-pi-id="n_item01" data-pi-slug="saved-item" data-pi-item data-pi-content="dynamic" data-pi-bind="addresses[]/line1">1 High St</li>
      </ul>
      <p class="note" data-pi-id="n_note01" data-pi-content="dynamic">Delivery by Friday</p>
      <a href="#" data-pi-id="n_help01" data-pi-slug="help" data-pi-to="screen:nowhere">Help</a>
      <button>Cancel</button>
      <span data-pi-bogus="x" data-pi-slug="orphan-attr">x</span>
    </main>
  </body>
</html>
`;

export const REVIEW = `<!doctype html>
<html><head>
<meta name="pi:spec" content="1">
<meta name="pi:screen" content="checkout-review">
<meta name="pi:route" content="/checkout/review">
<title>Review</title>
</head><body>
<section data-pi-id="n_rev001" data-pi-slug="summary">
  <p data-pi-id="n_rev002" data-pi-slug="total" data-pi-content="dynamic" data-pi-bind="order/total" data-pi-format="currency:GBP">&pound;12.00</p>
  <button data-pi-id="n_rev003" data-pi-slug="back" data-pi-action="action/checkout/edit" data-pi-to="screen:checkout-address" data-pi-states="default" data-pi-visible-if="order/editable &amp;&amp; user/isLoggedIn">Edit address</button>
  <p data-pi-id="n_rev004" data-pi-slug="total">dupe slug</p>
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
