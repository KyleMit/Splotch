# Chromium results

Candidate b236d639160459eecd60900926c759af5d4ae080. Browser 153.0.8010.12. PASS applies only to the
assertions stated. BLOCKED includes harness failures pending triage, not a product defect.

* 2026-10-21T02:18:00.029Z — phone D01: **PASS**. {"separate":3,"joined":1,"input":"trusted CDP
  touch"} Evidence: [screenshot](../evidence/chromium-phone-D01-1792549083526.png),
  [tree](../evidence/chromium-phone-D01-1792549083526.aria.txt).

* 2026-10-21T02:18:03.759Z — tablet D01: **PASS**. {"separate":3,"joined":1,"input":"trusted CDP
  touch"} Evidence: [screenshot](../evidence/chromium-tablet-D01-1792549087026.png),
  [tree](../evidence/chromium-tablet-D01-1792549087026.aria.txt).

* 2026-10-21T02:18:07.258Z — desktop D01: **PASS**. {"separate":3,"joined":1,"input":"trusted
  mouse"} Evidence: [screenshot](../evidence/chromium-desktop-D01-1792549090714.png),
  [tree](../evidence/chromium-desktop-D01-1792549090714.aria.txt).

* 2026-10-21T02:19:13.966Z — phone D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"1138f877d18a10d9b5efab48bd852135f62d88fc7d8f07e5862c6c6b208f6c2b\"\nReceived:
  \"9e6d83de94eae6c1496657054eb05081f8de2bc083dca9e9c02ab370d0121ab9\""} Evidence:
  [screenshot](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792549155770.png),
  [tree](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792549155770.aria.txt).

* 2026-10-21T02:19:15.822Z — phone D08-palette: **BLOCKED**. {"error":"expect(locator).toBeEnabled()
  failed\n\nLocator: getByRole('button', { name: 'Undo', exact: true })\nExpected:
  enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect \"toBeEnabled\"
  getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting for
  getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-D08-palette-1792549162950.png),
  [tree](../evidence/chromium-phone-D08-palette-1792549162950.aria.txt).

* 2026-10-21T02:19:22.983Z — phone D09-custom-color: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: '#E63946', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" aria-label=\"#E63946\"
  class=\"x1y0btm7 x1ghz6dp x10l6tqk x1717udv xc342km xjbqb8w x47corl xgq9j65 xjbys53 x5lhr3w
  x16ye13r\">…</button>\u001b[22m\n\u001b[2m - attempting click action\u001b[22m\n\u001b[2m 2 ×
  waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m - element is not
  stable\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is not stable\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 100ms\u001b[22m\n\u001b[2m - waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is not stable\u001b[22m\n\u001b[2m 12 ×
  retrying click action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n\u001b[2m - waiting for
  element to be visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div data-testid=\"color-picker-grid\" class=\"css-g5y9jx
  r-1d2f490 r-u8s1d r-ipm5af\">…</div> intercepts pointer events\u001b[22m\n\u001b[2m - retrying
  click action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-phone-D09-custom-color-1792549170030.png),
  [tree](../evidence/chromium-phone-D09-custom-color-1792549170030.aria.txt).

* 2026-10-21T02:19:30.053Z — phone D10-widths: **BLOCKED**. {"error":"locator.click: Timeout 7000ms
  exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Brushes', exact: true
  })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" role=\"button\"
  aria-label=\"Brushes\" aria-expanded=\"false\" aria-disabled=\"false\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u x92kamu xirhfam
  x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr x3oybdh x1jplu5e
  x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree interc"} Evidence:
  [screenshot](../evidence/chromium-phone-D10-widths-1792549177058.png),
  [tree](../evidence/chromium-phone-D10-widths-1792549177058.aria.txt).

* 2026-10-21T02:19:37.096Z — phone D11-deep-history: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Brushes', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" role=\"button\"
  aria-label=\"Brushes\" aria-expanded=\"false\" aria-disabled=\"false\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u x92kamu xirhfam
  x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr x3oybdh x1jplu5e
  x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree interc"} Evidence:
  [screenshot](../evidence/chromium-phone-D11-deep-history-1792549184101.png),
  [tree](../evidence/chromium-phone-D11-deep-history-1792549184101.aria.txt).

* 2026-10-21T02:19:44.134Z — phone P01-P02-download: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 4 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n 10 × locator resolved to <button type=\"button\" role=\"button\"
  tabindex=\"-1\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619 x78zum5 x6s0dn4
  xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0
  xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected value
  \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-P01-P02-download-1792549189604.png),
  [tree](../evidence/chromium-phone-P01-P02-download-1792549189604.aria.txt).

* 2026-10-21T02:19:49.824Z — tablet D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"867f2259514df91d424028665da172ae69cbe597f8086119ad9b50501dd84ed8\"\nReceived:
  \"cb1407f7c33bcb5d2d0a4f1b80a69369760040bc1130824c26afc04bd87d4901\""} Evidence:
  [screenshot](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792549191834.png),
  [tree](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792549191834.aria.txt).

* 2026-10-21T02:19:51.899Z — tablet D08-palette: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-D08-palette-1792549199018.png),
  [tree](../evidence/chromium-tablet-D08-palette-1792549199018.aria.txt).

* 2026-10-21T02:19:59.078Z — tablet D09-custom-color: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: '#E63946', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" aria-label=\"#E63946\"
  class=\"x1y0btm7 x1ghz6dp x10l6tqk x1717udv xc342km xjbqb8w x47corl xgq9j65 xjbys53 x5lhr3w
  x16ye13r\">…</button>\u001b[22m\n\u001b[2m - attempting click action\u001b[22m\n\u001b[2m 2 ×
  waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m - element is not
  stable\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is not stable\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 100ms\u001b[22m\n\u001b[2m - waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is not stable\u001b[22m\n\u001b[2m 12 ×
  retrying click action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n\u001b[2m - waiting for
  element to be visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div data-testid=\"color-picker-grid\" class=\"css-g5y9jx
  r-1d2f490 r-u8s1d r-ipm5af\">…</div> intercepts pointer events\u001b[22m\n\u001b[2m - retrying
  click action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-D09-custom-color-1792549206129.png),
  [tree](../evidence/chromium-tablet-D09-custom-color-1792549206129.aria.txt).

* 2026-10-21T02:20:06.175Z — tablet D10-widths: **BLOCKED**. {"error":"locator.click: Timeout 7000ms
  exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Brushes', exact: true
  })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" role=\"button\"
  aria-label=\"Brushes\" aria-expanded=\"false\" aria-disabled=\"false\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u x92kamu xirhfam
  x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr x3oybdh x1jplu5e
  x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree interc"} Evidence:
  [screenshot](../evidence/chromium-tablet-D10-widths-1792549213178.png),
  [tree](../evidence/chromium-tablet-D10-widths-1792549213178.aria.txt).

* 2026-10-21T02:20:13.222Z — tablet D11-deep-history: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Brushes', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" role=\"button\"
  aria-label=\"Brushes\" aria-expanded=\"false\" aria-disabled=\"false\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u x92kamu xirhfam
  x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr x3oybdh x1jplu5e
  x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree interc"} Evidence:
  [screenshot](../evidence/chromium-tablet-D11-deep-history-1792549220225.png),
  [tree](../evidence/chromium-tablet-D11-deep-history-1792549220225.aria.txt).

* 2026-10-21T02:20:20.279Z — tablet P01-P02-download: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 4 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n 10 × locator resolved to <button type=\"button\" role=\"button\"
  tabindex=\"-1\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619 x78zum5 x6s0dn4
  xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0
  xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected value
  \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-P01-P02-download-1792549225733.png),
  [tree](../evidence/chromium-tablet-P01-P02-download-1792549225733.aria.txt).

* 2026-10-21T02:20:25.972Z — desktop D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"a6f82b587382fffea1d4cc940be9c62680c2afd149bade260e075ced9a898bf9\"\nReceived:
  \"3d9c3678b21ee45e593da0bcb965797ed4e2f5025df0076ce8dac210c53dd002\""} Evidence:
  [screenshot](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792549227964.png),
  [tree](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792549227964.aria.txt).

* 2026-10-21T02:20:28.031Z — desktop D08-palette: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-D08-palette-1792549235128.png),
  [tree](../evidence/chromium-desktop-D08-palette-1792549235128.aria.txt).

* 2026-10-21T02:20:35.188Z — desktop D09-custom-color: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: '#E63946', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" aria-label=\"#E63946\"
  class=\"x1y0btm7 x1ghz6dp x10l6tqk x1717udv xc342km xjbqb8w x47corl xgq9j65 xjbys53 x5lhr3w
  x16ye13r\">…</button>\u001b[22m\n\u001b[2m - attempting click action\u001b[22m\n\u001b[2m 2 ×
  waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m - element is not
  stable\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is not stable\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 100ms\u001b[22m\n\u001b[2m - waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is not stable\u001b[22m\n\u001b[2m 12 ×
  retrying click action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n\u001b[2m - waiting for
  element to be visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div data-testid=\"color-picker-grid\" class=\"css-g5y9jx
  r-1d2f490 r-u8s1d r-ipm5af\">…</div> intercepts pointer events\u001b[22m\n\u001b[2m - retrying
  click action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-D09-custom-color-1792549242246.png),
  [tree](../evidence/chromium-desktop-D09-custom-color-1792549242246.aria.txt).

* 2026-10-21T02:20:42.302Z — desktop D10-widths: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Brushes', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" role=\"button\"
  aria-label=\"Brushes\" aria-expanded=\"false\" aria-disabled=\"false\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u x92kamu xirhfam
  x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr x3oybdh x1jplu5e
  x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree interc"} Evidence:
  [screenshot](../evidence/chromium-desktop-D10-widths-1792549249306.png),
  [tree](../evidence/chromium-desktop-D10-widths-1792549249306.aria.txt).

* 2026-10-21T02:20:49.364Z — desktop D11-deep-history: **BLOCKED**. {"error":"locator.click: Timeout
  7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Brushes', exact:
  true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\" role=\"button\"
  aria-label=\"Brushes\" aria-expanded=\"false\" aria-disabled=\"false\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u x92kamu xirhfam
  x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr x3oybdh x1jplu5e
  x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree interc"} Evidence:
  [screenshot](../evidence/chromium-desktop-D11-deep-history-1792549256366.png),
  [tree](../evidence/chromium-desktop-D11-deep-history-1792549256366.aria.txt).

* 2026-10-21T02:20:56.420Z — desktop P01-P02-download: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 4 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n 10 × locator resolved to <button type=\"button\" role=\"button\"
  tabindex=\"-1\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619 x78zum5 x6s0dn4
  xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0
  xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected value
  \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-P01-P02-download-1792549261845.png),
  [tree](../evidence/chromium-desktop-P01-P02-download-1792549261845.aria.txt).

* 2026-10-21T02:21:06.309Z — phone D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"2fd52c65b90c66e835e7311f191ebe01a312989c3d81898125faf0ffea9122fe\"\nReceived:
  \"58c83e496007f2cecc8056f3fd496737ff0bf271cfc55a1d9b4980b3d13897c7\""} Evidence:
  [screenshot](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792549292771.png),
  [tree](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792549292771.aria.txt).

* 2026-10-21T02:21:32.813Z — phone D08-palette: **BLOCKED**. {"error":"expect(locator).toBeEnabled()
  failed\n\nLocator: getByRole('button', { name: 'Undo', exact: true })\nExpected:
  enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect \"toBeEnabled\"
  getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting for
  getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-D08-palette-1792549301441.png),
  [tree](../evidence/chromium-phone-D08-palette-1792549301441.aria.txt).

* 2026-10-21T02:21:41.480Z — phone D09-custom-color: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator: getByRole('dialog', { name:
  'Color Picker' })\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toHaveCount\" getByRole('dialog', { name: 'Color Picker' }) with timeout 5000ms\n - waiting for
  getByRole('dialog', { name: 'Color Picker' })\n 14 × locator resolved to 1 element\n - unexpected
  value \"1\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-D09-custom-color-1792549306620.png),
  [tree](../evidence/chromium-phone-D09-custom-color-1792549306620.aria.txt).

* 2026-10-21T02:21:46.653Z — phone D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/chromium-phone-D10-widths-1792549318013.png),
  [tree](../evidence/chromium-phone-D10-widths-1792549318013.aria.txt).

* 2026-10-21T02:21:58.063Z — phone D11-deep-history: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 25\nReceived: 20"}
  Evidence: [screenshot](../evidence/chromium-phone-D11-deep-history-1792549326474.png),
  [tree](../evidence/chromium-phone-D11-deep-history-1792549326474.aria.txt).

* 2026-10-21T02:22:06.530Z — phone P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-22-07.png","format":"png","width":780,"height":1538,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/chromium-phone-P01-P02-download-1792549327500.png),
  [tree](../evidence/chromium-phone-P01-P02-download-1792549327500.aria.txt).

* 2026-10-21T02:22:07.762Z — tablet D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"4f538a06c56307b5ec1e861e4340191940ea9a2fc4eefebe0ae746889f3d03e4\"\nReceived:
  \"d9b779896103b739c9ccbcfe59b7341dbe212e719865a704e05865422da91f84\""} Evidence:
  [screenshot](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792549354732.png),
  [tree](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792549354732.aria.txt).

* 2026-10-21T02:22:34.815Z — tablet D08-palette: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-D08-palette-1792549363596.png),
  [tree](../evidence/chromium-tablet-D08-palette-1792549363596.aria.txt).

* 2026-10-21T02:22:43.646Z — tablet D09-custom-color: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator: getByRole('dialog', { name:
  'Color Picker' })\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toHaveCount\" getByRole('dialog', { name: 'Color Picker' }) with timeout 5000ms\n - waiting for
  getByRole('dialog', { name: 'Color Picker' })\n 14 × locator resolved to 1 element\n - unexpected
  value \"1\"\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-D09-custom-color-1792549368785.png),
  [tree](../evidence/chromium-tablet-D09-custom-color-1792549368785.aria.txt).

* 2026-10-21T02:22:48.829Z — tablet D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/chromium-tablet-D10-widths-1792549380275.png),
  [tree](../evidence/chromium-tablet-D10-widths-1792549380275.aria.txt).

* 2026-10-21T02:23:00.345Z — tablet D11-deep-history: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 25\nReceived: 20"}
  Evidence: [screenshot](../evidence/chromium-tablet-D11-deep-history-1792549388205.png),
  [tree](../evidence/chromium-tablet-D11-deep-history-1792549388205.aria.txt).

* 2026-10-21T02:23:08.273Z — tablet P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-23-09.png","format":"png","width":1640,"height":2210,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/chromium-tablet-P01-P02-download-1792549389297.png),
  [tree](../evidence/chromium-tablet-P01-P02-download-1792549389297.aria.txt).

* 2026-10-21T02:23:09.649Z — desktop D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"920d01795dbf5f4163748914872d257231671117d60984179f4d4cac51a724d6\"\nReceived:
  \"413c6f79e6b3ddfa7ee7276bc9ca5c461aba04d31173b644dbe87955b014846b\""} Evidence:
  [screenshot](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792549415939.png),
  [tree](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792549415939.aria.txt).

