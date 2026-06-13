<!-- Apple App Store Connect — copy/paste fields for Splotch.
     Default language: English (U.S.) – en-US -->

# Splotch — Apple App Store listing


## App name  (max 30)

```
Splotch: Drawing for Kids
```


## Subtitle  (max 30)

```
Calm, ad-free art for ages 2+
```


## Promotional text  (max 170 — editable any time without a new review)

```
A blank page and a box of crayons — no ads, no accounts, nothing to buy. Open Splotch, hand over the device, and let them make a mess.
```


## Keywords  (max 100 — comma-separated; words already in the name/subtitle are indexed automatically, so they're omitted)

```
toddler,doodle,color,coloring,paint,scribble,preschool,crayon,art,sketch,creative,baby
```


## Description  (max 4000 — same copy as the Play listing)

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
Splotch is designed for ages 2 and up. The canvas fills the whole screen, the buttons are large and out of the way, and there's nothing a small tap can break. Advanced tools can be hidden entirely from the Parent Center, so you can keep things as simple as a blank page and a box of crayons.

A PARENT CENTER, NOT A PAYWALL
Tucked in the corner, behind a button kids tend to ignore, the Parent Center lets you:
• Turn individual tools on or off (eraser, coloring books, undo, the camera, sounds).
• Read quick tips for locking the app to one screen using your device's built-in Guided Access, so playtime stays in Splotch.

OPTIONAL AI "MAGIC IMAGE"
For families who want it, Splotch can turn a child's drawing into a piece of AI art using Google's Gemini. This feature is off until a parent enables it, and it works on a bring-your-own-key basis: you paste your own Google AI key, it's stored only on your device, and any usage is billed to your own Google account. We never keep a copy of your key. A child's drawing is only ever sent for processing when the button is tapped — and the whole feature can stay switched off.

WORKS OFFLINE
The whole drawing experience — canvas, colors, coloring books, sounds, and saving — works completely offline. No connection required. (The optional AI feature is the only part that needs the internet, and it hides itself when you're offline.)

PRIVACY YOU CAN TRUST
Splotch collects nothing. No ads. No tracking. No analytics. No third-party advertising SDKs. No sign-in. We don't know who's using the app, and we'd like to keep it that way. Read the full policy at https://splotch.art/privacy.

Splotch is also free and open source. If you spot a problem or have an idea, you can reach us through the project on GitHub.

Open it up, hand over the device, and let them make a mess. That's the whole idea.
```


## What's New  (max 4000)

Generated per release — `fastlane/metadata/en-US/release_notes.txt` (written by
`npm run gen:releases` from `releases/<version>.md`).


## URLs

| Field | Value |
| --- | --- |
| Support URL | https://github.com/KyleMit/Splotch/issues |
| Marketing URL (optional) | https://splotch.art |
| Privacy Policy URL | https://splotch.art/privacy |


## Categories & age

| Field | Value |
| --- | --- |
| Primary category | Education |
| Secondary category (optional) | Entertainment |
| Kids Category | Yes — age band **5 & Under** |
| Age rating questionnaire | Should land at **4+** (no violence, no UGC sharing, no web access) |


## App Privacy (nutrition label)

Declare exactly this — it must match the Play Data safety form and the privacy
policy:

* **Data not collected** for everything, with one carve-out if the reviewer
  presses on the AI feature: **User Content (drawings)** — used for **App
  Functionality** only, **not linked to identity**, **not used for tracking**,
  sent only when the user taps the button.
* No third-party SDKs, no analytics, no ads, no accounts.


## Screenshots (this folder)

| Device slot | Files | Size |
| --- | --- | --- |
| iPhone 6.9" | `screenshots/iphone69/01–05` | 1290×2796 portrait |
| iPad 13" | `screenshots/ipad13/01–05` | 2732×2048 landscape |

Regenerate with `npm run gen:shots`. The App Store icon is **not** uploaded
separately — App Store Connect takes the 1024×1024 `AppIcon` from the binary's
asset catalog (`ios/App/App/Assets.xcassets`).


## Kids Category notes (review will check these)

* No third-party analytics or advertising — true, keep it that way.
* External links / purchases must sit behind a parental gate. The only outbound
  surfaces are in the Parent Center and About tab (GitHub, privacy policy);
  verify they're acceptable or gate them before submission.
* The AI feature sends the child's own drawing for processing at an explicit
  tap, requires a parent to enable it in the Parent Center first, and involves
  no browsing, chat, or sharing — document this in the review notes field.
