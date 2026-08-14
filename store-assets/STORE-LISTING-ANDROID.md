<!-- Google Play "Main store listing" — copy/paste fields for Splotch.
     Default language: English (United States) – en-US -->

# Splotch — Google Play store listing

## App name (max 30)

```
Splotch: Drawing for Kids
```

## Short description (max 80)

```
Doodle, color, and create. A quiet, ad-free coloring app made for little hands
```

## Full description (max 4000)

```
Splotch is a simple, joyful drawing app made for the youngest artists — toddlers and preschoolers who just want to scribble, color, and make something of their own.

There are no menus to get lost in, no ads to tap by accident, no accounts to create, and nothing to buy. You open the app and you draw. That's it.

WHAT KIDS CAN DO
• Draw with big, chunky, crayon-like strokes that feel great on a finger.
• Pick from a row of bright, friendly colors — or open the rainbow color picker for hundreds more.
• Choose how thick or thin each line is.
• Color inside the lines with built-in coloring book pages — animals and more.
• Undo a mistake, erase a little, or clear the page and start fresh.
• Snap a "photo" of a finished masterpiece and save it to the device gallery.
• Gentle drawing sounds make every stroke feel alive (and can be turned off).

MADE FOR LITTLE HANDS
Splotch is designed for ages 2 and up. The canvas fills the whole screen, the buttons are large and out of the way, and there's nothing a small tap can break. Advanced tools can be hidden entirely from Settings, so you can keep things as simple as a blank page and a box of crayons.

SETTINGS, NOT A PAYWALL
Tucked in the corner, behind a button kids tend to ignore, Settings lets you:
• Turn individual tools on or off (eraser, coloring books, undo, the camera, sounds).
• Read quick tips for locking the app to one screen using your device's built-in screen pinning, so playtime stays in Splotch.

OPTIONAL AI "MAGIC IMAGE"
For families who want it, Splotch can turn a child's drawing into a piece of AI art using OpenAI. This feature is off until a parent enables it with an access code or their own OpenAI key. We never keep a copy of a parent's key. A child's drawing is only sent for processing when the button is tapped, every result is labelled AI-generated, and a grown-up can report a result from inside the app for human review. The whole feature can stay switched off.

WORKS OFFLINE
The whole drawing experience — canvas, colors, coloring books, sounds, and saving — works completely offline. No connection required. (The optional AI feature is the only part that needs the internet, and it hides itself when you're offline.)

PRIVACY YOU CAN TRUST
Splotch collects nothing in the background. No ads. No tracking. No analytics. No third-party advertising SDKs. No sign-in. Ordinary drawings stay on the device; optional AI and support features send only what a grown-up deliberately chooses. A confirmed AI report is kept privately for no more than 30 days. Read the full policy at https://splotch.art/privacy.

Splotch is also free and open source. If you spot a problem or have an idea, you can reach us through the project on GitHub.

Open it up, hand over the device, and let them make a mess. That's the whole idea.
```

## Play Console declarations

Use these answers for the shipped behavior. If Play renames a field, preserve the substance rather
than selecting a more favorable-sounding category.

### Data safety

* Data collected: **Yes**. Data shared: **No** under Play's service-provider/user-initiated transfer
  rules. The drawing is nevertheless sent through Splotch to OpenAI when the user requests
  generation, exactly as disclosed in the privacy policy. It is not sold, used for advertising, or
  used for tracking by Splotch.
* **Photos and videos**: collected, optional, not linked to identity, purpose **App functionality**.
  Ordinary AI requests and refusals are processed ephemerally by Splotch. If a grown-up confirms
  “Report this picture” or “Report this refusal,” the input drawing is retained privately for up to
  30 days; a refusal report also retains the provider's reason, and a picture report retains the
  generated output.
* **Other user-generated content**: collected, optional, not linked to identity, purpose **App
  functionality / developer communications**. This covers typed feedback and the server-resolved
  prompt, style, and timestamp retained with a confirmed AI report.
* **Device or other IDs / diagnostics**: the feedback form can optionally attach app version,
  platform, OS, browser/device description, and screen size. Declare the nearest current Play
  diagnostic/device category as collected, optional, not linked to identity, purpose **App
  functionality / developer communications**.
* Data is encrypted in transit. A parent can request deletion through the privacy-policy contact;
  reported-image evidence is also purged automatically after 30 days.

### AI-generated content and content rating

* App contains AI-generated content: **Yes** — image-to-image generation.
* In-app AI-content reporting: **Yes** — every result is labelled “AI-generated picture,” and a
  grown-up can report either an inappropriate result or a possible false-positive refusal. Each
  action opens a confirmation naming the private evidence before sending. Reports are reviewed
  within 24 hours.
* User-to-user sharing, social features, chat, or public user-generated content: **No**.
* Free-form AI prompts: **No**. The server accepts only its closed art-style enum and builds the
  complete prompt itself; a user cannot enter prompt text.
* Complete the IARC questionnaire from these facts and use the rating it calculates. Do not select
  “Everyone” by assumption or leave the app unrated.