* 2026-10-21T02:23:36.000Z — desktop D08-palette: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-D08-palette-1792549424568.png),
  [tree](../evidence/chromium-desktop-D08-palette-1792549424568.aria.txt).

* 2026-10-21T02:23:44.636Z — desktop D09-custom-color: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-D09-custom-color-1792549432920.png),
  [tree](../evidence/chromium-desktop-D09-custom-color-1792549432920.aria.txt).

* 2026-10-21T02:23:52.971Z — desktop D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/chromium-desktop-D10-widths-1792549446344.png),
  [tree](../evidence/chromium-desktop-D10-widths-1792549446344.aria.txt).

* 2026-10-21T02:24:06.406Z — desktop D11-deep-history: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 25\nReceived: 20"}
  Evidence: [screenshot](../evidence/chromium-desktop-D11-deep-history-1792549453782.png),
  [tree](../evidence/chromium-desktop-D11-deep-history-1792549453782.aria.txt).

* 2026-10-21T02:24:13.843Z — desktop P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-24-14.png","format":"png","width":2392,"height":1600,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/chromium-desktop-P01-P02-download-1792549454785.png),
  [tree](../evidence/chromium-desktop-P01-P02-download-1792549454785.aria.txt).

* 2026-10-21T02:25:20.384Z — phone D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"2fd52c65b90c66e835e7311f191ebe01a312989c3d81898125faf0ffea9122fe\"\nReceived:
  \"58c83e496007f2cecc8056f3fd496737ff0bf271cfc55a1d9b4980b3d13897c7\""} Evidence:
  [screenshot](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792549551787.png),
  [tree](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792549551787.aria.txt).

* 2026-10-21T02:25:51.824Z — phone D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/chromium-phone-D08-palette-1792549570337.png),
  [tree](../evidence/chromium-phone-D08-palette-1792549570337.aria.txt).

* 2026-10-21T02:26:10.381Z — phone D09-custom-color: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator: getByRole('dialog', { name:
  'Color Picker' })\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toHaveCount\" getByRole('dialog', { name: 'Color Picker' }) with timeout 5000ms\n - waiting for
  getByRole('dialog', { name: 'Color Picker' })\n 14 × locator resolved to 1 element\n - unexpected
  value \"1\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-D09-custom-color-1792549575520.png),
  [tree](../evidence/chromium-phone-D09-custom-color-1792549575520.aria.txt).

* 2026-10-21T02:26:15.544Z — phone D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/chromium-phone-D10-widths-1792549586885.png),
  [tree](../evidence/chromium-phone-D10-widths-1792549586885.aria.txt).

* 2026-10-21T02:26:26.933Z — phone D11-deep-history: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 25\nReceived: 20"}
  Evidence: [screenshot](../evidence/chromium-phone-D11-deep-history-1792549626674.png),
  [tree](../evidence/chromium-phone-D11-deep-history-1792549626674.aria.txt).

* 2026-10-21T02:27:06.706Z — phone P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-27-08.png","format":"png","width":780,"height":1538,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/chromium-phone-P01-P02-download-1792549628554.png),
  [tree](../evidence/chromium-phone-P01-P02-download-1792549628554.aria.txt).

* 2026-10-21T02:27:08.832Z — tablet D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"4f538a06c56307b5ec1e861e4340191940ea9a2fc4eefebe0ae746889f3d03e4\"\nReceived:
  \"d9b779896103b739c9ccbcfe59b7341dbe212e719865a704e05865422da91f84\""} Evidence:
  [screenshot](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792549660173.png),
  [tree](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792549660173.aria.txt).

* 2026-10-21T02:27:40.239Z — tablet D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/chromium-tablet-D08-palette-1792549678884.png),
  [tree](../evidence/chromium-tablet-D08-palette-1792549678884.aria.txt).

* 2026-10-21T02:27:58.933Z — tablet D09-custom-color: **BLOCKED**.
  {"error":"expect(locator).toHaveCount(expected) failed\n\nLocator: getByRole('dialog', { name:
  'Color Picker' })\nExpected: 0\nReceived: 1\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toHaveCount\" getByRole('dialog', { name: 'Color Picker' }) with timeout 5000ms\n - waiting for
  getByRole('dialog', { name: 'Color Picker' })\n 14 × locator resolved to 1 element\n - unexpected
  value \"1\"\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-D09-custom-color-1792549684089.png),
  [tree](../evidence/chromium-tablet-D09-custom-color-1792549684089.aria.txt).

* 2026-10-21T02:28:04.140Z — tablet D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/chromium-tablet-D10-widths-1792549694991.png),
  [tree](../evidence/chromium-tablet-D10-widths-1792549694991.aria.txt).

* 2026-10-21T02:28:15.050Z — tablet D11-deep-history: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 25\nReceived: 20"}
  Evidence: [screenshot](../evidence/chromium-tablet-D11-deep-history-1792549734659.png),
  [tree](../evidence/chromium-tablet-D11-deep-history-1792549734659.aria.txt).

* 2026-10-21T02:28:54.713Z — tablet P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-28-56.png","format":"png","width":1640,"height":2210,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/chromium-tablet-P01-P02-download-1792549736613.png),
  [tree](../evidence/chromium-tablet-P01-P02-download-1792549736613.aria.txt).

* 2026-10-21T02:28:56.958Z — desktop D02-D05-brush-ink-undo: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"920d01795dbf5f4163748914872d257231671117d60984179f4d4cac51a724d6\"\nReceived:
  \"413c6f79e6b3ddfa7ee7276bc9ca5c461aba04d31173b644dbe87955b014846b\""} Evidence:
  [screenshot](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792549768067.png),
  [tree](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792549768067.aria.txt).

* 2026-10-21T02:29:28.130Z — desktop D08-palette: **PASS**.
  {"distinctRenderedColors":5,"limits":"Color difference established; exact token RGB not
  asserted."} Evidence: [screenshot](../evidence/chromium-desktop-D08-palette-1792549786659.png),
  [tree](../evidence/chromium-desktop-D08-palette-1792549786659.aria.txt).

* 2026-10-21T02:29:46.708Z — desktop D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/chromium-desktop-D09-custom-color-1792549794544.png),
  [tree](../evidence/chromium-desktop-D09-custom-color-1792549794544.aria.txt).

* 2026-10-21T02:29:54.595Z — desktop D10-widths: **PASS**.
  {"selected":["Pen:1","Pen:2","Pen:3","Pen:4","Pen:5","Eraser:1","Eraser:2","Eraser:3","Eraser:4","Eraser:5"],"limits":"Selection
  states only; actual pixel width and brush-specific persistence remain separate."} Evidence:
  [screenshot](../evidence/chromium-desktop-D10-widths-1792549808023.png),
  [tree](../evidence/chromium-desktop-D10-widths-1792549808023.aria.txt).

* 2026-10-21T02:30:08.084Z — desktop D11-deep-history: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 25\nReceived: 20"}
  Evidence: [screenshot](../evidence/chromium-desktop-D11-deep-history-1792549846911.png),
  [tree](../evidence/chromium-desktop-D11-deep-history-1792549846911.aria.txt).

* 2026-10-21T02:30:46.959Z — desktop P01-P02-download: **PASS**.
  {"download":"splotch-2026-10-20_22-30-48.png","format":"png","width":2392,"height":1600,"limits":"One
  save of blank-background ink; no Farm composite or repeated cooldown yet."} Evidence:
  [screenshot](../evidence/chromium-desktop-P01-P02-download-1792549848799.png),
  [tree](../evidence/chromium-desktop-P01-P02-download-1792549848799.aria.txt).

* 2026-10-21T02:30:59.311Z — phone S01-section-entry: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: locator('[aria-label^=\"What is
  \"]').visible()\nExpected: visible\nTimeout: 5000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" locator('[aria-label^=\"What is \"]').visible() with timeout 5000ms\n -
  waiting for locator('[aria-label^=\"What is \"]').visible()\n"} Evidence:
  [screenshot](../evidence/chromium-phone-S01-section-entry-1792549889472.png),
  [tree](../evidence/chromium-phone-S01-section-entry-1792549889472.aria.txt).

* 2026-10-21T02:31:29.702Z — phone S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/chromium-phone-S02-appearance-persist-1792549895762.png),
  [tree](../evidence/chromium-phone-S02-appearance-persist-1792549895762.aria.txt).

* 2026-10-21T02:31:35.992Z — phone X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"Appearance, Night Mode · portrait
  lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true},{"tag":"BUTTON","label":"AI Art, Turned
  off","inDialog":true},{"tag":"BUTTON","label":"Saving, Auto-save
  off","inDialog":true},{"tag":"BUTTON","label":"Parent Center, Choose when grown-up checks
  appear","inDialog":true},{"tag":"BUTTON","label":"Install, Install & lock the
  app","inDialog":true},{"tag":"BUTTON","label":"Feedback, Report a bug or share an
  idea","inDialog":true},{"tag":"BUTTON","label":"What's New, See what's
  changed","inDialog":true},{"tag":"BUTTON","label":"About, Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"Appearance,
  Night Mode · portrait lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true},{"tag":"BUTTON","label":"AI Art, Turned
  off","inDialog":true},{"tag":"BUTTON","label":"Saving, Auto-save
  off","inDialog":true}],"focusRestored":true} Evidence:
  [screenshot](../evidence/chromium-phone-X04-W07-settings-focus-1792549897810.png),
  [tree](../evidence/chromium-phone-X04-W07-settings-focus-1792549897810.aria.txt).

* 2026-10-21T02:31:38.027Z — phone X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/chromium-phone-X06-undo-shortcut-1792549907351.png),
  [tree](../evidence/chromium-phone-X06-undo-shortcut-1792549907351.aria.txt).

* 2026-10-21T02:31:47.572Z — phone L02-viewport-rotation: **PASS**.
  {"original":{"width":390,"height":844},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/chromium-phone-L02-viewport-rotation-1792549912483.png),
  [tree](../evidence/chromium-phone-L02-viewport-rotation-1792549912483.aria.txt).

* 2026-10-21T02:32:00.001Z — phone S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/chromium-phone-S01-section-entry-1792549948633.png),
  [tree](../evidence/chromium-phone-S01-section-entry-1792549948633.aria.txt).

* 2026-10-21T02:32:29.863Z — tablet S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/chromium-tablet-S01-section-entry-1792549980427.png),
  [tree](../evidence/chromium-tablet-S01-section-entry-1792549980427.aria.txt).

* 2026-10-21T02:33:00.714Z — tablet S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/chromium-tablet-S02-appearance-persist-1792549987066.png),
  [tree](../evidence/chromium-tablet-S02-appearance-persist-1792549987066.aria.txt).

* 2026-10-21T02:33:07.305Z — tablet X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"Appearance","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer","inDialog":true},{"tag":"BUTTON","label":"Accessibility","inDialog":true},{"tag":"BUTTON","label":"Coloring","inDialog":true},{"tag":"BUTTON","label":"AI
  Art","inDialog":true},{"tag":"BUTTON","label":"Saving","inDialog":true},{"tag":"BUTTON","label":"Parent
  Center","inDialog":true},{"tag":"BUTTON","label":"Install","inDialog":true},{"tag":"BUTTON","label":"Feedback","inDialog":true},{"tag":"BUTTON","label":"What's
  New","inDialog":true},{"tag":"BUTTON","label":"About","inDialog":true},{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"BUTTON","label":"Drawing","inDialog":true},{"tag":"BUTTON","label":"Deleting","inDialog":true},{"tag":"BUTTON","label":"Enable
  tool
  drawer","inDialog":true},{"tag":"BUTTON","label":"Crayon","inDialog":true},{"tag":"BUTTON","label":"Magic
  brush","inDialog":true},{"tag":"BUTTON","label":"Eraser","inDialog":true},{"tag":"BUTTON","label":"Stroke
  width","inDialog":true},{"tag":"BUTTON","label":"Undo","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/chromium-tablet-X04-W07-settings-focus-1792549988998.png),
  [tree](../evidence/chromium-tablet-X04-W07-settings-focus-1792549988998.aria.txt).

* 2026-10-21T02:33:09.226Z — tablet X06-undo-shortcut: **BLOCKED**. {"error":"locator.isEnabled:
  Error: strict mode violation: getByRole('button', { name: 'Undo', exact: true }) resolved to 2
  elements:\n 1) <button type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"false\"
  class=\"x1ghz6dp x9f619 x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u
  x92kamu xirhfam x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr
  x3oybdh x1jplu5e x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button> aka
  getByTestId('rsd-unavailable-cue').getByRole('button', { name: 'Undo' })\n 2) <button disabled
  type=\"button\" id=\"undoToggle\" aria-label=\"Undo\" aria-pressed=\"true\" aria-disabled=\"true\"
  class=\"x1y0btm7 x1717udv x9f619 x78zum5 x1q0g3np x1iyjqo2 x6s0dn4 xvphaqr xx4cn4f x1ghz6dp
  xc342km xk119u2 xmszf7l x883omv xrii95j xaope02 xj8ol9t xfr7ubi xs2xxs2 x12nm00m xwji4o3 x1w9ctul
  xwvk54i x1jbvchh x1ypvzg5 x1cx3zai x1h6gzvc\">…</button> aka
  getByTestId('tool-drawer-tools').getByRole('button', { name: 'Undo' })\n\nCall log:\n\u001b[2m -
  waiting for getByRole('button', { name: 'Undo', exact: true })\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-X06-undo-shortcut-1792549996924.png),
  [tree](../evidence/chromium-tablet-X06-undo-shortcut-1792549996924.aria.txt).

* 2026-10-21T02:33:17.187Z — tablet L02-viewport-rotation: **PASS**.
  {"original":{"width":820,"height":1180},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/chromium-tablet-L02-viewport-rotation-1792550002364.png),
  [tree](../evidence/chromium-tablet-L02-viewport-rotation-1792550002364.aria.txt).

* 2026-10-21T02:33:22.593Z — desktop S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/chromium-desktop-S01-section-entry-1792550033353.png),
  [tree](../evidence/chromium-desktop-S01-section-entry-1792550033353.aria.txt).

* 2026-10-21T02:33:53.602Z — desktop S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/chromium-desktop-S02-appearance-persist-1792550039812.png),
  [tree](../evidence/chromium-desktop-S02-appearance-persist-1792550039812.aria.txt).

* 2026-10-21T02:34:00.047Z — desktop X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"Appearance","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer","inDialog":true},{"tag":"BUTTON","label":"Accessibility","inDialog":true},{"tag":"BUTTON","label":"Coloring","inDialog":true},{"tag":"BUTTON","label":"AI
  Art","inDialog":true},{"tag":"BUTTON","label":"Saving","inDialog":true},{"tag":"BUTTON","label":"Parent
  Center","inDialog":true},{"tag":"BUTTON","label":"Install","inDialog":true},{"tag":"BUTTON","label":"Feedback","inDialog":true},{"tag":"BUTTON","label":"What's
  New","inDialog":true},{"tag":"BUTTON","label":"About","inDialog":true},{"tag":"BUTTON","label":"System","inDialog":true},{"tag":"BUTTON","label":"Raised","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"DIV","label":"Volume","inDialog":true},{"tag":"BUTTON","label":"Drawing","inDialog":true},{"tag":"BUTTON","label":"Deleting","inDialog":true},{"tag":"BUTTON","label":"Enable
  tool
  drawer","inDialog":true},{"tag":"BUTTON","label":"Crayon","inDialog":true},{"tag":"BUTTON","label":"Magic
  brush","inDialog":true},{"tag":"BUTTON","label":"Eraser","inDialog":true},{"tag":"BUTTON","label":"Stroke
  width","inDialog":true},{"tag":"BUTTON","label":"Undo","inDialog":true}],"focusRestored":true}
  Evidence: [screenshot](../evidence/chromium-desktop-X04-W07-settings-focus-1792550041724.png),
  [tree](../evidence/chromium-desktop-X04-W07-settings-focus-1792550041724.aria.txt).

* 2026-10-21T02:34:01.962Z — desktop X06-undo-shortcut: **BLOCKED**. {"error":"locator.isEnabled:
  Error: strict mode violation: getByRole('button', { name: 'Undo', exact: true }) resolved to 2
  elements:\n 1) <button type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"false\"
  class=\"x1ghz6dp x9f619 x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1n2onr6 xdh2fpr xm94i8u
  x92kamu xirhfam x1vq7kzu x3qvh80 xvqu1re x1g7pt1a x1jhwrbr x1w5r55w xxjt6qd x1wb9pvh x1hc1fzr
  x3oybdh x1jplu5e x150r95f x3vay4l x7yrpt8 x5lhr3w x16ye13r x1fozly0\">…</button> aka
  getByTestId('rsd-unavailable-cue').getByRole('button', { name: 'Undo' })\n 2) <button disabled
  type=\"button\" id=\"undoToggle\" aria-label=\"Undo\" aria-pressed=\"true\" aria-disabled=\"true\"
  class=\"x1y0btm7 x1717udv x9f619 x78zum5 x1q0g3np x1iyjqo2 x6s0dn4 xvphaqr xx4cn4f x1ghz6dp
  xc342km xk119u2 xmszf7l x883omv xrii95j xaope02 xj8ol9t xfr7ubi xs2xxs2 x12nm00m xwji4o3 x1w9ctul
  xwvk54i x1jbvchh x1ypvzg5 x1cx3zai x1h6gzvc\">…</button> aka
  getByTestId('tool-drawer-tools').getByRole('button', { name: 'Undo' })\n\nCall log:\n\u001b[2m -
  waiting for getByRole('button', { name: 'Undo', exact: true })\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-X06-undo-shortcut-1792550049494.png),
  [tree](../evidence/chromium-desktop-X06-undo-shortcut-1792550049494.aria.txt).

* 2026-10-21T02:34:09.779Z — desktop L02-viewport-rotation: **PASS**.
  {"original":{"width":1280,"height":800},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/chromium-desktop-L02-viewport-rotation-1792550054825.png),
  [tree](../evidence/chromium-desktop-L02-viewport-rotation-1792550054825.aria.txt).

* 2026-10-21T02:34:15.050Z — narrow S01-section-entry: **PASS**.
  {"visited":["Appearance","Sound","Tool Drawer","Accessibility","Coloring","AI
  Art","Saving","Parent Center","Install"],"limits":"Entry, heading and Escape only; information
  content excluded."} Evidence:
  [screenshot](../evidence/chromium-narrow-S01-section-entry-1792550083511.png),
  [tree](../evidence/chromium-narrow-S01-section-entry-1792550083511.aria.txt).

* 2026-10-21T02:34:43.749Z — narrow S02-appearance-persist: **PASS**.
  {"darkPersisted":true,"flatPersisted":true} Evidence:
  [screenshot](../evidence/chromium-narrow-S02-appearance-persist-1792550089723.png),
  [tree](../evidence/chromium-narrow-S02-appearance-persist-1792550089723.aria.txt).

* 2026-10-21T02:34:49.936Z — narrow X04-W07-settings-focus: **PASS**.
  {"order":[{"tag":"BUTTON","label":"Appearance, Night Mode · portrait
  lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true},{"tag":"BUTTON","label":"AI Art, Turned
  off","inDialog":true},{"tag":"BUTTON","label":"Saving, Auto-save
  off","inDialog":true},{"tag":"BUTTON","label":"Parent Center, Choose when grown-up checks
  appear","inDialog":true},{"tag":"BUTTON","label":"Install, Install & lock the
  app","inDialog":true},{"tag":"BUTTON","label":"Feedback, Report a bug or share an
  idea","inDialog":true},{"tag":"BUTTON","label":"What's New, See what's
  changed","inDialog":true},{"tag":"BUTTON","label":"About, Version
  1.6.3973","inDialog":true},{"tag":"BUTTON","label":"Close","inDialog":true},{"tag":"BUTTON","label":"Appearance,
  Night Mode · portrait lock","inDialog":true},{"tag":"BUTTON","label":"Night
  Mode","inDialog":true},{"tag":"BUTTON","label":"Sound, Volume
  50%","inDialog":true},{"tag":"BUTTON","label":"Sound","inDialog":true},{"tag":"BUTTON","label":"Tool
  Drawer, Pen, crayon, magic brush & more","inDialog":true},{"tag":"BUTTON","label":"Accessibility,
  Make it easier to see and tap","inDialog":true},{"tag":"BUTTON","label":"Coloring, 0 extra books
  ready","inDialog":true},{"tag":"BUTTON","label":"AI Art, Turned
  off","inDialog":true},{"tag":"BUTTON","label":"Saving, Auto-save
  off","inDialog":true}],"focusRestored":true} Evidence:
  [screenshot](../evidence/chromium-narrow-X04-W07-settings-focus-1792550091723.png),
  [tree](../evidence/chromium-narrow-X04-W07-settings-focus-1792550091723.aria.txt).

* 2026-10-21T02:34:51.935Z — narrow X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/chromium-narrow-X06-undo-shortcut-1792550102313.png),
  [tree](../evidence/chromium-narrow-X06-undo-shortcut-1792550102313.aria.txt).

* 2026-10-21T02:35:02.530Z — narrow L02-viewport-rotation: **PASS**.
  {"original":{"width":320,"height":740},"returned":true,"undoRetained":true,"limits":"Viewport
  resize; browser chrome/orientation sensor not emulated."} Evidence:
  [screenshot](../evidence/chromium-narrow-L02-viewport-rotation-1792550107425.png),
  [tree](../evidence/chromium-narrow-L02-viewport-rotation-1792550107425.aria.txt).

* 2026-10-21T02:35:23.830Z — phone S03-volume-sources: **PASS**.
  {"min":0,"max":100,"arrowLeft":99,"drawingOff":true,"deletingOff":true,"masterOffPersisted":true,"limits":"Control/storage
  behavior only; audio not heard."} Evidence:
  [screenshot](../evidence/chromium-phone-S03-volume-sources-1792550129804.png),
  [tree](../evidence/chromium-phone-S03-volume-sources-1792550129804.aria.txt).

* 2026-10-21T02:35:30.013Z — phone S04-drawer-brush-disable: **PASS**.
  {"disabledSelectedEraser":true,"fellBackToPen":true,"drawerOffRemovedDrawingTools":true,"cameraAndColoringKept":true,"drawerRestored":true}
  Evidence: [screenshot](../evidence/chromium-phone-S04-drawer-brush-disable-1792550141798.png),
  [tree](../evidence/chromium-phone-S04-drawer-brush-disable-1792550141798.aria.txt).

* 2026-10-21T02:35:42.004Z — phone S05-accessibility-endpoints: **PASS**.
  {"min":"70","max":"130","reduceMotionOn":true,"drewAndUndidAtMax":true,"limits":"Reachability and
  state; complete visual/contrast review separate."} Evidence:
  [screenshot](../evidence/chromium-phone-S05-accessibility-endpoints-1792550149864.png),
  [tree](../evidence/chromium-phone-S05-accessibility-endpoints-1792550149864.aria.txt).

* 2026-10-21T02:35:50.075Z — phone S06-coloring-toggle: **PASS**.
  {"disabledHidPicker":true,"enabledRestoredPicker":true,"limits":"Download/remove/offline
  separate."} Evidence:
  [screenshot](../evidence/chromium-phone-S06-coloring-toggle-1792550156128.png),
  [tree](../evidence/chromium-phone-S06-coloring-toggle-1792550156128.aria.txt).

* 2026-10-21T02:35:56.334Z — phone S08-camera-autosave: **PASS**.
  {"cameraHidden":true,"cameraRestored":true,"limits":"Auto-save and failure fixture are separate."}
  Evidence: [screenshot](../evidence/chromium-phone-S08-camera-autosave-1792550162368.png),
  [tree](../evidence/chromium-phone-S08-camera-autosave-1792550162368.aria.txt).

* 2026-10-21T02:36:02.581Z — phone G01-G03-G04-parent-policy-keyboard: **BLOCKED**.
  {"error":"locator.click: Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for
  getByRole('button', { name: 'Settings', exact: true })\u001b[22m\n\u001b[2m - locator resolved to
  <button type=\"button\" role=\"button\" tabindex=\"-1\" aria-label=\"Settings\" class=\"x1ghz6dp
  x9f619 x78zum5 x6s0dn4 xl56j7k x1y0btm7 x1ypdohk xwji4o3 x1useyqa xsdox4t x8o2dna xc342km xjbqb8w
  xbyyjgo x4gyw5p x1tqd960 xi4js5 x17agq8a x19991ni x3vay4l\">…</button>\u001b[22m\n\u001b[2m -
  attempting click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be
  visible, enabled and stable\u001b[22m\n\u001b[2m - element is visible, enabled and
  stable\u001b[22m\n\u001b[2m - scrolling into view if needed\u001b[22m\n\u001b[2m - done
  scrolling\u001b[22m\n\u001b[2m - <div aria-hidden=\"true\" data-testid=\"modal-backdrop\"
  class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div> from <div>…</div> subtree intercepts pointer
  events\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m - waiting
  100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - <div
  aria-hidden=\"true\" data-testid=\"modal-backdrop\" class=\"css-g5y9jx r-2kxcpj r-u8s1d\"></div>
  from <div>…</div> subtree intercepts pointer events\u001b[22m\n\u001b[2m - retrying click
  action\u001b[22m\n\u001b[2m - waiting 500ms\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-phone-G01-G03-G04-parent-policy-keyboard-1792550185862.png),
  [tree](../evidence/chromium-phone-G01-G03-G04-parent-policy-keyboard-1792550185862.aria.txt).

* 2026-10-21T02:36:31.745Z — phone A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected: 1\nReceived:
  0\n\nCall Log:\n- Timeout 5000ms exceeded while waiting on the predicate"} Evidence:
  [screenshot](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792550203336.png),
  [tree](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792550203336.aria.txt).

* 2026-10-21T02:36:43.431Z — phone A04-A05-serverError: **PASS**.
  {"requests":[{"at":1792550206546,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550210158,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":500},{"at":1792550210842,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-serverError-1792550211921.png),
  [tree](../evidence/chromium-phone-A04-A05-serverError-1792550211921.aria.txt).

* 2026-10-21T02:36:52.045Z — phone A04-A05-bare502: **PASS**.
  {"requests":[{"at":1792550215283,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550218882,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":502},{"at":1792550219594,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-bare502-1792550220670.png),
  [tree](../evidence/chromium-phone-A04-A05-bare502-1792550220670.aria.txt).

* 2026-10-21T02:37:00.782Z — phone A04-A05-malformedJson: **PASS**.
  {"requests":[{"at":1792550223950,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550227610,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200},{"at":1792550228323,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-malformedJson-1792550229372.png),
  [tree](../evidence/chromium-phone-A04-A05-malformedJson-1792550229372.aria.txt).

* 2026-10-21T02:37:09.520Z — phone A04-A05-wrongType: **PASS**.
  {"requests":[{"at":1792550232730,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550236333,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200},{"at":1792550236926,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-wrongType-1792550237976.png),
  [tree](../evidence/chromium-phone-A04-A05-wrongType-1792550237976.aria.txt).

* 2026-10-21T02:37:18.103Z — phone A04-A05-throttled: **PASS**.
  {"requests":[{"at":1792550241271,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550244901,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":429},{"at":1792550245582,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"429
  behavior recorded; whether immediate retry is intentional requires source/shipping comparison."}
  Evidence: [screenshot](../evidence/chromium-phone-A04-A05-throttled-1792550246651.png),
  [tree](../evidence/chromium-phone-A04-A05-throttled-1792550246651.aria.txt).

* 2026-10-21T02:37:26.766Z — phone A04-A05-refusal: **PASS**.
  {"requests":[{"at":1792550249959,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550253603,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":422}],"recovered":false,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-refusal-1792550254662.png),
  [tree](../evidence/chromium-phone-A04-A05-refusal-1792550254662.aria.txt).

* 2026-10-21T02:37:59.785Z — phone A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"locator.click: Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for
  getByRole('button', { name: /AI picture|AI image/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792550295646.png),
  [tree](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792550295646.aria.txt).

* 2026-10-21T02:38:15.747Z — tablet A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"locator.click: Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for
  getByRole('button', { name: /AI picture|AI image/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-tablet-A01-A03-A08-fixture-success-1792550311244.png),
  [tree](../evidence/chromium-tablet-A01-A03-A08-fixture-success-1792550311244.aria.txt).

* 2026-10-21T02:38:31.337Z — desktop A01-A03-A08-fixture-success: **BLOCKED**.
  {"error":"locator.click: Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for
  getByRole('button', { name: /AI picture|AI image/ }).visible().first()\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-desktop-A01-A03-A08-fixture-success-1792550327175.png),
  [tree](../evidence/chromium-desktop-A01-A03-A08-fixture-success-1792550327175.aria.txt).

* 2026-10-21T02:39:14.376Z — phone A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792550357557,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792550361102,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200},{"at":1792550366993,"method":"POST","host":"splotch.art","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":148289,"parts":["kind","drawing:image/png","output:image/jpeg","style"]},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":779,"inputLength":35507,"resultLength":112370,"phase":"result"}]},{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Database
  existence only; original-byte retention inspected separately."} Evidence:
  [screenshot](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792550367083.png),
  [tree](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792550367083.aria.txt).

* 2026-10-21T02:40:20.305Z — phone W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true}],"undo":1} Evidence:
  [screenshot](../evidence/chromium-phone-W06-mouse-contact-1792550422316.png),
  [tree](../evidence/chromium-phone-W06-mouse-contact-1792550422316.aria.txt).

* 2026-10-21T02:40:22.528Z — tablet W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true}],"undo":1} Evidence:
  [screenshot](../evidence/chromium-tablet-W06-mouse-contact-1792550424540.png),
  [tree](../evidence/chromium-tablet-W06-mouse-contact-1792550424540.aria.txt).

* 2026-10-21T02:40:24.767Z — desktop W06-mouse-contact: **PASS**.
  {"events":[{"tool":"mouse","trusted":true}],"undo":1} Evidence:
  [screenshot](../evidence/chromium-desktop-W06-mouse-contact-1792550426796.png),
  [tree](../evidence/chromium-desktop-W06-mouse-contact-1792550426796.aria.txt).

* 2026-10-21T02:40:27.023Z — phone D06-2-touches: **PASS**.
  {"contacts":2,"cohortUndo":1,"nextStrokeUndo":1,"input":"trusted CDP touch","limits":"All contacts
  Pen; other brushes and independent lift sequence remain separate."} Evidence:
  [screenshot](../evidence/chromium-phone-D06-2-touches-1792550431834.png),
  [tree](../evidence/chromium-phone-D06-2-touches-1792550431834.aria.txt).

* 2026-10-21T02:40:32.096Z — phone D06-5-touches: **PASS**.
  {"contacts":5,"cohortUndo":1,"nextStrokeUndo":1,"input":"trusted CDP touch","limits":"All contacts
  Pen; other brushes and independent lift sequence remain separate."} Evidence:
  [screenshot](../evidence/chromium-phone-D06-5-touches-1792550436923.png),
  [tree](../evidence/chromium-phone-D06-5-touches-1792550436923.aria.txt).

* 2026-10-21T02:40:37.132Z — tablet D06-2-touches: **PASS**.
  {"contacts":2,"cohortUndo":1,"nextStrokeUndo":1,"input":"trusted CDP touch","limits":"All contacts
  Pen; other brushes and independent lift sequence remain separate."} Evidence:
  [screenshot](../evidence/chromium-tablet-D06-2-touches-1792550442027.png),
  [tree](../evidence/chromium-tablet-D06-2-touches-1792550442027.aria.txt).

* 2026-10-21T02:40:42.255Z — tablet D06-5-touches: **PASS**.
  {"contacts":5,"cohortUndo":1,"nextStrokeUndo":1,"input":"trusted CDP touch","limits":"All contacts
  Pen; other brushes and independent lift sequence remain separate."} Evidence:
  [screenshot](../evidence/chromium-tablet-D06-5-touches-1792550447217.png),
  [tree](../evidence/chromium-tablet-D06-5-touches-1792550447217.aria.txt).

* 2026-10-21T02:40:47.443Z — desktop W06-trusted-pen: **PASS**.
  {"events":[{"tool":"pen","trusted":true,"pressure":0.30000001192092896}],"undo":1,"limits":"CDP
  pen pressure values; physical stylus fidelity unproven."} Evidence:
  [screenshot](../evidence/chromium-desktop-W06-trusted-pen-1792550450139.png),
  [tree](../evidence/chromium-desktop-W06-trusted-pen-1792550450139.aria.txt).

* 2026-10-21T02:40:50.378Z — desktop D07-idle-gap: **PASS**.
  {"connectingMidpointUnchanged":true,"limits":"Recheck of known fixed 3019; 1.5s idle intentionally
  crosses dropped-pointer cutoff."} Evidence:
  [screenshot](../evidence/chromium-desktop-D07-idle-gap-1792550453851.png),
  [tree](../evidence/chromium-desktop-D07-idle-gap-1792550453851.aria.txt).

* 2026-10-21T02:40:54.766Z — phone C01-P01-farm-composite: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"dede1b50ffd826817c8caa5a6517b167100ca8e3598c40d98b7ed0358d89433a\"\nReceived:
  \"9e904443e0975369152f25bd5c53743007f67f2930c2930eb7f99657706b8565\""} Evidence:
  [screenshot](../evidence/chromium-phone-C01-P01-farm-composite-1792550466671.png),
  [tree](../evidence/chromium-phone-C01-P01-farm-composite-1792550466671.aria.txt).

* 2026-10-21T02:41:08.364Z — phone D12-short-full-clear-drag: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"2fd52c65b90c66e835e7311f191ebe01a312989c3d81898125faf0ffea9122fe\"\nReceived:
  \"58c83e496007f2cecc8056f3fd496737ff0bf271cfc55a1d9b4980b3d13897c7\""} Evidence:
  [screenshot](../evidence/chromium-phone-D12-short-full-clear-drag-1792550474365.png),
  [tree](../evidence/chromium-phone-D12-short-full-clear-drag-1792550474365.aria.txt).

* 2026-10-21T02:41:16.037Z — phone W05-eraser-hover: **PASS**.
  {"bubbleShown":true,"bubbleLeft":true,"hoverPainted":false,"input":"trusted mouse"} Evidence:
  [screenshot](../evidence/chromium-phone-W05-eraser-hover-1792550478957.png),
  [tree](../evidence/chromium-phone-W05-eraser-hover-1792550478957.aria.txt).

* 2026-10-21T02:41:20.586Z — phone W08-root-overflow: **PASS**.
  {"overflow":{"scroll":390,"width":390,"height":844},"picker":{"x":44,"y":167.5,"width":302,"height":509},"limits":"Root
  and picker bounds only; Settings cases separately."} Evidence:
  [screenshot](../evidence/chromium-phone-W08-root-overflow-1792550482020.png),
  [tree](../evidence/chromium-phone-W08-root-overflow-1792550482020.aria.txt).

* 2026-10-21T02:41:23.586Z — phone X01-X03-W09-W10-dark: **PASS**.
  {"mode":"dark","drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS zoom is a
  labeled surrogate, not browser chrome zoom; complete section/layout inspection remains separate."}
  Evidence: [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-dark-1792550488847.png),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-dark-1792550488847.aria.txt).

* 2026-10-21T02:41:30.474Z — phone X01-X03-W09-W10-reduce: **PASS**.
  {"mode":"reduce","drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS zoom is a
  labeled surrogate, not browser chrome zoom; complete section/layout inspection remains separate."}
  Evidence: [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-reduce-1792550495735.png),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-reduce-1792550495735.aria.txt).

* 2026-10-21T02:41:37.374Z — phone X01-X03-W09-W10-forced: **PASS**.
  {"mode":"forced","drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS zoom is a
  labeled surrogate, not browser chrome zoom; complete section/layout inspection remains separate."}
  Evidence: [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-forced-1792550502636.png),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-forced-1792550502636.aria.txt).

* 2026-10-21T02:41:44.325Z — phone X01-X03-W09-W10-text200: **PASS**.
  {"mode":"text200","drawerAndSettingsReachable":true,"drawAndUndo":true,"limits":"CSS zoom is a
  labeled surrogate, not browser chrome zoom; complete section/layout inspection remains separate."}
  Evidence: [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-text200-1792550509797.png),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-text200-1792550509797.aria.txt).

* 2026-10-21T02:41:51.465Z — phone X01-X03-W09-W10-cssZoom200: **BLOCKED**. {"error":"locator.click:
  Timeout 7000ms exceeded.\nCall log:\n\u001b[2m - waiting for getByRole('button', { name: 'Close',
  exact: true })\u001b[22m\n\u001b[2m - locator resolved to <button type=\"button\"
  aria-label=\"Close\" aria-disabled=\"false\" data-focus-ring=\"radiusBlob2\" class=\"x1y0btm7
  x1ghz6dp x9f619 x1n2onr6 x78zum5 x6s0dn4 xl56j7k x2lah0s xc342km xjbqb8w x1ypdohk x11xpdln
  x12nm00m x5lhr3w x16ye13r x3oybdh xp6p8kk x1fozly0\">…</button>\u001b[22m\n\u001b[2m - attempting
  click action\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - element
  is outside of the viewport\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m -
  waiting 20ms\u001b[22m\n\u001b[2m 2 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - element
  is outside of the viewport\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m -
  waiting 100ms\u001b[22m\n\u001b[2m 13 × waiting for element to be visible, enabled and
  stable\u001b[22m\n\u001b[2m - element is visible, enabled and stable\u001b[22m\n\u001b[2m -
  scrolling into view if needed\u001b[22m\n\u001b[2m - done scrolling\u001b[22m\n\u001b[2m - element
  is outside of the viewport\u001b[22m\n\u001b[2m - retrying click action\u001b[22m\n\u001b[2m -
  waiting 500ms\u001b[22m\n"} Evidence:
  [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-cssZoom200-1792550521386.png),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-cssZoom200-1792550521386.aria.txt).

* 2026-10-21T02:42:11.042Z — phone W13-ai-idb-quota: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  15000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/chromium-phone-W13-ai-idb-quota-1792550553207.png),
  [tree](../evidence/chromium-phone-W13-ai-idb-quota-1792550553207.aria.txt).

* 2026-10-21T02:42:36.205Z — phone G01-G03-G04-parent-policy-keyboard: **PASS**.
  {"sessionReused":true,"everyTimeAsked":true,"keyboardSolved":true,"escapeCanceled":true,"neverCancelPreserved":true,"neverConfirmApplied":true,"limits":"Backspace
  exercised before cancel; wrong-answer/lockout separate."} Evidence:
  [screenshot](../evidence/chromium-phone-G01-G03-G04-parent-policy-keyboard-1792550582499.png),
  [tree](../evidence/chromium-phone-G01-G03-G04-parent-policy-keyboard-1792550582499.aria.txt).

* 2026-10-21T02:43:04.450Z — phone W03-W14-offline-shell: **PASS**.
  {"state":{"secure":true,"controller":"http://127.0.0.1:6150/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6150/"]},"offlineHydrated":true,"drewAndUndid":true,"lazySoundOpened":true,"farmSelected":true,"artDigest":"dede1b50ffd826817c8caa5a6517b167100ca8e3598c40d98b7ed0358d89433a","limits":"Same-build
  offline; update uses a separate revision fixture."} Evidence:
  [screenshot](../evidence/chromium-phone-W03-W14-offline-shell-1792550596625.png),
  [tree](../evidence/chromium-phone-W03-W14-offline-shell-1792550596625.aria.txt).

* 2026-10-21T02:43:18.321Z — tablet W03-W14-offline-shell: **PASS**.
  {"state":{"secure":true,"controller":"http://127.0.0.1:6150/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6150/"]},"offlineHydrated":true,"drewAndUndid":true,"lazySoundOpened":true,"farmSelected":true,"artDigest":"acf8ec3ac04ca6b7b7ee30e3efc840cba6084797c5c8994a7650d1a5b8f0239a","limits":"Same-build
  offline; update uses a separate revision fixture."} Evidence:
  [screenshot](../evidence/chromium-tablet-W03-W14-offline-shell-1792550610782.png),
  [tree](../evidence/chromium-tablet-W03-W14-offline-shell-1792550610782.aria.txt).

* 2026-10-21T02:43:32.357Z — desktop W03-W14-offline-shell: **PASS**.
  {"state":{"secure":true,"controller":"http://127.0.0.1:6150/sw.js","caches":["workbox-precache-v2-http://127.0.0.1:6150/"]},"offlineHydrated":true,"drewAndUndid":true,"lazySoundOpened":true,"farmSelected":true,"artDigest":"9a987632aa4a98ad1a42c3fb60e100ad56cfba2c8c3f5ff4c01b4bb0aabde9dd","limits":"Same-build
  offline; update uses a separate revision fixture."} Evidence:
  [screenshot](../evidence/chromium-desktop-W03-W14-offline-shell-1792550624685.png),
  [tree](../evidence/chromium-desktop-W03-W14-offline-shell-1792550624685.aria.txt).

* 2026-10-21T02:43:46.295Z — phone W01-W02-install-event: **BLOCKED**.
  {"error":"expect(received).toBeGreaterThan(expected)\n\nExpected: > 0\nReceived: 0"} Evidence:
  [screenshot](../evidence/chromium-phone-W01-W02-install-event-1792550631309.png),
  [tree](../evidence/chromium-phone-W01-W02-install-event-1792550631309.aria.txt).

* 2026-10-21T02:43:53.008Z — desktop W01-W02-install-event: **BLOCKED**.
  {"error":"expect(received).toBeGreaterThan(expected)\n\nExpected: > 0\nReceived: 0"} Evidence:
  [screenshot](../evidence/chromium-desktop-W01-W02-install-event-1792550638037.png),
  [tree](../evidence/chromium-desktop-W01-W02-install-event-1792550638037.aria.txt).

* 2026-10-21T02:43:59.801Z — narrow W01-W02-install-event: **BLOCKED**.
  {"error":"expect(received).toBeGreaterThan(expected)\n\nExpected: > 0\nReceived: 0"} Evidence:
  [screenshot](../evidence/chromium-narrow-W01-W02-install-event-1792550644903.png),
  [tree](../evidence/chromium-narrow-W01-W02-install-event-1792550644903.aria.txt).

* 2026-10-21T02:44:06.550Z — desktop W11-two-tab-settings: **PASS**.
  {"newTabReadFlat":true,"firstTabReloadReadDark":true,"flatPreserved":true,"limits":"Sequential
  writes and reloads; no live synchronization guarantee inferred."} Evidence:
  [screenshot](../evidence/chromium-desktop-W11-two-tab-settings-1792550656165.png),
  [tree](../evidence/chromium-desktop-W11-two-tab-settings-1792550656165.aria.txt).

* 2026-10-21T02:45:01.787Z — phone W13-ai-idb-quota: **BLOCKED**.
  {"error":"expect(locator).toBeVisible() failed\n\nLocator: getByRole('button', { name: 'Download',
  exact: true })\nExpected: visible\nTimeout: 15000ms\nError: element(s) not found\n\nCall log:\n -
  Expect \"toBeVisible\" getByRole('button', { name: 'Download', exact: true }) with timeout
  15000ms\n - waiting for getByRole('button', { name: 'Download', exact: true })\n"} Evidence:
  [screenshot](../evidence/chromium-phone-W13-ai-idb-quota-1792550723905.png),
  [tree](../evidence/chromium-phone-W13-ai-idb-quota-1792550723905.aria.txt).

* 2026-10-21T02:45:26.508Z — phone W01-W02-install-event: **PASS**. {"tree":"- button \"Purple\"\n-
  button \"Blue\"\n- button \"Green\"\n- button \"Yellow\"\n- button \"Black\"\n- button \"Custom
  Color\":\n - img\n- img\n- img\n- img\n- img\n- button \"Enter fullscreen\":\n - img\n- strong:
  Add Splotch to your home screen\n- text: Opens full-screen, just like a real app\n- button
  \"Install\":\n - img\n - text: Install\n- button \"Not now\":\n - img\n - img\n- button
  \"Settings\":\n - img\n- button \"Expand controls\":\n - img\n- status\n- status\n- button \"Clear
  drawing\":\n - img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named
  beforeinstallprompt fixture, not OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/chromium-phone-W01-W02-install-event-1792550731523.png),
  [tree](../evidence/chromium-phone-W01-W02-install-event-1792550731523.aria.txt).

* 2026-10-21T02:45:33.200Z — desktop W01-W02-install-event: **PASS**. {"tree":"- button
  \"Purple\"\n- button \"Blue\"\n- button \"Teal\"\n- button \"Green\"\n- button \"Yellow\"\n-
  button \"Orange\"\n- button \"Red\"\n- button \"Pink\"\n- button \"Black\"\n- button \"Custom
  Color\":\n - img\n- img\n- img\n- img\n- img\n- strong: Add Splotch to your home screen\n- text:
  Opens full-screen, just like a real app\n- button \"Install\":\n - img\n - text: Install\n- button
  \"Not now\":\n - img\n - img\n- button \"Settings\":\n - img\n- button \"Expand controls\":\n -
  img\n- status\n- status\n- button \"Clear drawing\":\n -
  img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named beforeinstallprompt fixture, not
  OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/chromium-desktop-W01-W02-install-event-1792550738210.png),
  [tree](../evidence/chromium-desktop-W01-W02-install-event-1792550738210.aria.txt).

* 2026-10-21T02:45:39.969Z — narrow W01-W02-install-event: **PASS**. {"tree":"- button \"Purple\"\n-
  button \"Blue\"\n- button \"Black\"\n- button \"Custom Color\":\n - img\n- img\n- img\n- img\n-
  img\n- button \"Enter fullscreen\":\n - img\n- strong: Add Splotch to your home screen\n- text:
  Opens full-screen, just like a real app\n- button \"Install\":\n - img\n - text: Install\n- button
  \"Not now\":\n - img\n - img\n- button \"Settings\":\n - img\n- button \"Expand controls\":\n -
  img\n- status\n- status\n- button \"Clear drawing\":\n -
  img","promptCalls":1,"fixtureOutcome":"dismissed","limits":"Named beforeinstallprompt fixture, not
  OS install UI; banner screenshot saved by case."} Evidence:
  [screenshot](../evidence/chromium-narrow-W01-W02-install-event-1792550744946.png),
  [tree](../evidence/chromium-narrow-W01-W02-install-event-1792550744946.aria.txt).

* 2026-10-21T02:45:47.132Z — desktop W04-W14-update-revision-fixture: **PASS**.
  {"waitingBeforeHide":"installed","inkPreventedReload":true,"blankHiddenReloaded":true,"navigations":["http://127.0.0.1:6152/","http://127.0.0.1:6152/","http://127.0.0.1:6152/","http://127.0.0.1:6152/"],"offlineAfterUpdateDrew":true,"limits":"Changed-worker
  and version fixture uses the same qualified app artifact, not a second release. Hidden state is a
  named headless fixture."} Evidence:
  [screenshot](../evidence/chromium-desktop-W04-W14-update-revision-fixture-1792550760326.png),
  [tree](../evidence/chromium-desktop-W04-W14-update-revision-fixture-1792550760326.aria.txt).

* 2026-10-21T02:49:38.220Z — phone D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"mean":0.00043402777777777775,"max":8,"changedChannels":64,"totalChannels":269568},"limits":"Eraser
  Undo permits rasterization fringe (mean channel delta below 1); originals saved for visual review.
  One path per brush; dot and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792551010162.webp),
  [tree](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792551010162.aria.txt).

* 2026-10-21T02:50:11.635Z — phone D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/chromium-phone-D09-custom-color-1792551020887.webp),
  [tree](../evidence/chromium-phone-D09-custom-color-1792551020887.aria.txt).

* 2026-10-21T02:50:22.891Z — phone G02-wrong-answer-lockout: **BLOCKED**.
  {"error":"expect(locator).toBeDisabled() failed\n\nLocator: getByRole('button', { name: 'Check
  answer', exact: true })\nExpected: disabled\nReceived: enabled\nTimeout: 5000ms\n\nCall log:\n -
  Expect \"toBeDisabled\" getByRole('button', { name: 'Check answer', exact: true }) with timeout
  5000ms\n - waiting for getByRole('button', { name: 'Check answer', exact: true })\n 14 × locator
  resolved to <button type=\"button\" data-key=\"submit\" aria-disabled=\"false\" aria-label=\"Check
  answer\" class=\"x1y0btm7 x1ghz6dp x78zum5 x6s0dn4 xl56j7k x1iyjqo2 xs83m0k x1r8uery x1717udv
  xc342km xj8ol9t x1gj5u2b x5ug4po x2pb8z4 x1sxw71b xja96ht x1ypdohk x3oybdh x1r0vdo7 x11xpdln
  x12nm00m x16ye13r xp6itz1\">…</button>\n - unexpected value \"enabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-G02-wrong-answer-lockout-1792551035470.webp),
  [tree](../evidence/chromium-phone-G02-wrong-answer-lockout-1792551035470.aria.txt).

* 2026-10-21T02:50:37.404Z — phone L03-browser-back: **PASS**.
  {"coarse":true,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":true,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/chromium-phone-L03-browser-back-1792551042758.webp),
  [tree](../evidence/chromium-phone-L03-browser-back-1792551042758.aria.txt).

* 2026-10-21T02:50:44.255Z — tablet L03-browser-back: **PASS**.
  {"coarse":true,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":true,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/chromium-tablet-L03-browser-back-1792551049663.webp),
  [tree](../evidence/chromium-tablet-L03-browser-back-1792551049663.aria.txt).

* 2026-10-21T02:50:51.205Z — desktop L03-browser-back: **PASS**.
  {"coarse":false,"settingsBackClosedWholeDialog":true,"guardAbsorbedOneBack":false,"exitedToFixture":true,"limits":"Named
  local history sentinel; no information routes opened. Fine pointer intentionally has no drawing
  guard."} Evidence: [screenshot](../evidence/chromium-desktop-L03-browser-back-1792551055822.webp),
  [tree](../evidence/chromium-desktop-L03-browser-back-1792551055822.aria.txt).

* 2026-10-21T02:51:26.142Z — phone C01-P01-farm-composite: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"dede1b50ffd826817c8caa5a6517b167100ca8e3598c40d98b7ed0358d89433a\"\nReceived:
  \"de5b0183fbcd7927710aa27913fbbdab6d8a2ff7ebef23eb5ed70dca1f09585a\""} Evidence:
  [screenshot](../evidence/chromium-phone-C01-P01-farm-composite-1792551098099.webp),
  [tree](../evidence/chromium-phone-C01-P01-farm-composite-1792551098099.aria.txt).

* 2026-10-21T02:51:39.794Z — phone D12-short-full-clear-drag: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"2fd52c65b90c66e835e7311f191ebe01a312989c3d81898125faf0ffea9122fe\"\nReceived:
  \"58c83e496007f2cecc8056f3fd496737ff0bf271cfc55a1d9b4980b3d13897c7\""} Evidence:
  [screenshot](../evidence/chromium-phone-D12-short-full-clear-drag-1792551105749.webp),
  [tree](../evidence/chromium-phone-D12-short-full-clear-drag-1792551105749.aria.txt).

* 2026-10-21T02:54:25.372Z — phone C01-P01-farm-composite: **PASS**.
  {"artVisible":true,"inkVisible":true,"clearKeptArt":true,"undoRestoredInk":true,"artDifference":{"width":234,"height":384,"changedPixels":1304,"mean":0.10121750356125356,"max":66,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"undoDifference":{"width":234,"height":384,"changedPixels":1050,"mean":0.0827360814339981,"max":73,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"png":{"width":780,"height":1538},"images":[{"path":"/coloring/dinosaur/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/brachiosaurus-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/brachiosaurus-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/brachiosaurus-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/brachiosaurus-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/brachiosaurus-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/brachiosaurus-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/brachiosaurus-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/brachiosaurus-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/brachiosaurus-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/brachiosaurus-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/brachiosaurus-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/brachiosaurus-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/pterodactyl-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/pterodactyl-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/pterodactyl-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/pterodactyl-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/pterodactyl-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/pterodactyl-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/pterodactyl-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/pterodactyl-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/pterodactyl-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/pterodactyl-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/pterodactyl-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/pterodactyl-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/stegosaurus-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/stegosaurus-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/stegosaurus-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/stegosaurus-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/stegosaurus-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/stegosaurus-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/stegosaurus-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/stegosaurus-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/stegosaurus-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/stegosaurus-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/stegosaurus-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/stegosaurus-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/trex-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/trex-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/trex-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/trex-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/trex-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/trex-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/trex-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/trex-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/trex-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/trex-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/trex-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/trex-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/triceratops-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/triceratops-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/triceratops-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/triceratops-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/triceratops-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/triceratops-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/triceratops-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/triceratops-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/triceratops-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/triceratops-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/triceratops-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/triceratops-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/velociraptor-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/velociraptor-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/velociraptor-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/velociraptor-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/velociraptor-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/velociraptor-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/velociraptor-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/dinosaur/velociraptor-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/velociraptor-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/velociraptor-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/dinosaur/velociraptor-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/dinosaur/velociraptor-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/dragon-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/dragon-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/dragon-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/dragon-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/dragon-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/dragon-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/dragon-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/dragon-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/dragon-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/dragon-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/dragon-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/dragon-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/fairy-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/fairy-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/fairy-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/fairy-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/fairy-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/fairy-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/fairy-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/fairy-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/fairy-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/fairy-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/fairy-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/fairy-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/mermaid-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/mermaid-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/mermaid-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/mermaid-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/mermaid-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/mermaid-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/mermaid-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/mermaid-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/mermaid-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/mermaid-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/mermaid-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/mermaid-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/owl-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/owl-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/owl-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/owl-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/owl-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/owl-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/owl-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/owl-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/owl-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/owl-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/owl-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/owl-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/pegasus-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/pegasus-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/pegasus-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/pegasus-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/pegasus-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/pegasus-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/pegasus-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/pegasus-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/pegasus-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/pegasus-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/pegasus-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/pegasus-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/unicorn-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/unicorn-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/unicorn-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/unicorn-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/unicorn-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/unicorn-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/unicorn-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/creatures/unicorn-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/unicorn-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/unicorn-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/creatures/unicorn-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/creatures/unicorn-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ant-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ant-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ant-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ant-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ant-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ant-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ant-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ant-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ant-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ant-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ant-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ant-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/bee-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/bee-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/bee-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/bee-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/bee-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/bee-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/bee-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/bee-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/bee-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/bee-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/bee-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/bee-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/caterpillar-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/caterpillar-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/caterpillar-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/caterpillar-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/caterpillar-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/caterpillar-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/caterpillar-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/caterpillar-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/caterpillar-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/caterpillar-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/caterpillar-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/caterpillar-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ladybug-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ladybug-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ladybug-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ladybug-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ladybug-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ladybug-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ladybug-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/ladybug-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ladybug-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ladybug-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/ladybug-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/ladybug-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/snail-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/snail-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/snail-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/snail-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/snail-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/snail-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/snail-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/snail-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/snail-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/snail-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/snail-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/snail-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/spider-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/spider-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/spider-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/spider-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/spider-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/spider-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/spider-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/nature/spider-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/spider-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/spider-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/nature/spider-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/nature/spider-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/apple-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/apple-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/apple-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/apple-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/apple-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/apple-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/apple-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/apple-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/apple-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/apple-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/apple-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/apple-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/balloon-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/balloon-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/balloon-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/balloon-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/balloon-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/balloon-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/balloon-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/balloon-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/balloon-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/balloon-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/balloon-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/balloon-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/flower-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/flower-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/flower-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/flower-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/flower-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/flower-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/flower-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/flower-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/flower-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/flower-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/flower-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/flower-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/house-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/house-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/house-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/house-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/house-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/house-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/house-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/house-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/house-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/house-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/house-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/house-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/teddy-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/teddy-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/teddy-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/teddy-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/teddy-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/teddy-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/teddy-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/teddy-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/teddy-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/teddy-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/teddy-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/teddy-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/umbrella-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/umbrella-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/umbrella-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/umbrella-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/umbrella-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/umbrella-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/umbrella-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/objects/umbrella-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/umbrella-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/umbrella-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/objects/umbrella-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/objects/umbrella-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/circle-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/circle-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/circle-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/circle-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/circle-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/circle-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/circle-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/circle-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/circle-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/circle-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/circle-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/circle-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/heart-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/heart-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/heart-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/heart-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/heart-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/heart-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/heart-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/heart-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/heart-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/heart-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/heart-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/heart-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/rectangle-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/rectangle-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/rectangle-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/rectangle-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/rectangle-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/rectangle-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/rectangle-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/rectangle-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/rectangle-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/rectangle-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/rectangle-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/rectangle-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/square-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/square-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/square-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/square-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/square-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/square-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/square-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/square-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/square-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/square-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/square-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/square-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/star-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/star-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/star-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/star-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/star-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/star-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/star-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/star-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/star-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/star-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/star-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/star-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/triangle-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/triangle-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/triangle-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/triangle-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/triangle-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/triangle-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/triangle-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/shapes/triangle-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/triangle-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/triangle-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/shapes/triangle-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/shapes/triangle-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/astronaut-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/astronaut-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/astronaut-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/astronaut-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/astronaut-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/astronaut-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/astronaut-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/astronaut-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/astronaut-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/astronaut-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/astronaut-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/astronaut-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/meteor-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/meteor-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/meteor-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/meteor-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/meteor-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/meteor-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/meteor-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/meteor-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/meteor-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/meteor-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/meteor-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/meteor-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/moon-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/moon-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/moon-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/moon-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/moon-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/moon-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/moon-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/moon-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/moon-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/moon-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/moon-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/moon-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/rover-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/rover-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/rover-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/rover-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/rover-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/rover-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/rover-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/rover-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/rover-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/rover-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/rover-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/rover-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/ship-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/ship-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/ship-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/ship-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/ship-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/ship-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/ship-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/ship-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/ship-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/ship-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/ship-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/ship-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/station-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/station-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/station-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/station-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/station-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/station-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/station-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/space/station-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/station-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/station-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/space/station-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/space/station-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/cover.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/cover.chalk.thumb.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/excavator-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/excavator-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/excavator-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/excavator-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/excavator-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/excavator-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/excavator-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/excavator-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/excavator-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/excavator-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/excavator-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/excavator-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/fire-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/fire-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/fire-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/fire-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/fire-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/fire-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/fire-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/fire-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/fire-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/fire-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/fire-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/fire-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/garbage-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/garbage-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/garbage-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/garbage-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/garbage-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/garbage-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/garbage-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/garbage-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/garbage-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/garbage-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/garbage-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/garbage-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/monster-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/monster-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/monster-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/monster-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/monster-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/monster-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/monster-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/monster-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/monster-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/monster-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/monster-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/monster-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/police-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/police-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/police-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/police-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/police-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/police-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/police-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/police-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/police-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/police-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/police-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/police-wide.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/train-tall.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/train-tall.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/train-tall.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/train-tall.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/train-tall.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/train-tall.dark.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/train-wide.light.webp","status":200,"mime":"image/webp"},{"path":"/coloring/max-1152px/vehicles/train-wide.night.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/train-wide.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/train-wide.dark.overlay.svg","status":200,"mime":"image/svg+xml"},{"path":"/coloring/vehicles/train-wide.selector.webp","status":200,"mime":"image/webp"},{"path":"/coloring/vehicles/train-wide.dark.selector.webp","status":200,"mime":"image/webp"}],"limits":"Clear
  via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual
  review separate."} Evidence:
  [screenshot](../evidence/chromium-phone-C01-P01-farm-composite-1792551280430.webp),
  [tree](../evidence/chromium-phone-C01-P01-farm-composite-1792551280430.aria.txt).

* 2026-10-21T02:54:42.195Z — phone D12-short-full-clear-drag: **BLOCKED**.
  {"error":"expect(received).toBe(expected) // Object.is equality\n\nExpected:
  \"2fd52c65b90c66e835e7311f191ebe01a312989c3d81898125faf0ffea9122fe\"\nReceived:
  \"58c83e496007f2cecc8056f3fd496737ff0bf271cfc55a1d9b4980b3d13897c7\""} Evidence:
  [screenshot](../evidence/chromium-phone-D12-short-full-clear-drag-1792551288219.webp),
  [tree](../evidence/chromium-phone-D12-short-full-clear-drag-1792551288219.aria.txt).

* 2026-10-21T02:54:51.651Z — phone G02-wrong-answer-lockout: **PASS**.
  {"wrongAnswers":3,"problems":["What is 7 times 8?","What is 5 times 3?","What is 3 times
  4?"],"lockedMs":30283,"disabledDuringLockout":true,"recoveredAndSolved":true,"limits":"Real 30s
  base lockout; subsequent exponential lockouts not exercised."} Evidence:
  [screenshot](../evidence/chromium-phone-G02-wrong-answer-lockout-1792551336296.webp),
  [tree](../evidence/chromium-phone-G02-wrong-answer-lockout-1792551336296.aria.txt).

- 2026-10-21T04:16:07.873Z — phone D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":234,"height":384,"changedPixels":32,"mean":0.00043402777777777775,"max":8,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792556200534.webp),
  [tree](../evidence/chromium-phone-D02-D05-brush-ink-undo-1792556200534.aria.txt).

- 2026-10-21T04:16:42.037Z — phone D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/chromium-phone-D09-custom-color-1792556212157.webp),
  [tree](../evidence/chromium-phone-D09-custom-color-1792556212157.aria.txt).

- 2026-10-21T04:16:53.664Z — phone D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/chromium-phone-D11-deep-history-1792556254060.webp),
  [tree](../evidence/chromium-phone-D11-deep-history-1792556254060.aria.txt).

- 2026-10-21T04:17:35.819Z — tablet D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":492,"height":552,"changedPixels":11,"mean":0.0000920525509602922,"max":11,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792556288574.webp),
  [tree](../evidence/chromium-tablet-D02-D05-brush-ink-undo-1792556288574.aria.txt).

- 2026-10-21T04:18:10.208Z — tablet D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/chromium-tablet-D09-custom-color-1792556300480.webp),
  [tree](../evidence/chromium-tablet-D09-custom-color-1792556300480.aria.txt).

- 2026-10-21T04:18:21.869Z — tablet D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/chromium-tablet-D11-deep-history-1792556341771.webp),
  [tree](../evidence/chromium-tablet-D11-deep-history-1792556341771.aria.txt).

- 2026-10-21T04:19:03.594Z — desktop D02-D05-brush-ink-undo: **PASS**.
  {"observations":[{"name":"Pen","changedPixels":true,"undo":1,"restored":true},{"name":"Crayon","changedPixels":true,"undo":1,"restored":true},{"name":"Magic
  brush","changedPixels":true,"undo":1,"restored":true}],"erased":true,"eraserUndoRestored":true,"restorePixelDifference":{"width":717,"height":400,"changedPixels":4,"mean":0.000024407252440725244,"max":8,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity acceptance."},"limits":"Eraser
  Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot
  and edge-clipping not yet judged."} Evidence:
  [screenshot](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792556375939.webp),
  [tree](../evidence/chromium-desktop-D02-D05-brush-ink-undo-1792556375939.aria.txt).

- 2026-10-21T04:19:37.567Z — desktop D09-custom-color: **PASS**.
  {"customColorRendered":true,"reopened":true,"limits":"Grid pointer tap; recall ring and drag/scrim
  not yet asserted."} Evidence:
  [screenshot](../evidence/chromium-desktop-D09-custom-color-1792556387603.webp),
  [tree](../evidence/chromium-desktop-D09-custom-color-1792556387603.aria.txt).

- 2026-10-21T04:19:49.197Z — desktop D11-deep-history: **PASS**.
  {"commands":25,"undone":20,"limits":"The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did
  not remove the Undo cap."} Evidence:
  [screenshot](../evidence/chromium-desktop-D11-deep-history-1792556428814.webp),
  [tree](../evidence/chromium-desktop-D11-deep-history-1792556428814.aria.txt).

- 2026-10-21T04:22:47.898Z — tablet X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/chromium-tablet-X06-undo-shortcut-1792556576655.webp),
  [tree](../evidence/chromium-tablet-X06-undo-shortcut-1792556576655.aria.txt).

- 2026-10-21T04:22:59.397Z — desktop X06-undo-shortcut: **PASS**.
  {"shortcutUndidOne":true,"modalProtectedInk":true,"limits":"Text field editing checked in AI
  fixture flow separately."} Evidence:
  [screenshot](../evidence/chromium-desktop-X06-undo-shortcut-1792556588028.webp),
  [tree](../evidence/chromium-desktop-X06-undo-shortcut-1792556588028.aria.txt).

- 2026-10-21T04:23:10.868Z — phone D12-short-full-clear-drag: **PASS**.
  {"shortPreserved":true,"fullCleared":true,"undoRestored":true,"restoreDifference":{"width":234,"height":384,"changedPixels":17,"mean":0.0002633843779677113,"max":8,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDifference":{"width":234,"height":384,"changedPixels":0,"mean":0,"max":0,"fringeViolations":0,"rasterFringePx":1,"aaShadeSlop":10,"limits":"Diagnostic
  one-pixel antialias envelope; not pixel-exact token or final parity
  acceptance."},"shortDigest":"2fd52c65b90c66e835e7311f191ebe01a312989c3d81898125faf0ffea9122fe","restoredDigest":"700a1e4ea154ab085de9f821a3f1d498d1fadd8c3048b0a28ee798e3b3d03b5d","input":"trusted
  mouse","limits":"Touch clear and reverse drag separate."} Evidence:
  [screenshot](../evidence/chromium-phone-D12-short-full-clear-drag-1792556604373.webp),
  [tree](../evidence/chromium-phone-D12-short-full-clear-drag-1792556604373.aria.txt).

- 2026-10-21T04:23:27.716Z — tablet A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792556611065,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792556615017,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":10096,"format":"webp","width":1640,"height":2210},"credential":["x-installation-id"],"reply":200},{"at":1792556622766,"method":"POST","host":"splotch.art","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":203521,"parts":["kind","drawing:image/png","output:image/jpeg","style"]},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":739,"inputLength":90739,"resultLength":112370,"phase":"result"}]},{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/chromium-tablet-A01-A03-A08-fixture-success-1792556622799.webp),
  [tree](../evidence/chromium-tablet-A01-A03-A08-fixture-success-1792556622799.aria.txt).

- 2026-10-21T04:23:44.401Z — desktop A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792556627465,"method":"GET","host":"splotch.art","path":"/api/free-generation-grant","query":"","origin":"http://127.0.0.1:6150","upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792556631404,"method":"POST","host":"splotch.art","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":11076,"format":"webp","width":2392,"height":1600},"credential":["x-installation-id"],"reply":200},{"at":1792556638754,"method":"POST","host":"splotch.art","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":183014,"parts":["kind","drawing:image/png","output:image/jpeg","style"]},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":764,"inputLength":94014,"resultLength":88588,"phase":"result"}]},{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/chromium-desktop-A01-A03-A08-fixture-success-1792556638837.webp),
  [tree](../evidence/chromium-desktop-A01-A03-A08-fixture-success-1792556638837.aria.txt).

- 2026-10-21T04:24:01.739Z — phone X01-X03-W09-W10-cssZoom200: **BLOCKED**.
  {"error":"expect(locator).toBeEnabled() failed\n\nLocator: getByRole('button', { name: 'Undo',
  exact: true })\nExpected: enabled\nReceived: disabled\nTimeout: 5000ms\n\nCall log:\n - Expect
  \"toBeEnabled\" getByRole('button', { name: 'Undo', exact: true }) with timeout 5000ms\n - waiting
  for getByRole('button', { name: 'Undo', exact: true })\n 14 × locator resolved to <button
  type=\"button\" role=\"button\" aria-label=\"Undo\" aria-disabled=\"true\" class=\"x1ghz6dp x9f619
  x78zum5 x6s0dn4 xl56j7k x1y0btm7 xwji4o3 x1n2onr6 xdh2fpr x150r95f x3vay4l x7yrpt8 x5lhr3w
  x16ye13r x1fozly0 xl99188 xvqu1re x1w5r55w xuzhngd x3oybdh x1sqbtui\">…</button>\n - unexpected
  value \"disabled\"\n"} Evidence:
  [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-cssZoom200-1792556650862.webp),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-cssZoom200-1792556650862.aria.txt).

- 2026-10-21T04:26:24.813Z — phone X01-X03-W09-W10-cssZoom200: **PASS**. {"surrogate":"CSS zoom
  2","settingsEntered":true,"dismissal":"Escape","closeButtonBefore":{"x":417,"y":105.625,"width":96,"height":96},"drawAndUndo":true,"limits":"This
  completes the CSS surrogate using a keyboard dismissal. The Close pointer target remains outside
  the viewport; real browser-chrome zoom cannot be set by this remote Playwright browser connection
  and stays unproven. No actual browser zoom verdict."} Evidence:
  [screenshot](../evidence/chromium-phone-X01-X03-W09-W10-cssZoom200-1792556788334.webp),
  [tree](../evidence/chromium-phone-X01-X03-W09-W10-cssZoom200-1792556788334.aria.txt).

- 2026-10-21T08:04:50.520Z — phone A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792569893822,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569897432,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200},{"at":1792569904506,"method":"POST","host":"127.0.0.1:6150","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":148289,"parts":["kind","drawing:image/png","output:image/jpeg","style"]},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":779,"inputLength":35507,"resultLength":112370,"phase":"result"}]},{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792569904595.webp),
  [tree](../evidence/chromium-phone-A01-A03-A08-fixture-success-1792569904595.aria.txt).

- 2026-10-21T08:05:06.235Z — tablet A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792569909422,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569913495,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":10096,"format":"webp","width":1640,"height":2210},"credential":["x-installation-id"],"reply":200},{"at":1792569921086,"method":"POST","host":"127.0.0.1:6150","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":203521,"parts":["kind","drawing:image/png","output:image/jpeg","style"]},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":739,"inputLength":90739,"resultLength":112370,"phase":"result"}]},{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/chromium-tablet-A01-A03-A08-fixture-success-1792569921169.webp),
  [tree](../evidence/chromium-tablet-A01-A03-A08-fixture-success-1792569921169.aria.txt).

- 2026-10-21T08:05:22.954Z — desktop A01-A03-A08-fixture-success: **PASS**.
  {"requests":[{"at":1792569926125,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569929891,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":11076,"format":"webp","width":2392,"height":1600},"credential":["x-installation-id"],"reply":200},{"at":1792569936888,"method":"POST","host":"127.0.0.1:6150","path":"/api/report-image","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"multipart/form-data","bytes":183014,"parts":["kind","drawing:image/png","output:image/jpeg","style"]},"credential":["x-installation-id","x-report-token"],"reply":200}],"storage":[{"name":"splotch-beta-ai-jobs-v1","stores":["state"],"attempts":[{"originalModelBytes":764,"inputLength":94014,"resultLength":88588,"phase":"result"}]},{"name":"splotch-beta-ai-vault-v1","stores":["vault"]},{"name":"splotch-beta-offline-library-v1","stores":["files"]},{"name":"splotch-candidate-unsaved-pictures","stores":["held"]}],"oneUpload":true,"minimizedAndDrew":true,"cancelSentNothing":true,"reportSentOnce":true,"limits":"Original
  model text measured in IndexedDB; image byte lengths are stored receipts rather than byte-for-byte
  image validation."} Evidence:
  [screenshot](../evidence/chromium-desktop-A01-A03-A08-fixture-success-1792569936972.webp),
  [tree](../evidence/chromium-desktop-A01-A03-A08-fixture-success-1792569936972.aria.txt).

- 2026-10-21T08:05:38.496Z — phone A04-A05-serverError: **PASS**.
  {"requests":[{"at":1792569941609,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569945150,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":500},{"at":1792569945794,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-serverError-1792569946859.webp),
  [tree](../evidence/chromium-phone-A04-A05-serverError-1792569946859.aria.txt).

- 2026-10-21T08:05:48.462Z — phone A04-A05-bare502: **PASS**.
  {"requests":[{"at":1792569951630,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569955193,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":502},{"at":1792569955846,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-bare502-1792569956936.webp),
  [tree](../evidence/chromium-phone-A04-A05-bare502-1792569956936.aria.txt).

- 2026-10-21T08:05:58.553Z — phone A04-A05-malformedJson: **PASS**.
  {"requests":[{"at":1792569961734,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569965350,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200},{"at":1792569965969,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-malformedJson-1792569967070.webp),
  [tree](../evidence/chromium-phone-A04-A05-malformedJson-1792569967070.aria.txt).

- 2026-10-21T08:06:08.682Z — phone A04-A05-wrongType: **PASS**.
  {"requests":[{"at":1792569971832,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569975376,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200},{"at":1792569975979,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-wrongType-1792569977072.webp),
  [tree](../evidence/chromium-phone-A04-A05-wrongType-1792569977072.aria.txt).

- 2026-10-21T08:06:18.700Z — phone A04-A05-throttled: **PASS**.
  {"requests":[{"at":1792569981831,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569985359,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":429},{"at":1792569985996,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"recovered":true,"limits":"429
  behavior recorded; whether immediate retry is intentional requires source/shipping comparison."}
  Evidence: [screenshot](../evidence/chromium-phone-A04-A05-throttled-1792569987072.webp),
  [tree](../evidence/chromium-phone-A04-A05-throttled-1792569987072.aria.txt).

- 2026-10-21T08:06:28.705Z — phone A04-A05-refusal: **PASS**.
  {"requests":[{"at":1792569991836,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792569995348,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":422}],"recovered":false,"limits":"Fixture
  only; no live transport proven."} Evidence:
  [screenshot](../evidence/chromium-phone-A04-A05-refusal-1792569996351.webp),
  [tree](../evidence/chromium-phone-A04-A05-refusal-1792569996351.aria.txt).

- 2026-10-21T08:06:37.904Z — phone S07-dummy-key-persistence: **PASS**.
  {"dummyOnly":true,"verifiedThroughFixture":true,"masked":true,"noPlaintextLocalStorage":true,"reloadRetained":true,"forgetPersisted":true,"fieldShortcutDidNotUndoInk":true,"requests":[{"at":1792570002406,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570002670,"method":"POST","host":"127.0.0.1:6150","path":"/api/verify-key","query":"","origin":"http://127.0.0.1:6150","upload":{"contentType":"application/json","bytes":53},"credential":[],"reply":200},{"at":1792570006787,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570007142,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570007192,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"No
  real key; encryption implementation covered by existing vault tests, not inferred from masking."}
  Evidence: [screenshot](../evidence/chromium-phone-S07-dummy-key-persistence-1792570010106.webp),
  [tree](../evidence/chromium-phone-S07-dummy-key-persistence-1792570010106.aria.txt).

- 2026-10-21T08:06:51.602Z — phone A06-ticket-poll-success: **PASS**.
  {"uploads":1,"polls":2,"requests":[{"at":1792570014765,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570018361,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":202},{"at":1792570021365,"method":"GET","host":"127.0.0.1:6150","path":"/api/generation-result","query":"?job=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","origin":null,"upload":null,"credential":["x-installation-id"],"reply":202},{"at":1792570024372,"method":"GET","host":"127.0.0.1:6150","path":"/api/generation-result","query":"?job=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200}],"limits":"Ticket
  then pending then image; long timeout and reload-mid-poll remain separate."} Evidence:
  [screenshot](../evidence/chromium-phone-A06-ticket-poll-success-1792570026775.webp),
  [tree](../evidence/chromium-phone-A06-ticket-poll-success-1792570026775.aria.txt).

- 2026-10-21T08:07:08.385Z — phone A07-offline-reconnect: **PASS**.
  {"offlineDidNotUpload":true,"reconnectedGenerationSucceeded":true,"requests":[{"at":1792570031499,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570035021,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"limits":"Playwright
  network-offline signal; no real endpoint delivery claimed."} Evidence:
  [screenshot](../evidence/chromium-phone-A07-offline-reconnect-1792570035842.webp),
  [tree](../evidence/chromium-phone-A07-offline-reconnect-1792570035842.aria.txt).

- 2026-10-21T08:07:17.466Z — phone W13-ai-idb-quota: **PASS**.
  {"quotaHits":1,"uploadBeforeDurableStorage":false,"retrySucceeded":true,"requests":[{"at":1792570040600,"method":"GET","host":"127.0.0.1:6150","path":"/api/free-generation-grant","query":"","origin":null,"upload":null,"credential":["x-installation-id"],"reply":200},{"at":1792570044811,"method":"POST","host":"127.0.0.1:6150","path":"/api/generate-image","query":"?style=Sticker","origin":"http://127.0.0.1:6150","upload":{"contentType":"image/webp","bytes":4612,"format":"webp","width":780,"height":1538},"credential":["x-installation-id"],"reply":200}],"limits":"Named
  IDB put QuotaExceededError fixture; actual origin storage not filled."} Evidence:
  [screenshot](../evidence/chromium-phone-W13-ai-idb-quota-1792570045888.webp),
  [tree](../evidence/chromium-phone-W13-ai-idb-quota-1792570045888.aria.txt).
