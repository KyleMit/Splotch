<!-- Apple App Store Connect — copy/paste fields for Splotch.
     Default language: English (U.S.) – en-US -->

# Splotch — Apple App Store listing

## App name (max 30)

```
Splotch: Drawing for Kids
```

## Subtitle (max 30)

```
Calm, ad-free art for ages 2+
```

## Promotional text (max 170 — editable any time without a new review)

```
A blank page and a box of crayons — no ads, no accounts, nothing to buy. Open Splotch, hand over the device, and let them make a mess.
```

## Keywords (max 100 — comma-separated; words already in the name/subtitle are indexed automatically, so they're omitted)

```
toddler,doodle,color,coloring,paint,scribble,preschool,crayon,art,sketch,creative,baby
```

## Description (max 4000 — same copy as the Play listing)

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
• Read quick tips for locking the app to one screen using your device's built-in Guided Access, so playtime stays in Splotch.

OPTIONAL AI "MAGIC IMAGE"
For families who want it, Splotch can turn a child's drawing into a piece of AI art using Google's Gemini. This feature is off until a parent enables it with an access code or their own Google AI key. We never keep a copy of a parent's key. A child's drawing is only sent for processing when the button is tapped, every result is labelled AI-generated, and a grown-up can report a result from inside the app for human review. The whole feature can stay switched off.

WORKS OFFLINE
The whole drawing experience — canvas, colors, coloring books, sounds, and saving — works completely offline. No connection required. (The optional AI feature is the only part that needs the internet, and it hides itself when you're offline.)

PRIVACY YOU CAN TRUST
Splotch collects nothing in the background. No ads. No tracking. No analytics. No third-party advertising SDKs. No sign-in. Ordinary drawings stay on the device; optional AI and support features send only what a grown-up deliberately chooses. A confirmed AI report is kept privately for no more than 30 days. Read the full policy at https://splotch.art/privacy.

Splotch is also free and open source. If you spot a problem or have an idea, you can reach us through the project on GitHub.

Open it up, hand over the device, and let them make a mess. That's the whole idea.
```

## What's New (max 4000)

Generated per release — `fastlane/metadata/en-US/release_notes.txt` (written by
`npm run gen:releases` from `releases/<version>.md`).

## URLs

| Field                    | Value                                     |
| ------------------------ | ----------------------------------------- |
| Support URL              | https://github.com/KyleMit/Splotch/issues |
| Marketing URL (optional) | https://splotch.art                       |
| Privacy Policy URL       | https://splotch.art/privacy               |

## General

| Field                     | Value                              |
| ------------------------- | ---------------------------------- |
| Copyright                 | 2026 Kyle Mitofsky                 |
| Routing App Coverage File | N/A — not a routing/navigation app |

## Categories & age

| Field                         | Value                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Primary category              | Education                                                                                                |
| Secondary category (optional) | Entertainment                                                                                            |
| Kids Category                 | Yes — age band **5 & Under**                                                                             |
| Age rating questionnaire      | Use the exact answers below; confirm App Store Connect calculates **4+** before selecting Kids 5 & Under |

## App Privacy (nutrition label)

Declare exactly this — it must match `ios/App/App/PrivacyInfo.xcprivacy`, Play Data safety, and the
privacy policy:

* **User Content → Other User Content**: collected, used for **App Functionality**, **not linked to
  identity**, and **not used for tracking**. It covers drawings sent for AI processing, typed
  private feedback, and confirmed AI reports. Ordinary generation and refusals are ephemeral; a
  confirmed report retains the input drawing, server-resolved prompt, style, and timestamp privately
  for up to 30 days, plus the output for a picture report.
* **Diagnostics → Other Diagnostic Data**: collected only when a grown-up opts to attach the
  feedback form's app/device snapshot, used for **App Functionality**, **not linked to identity**,
  and **not used for tracking**.
* No contact information, location, identifiers, purchases, usage analytics, advertising data, or
  tracking. No ad or analytics SDKs and no accounts.

## Age rating answers

Enter the current questionnaire from the shipped behavior:

* In-app parental controls: **Yes** — protected sends and external actions use Splotch's parental
  gate.
* User-generated content distributed to other users: **No**. AI results are shown only to the person
  using the device; reports go privately to the developer.
* Messaging/chat, social networking, advertising, unrestricted web access, gambling, contests, loot
  boxes, in-app purchases, and public sharing: **No**.
* Violence, sexual content or nudity, profanity, horror/fear, drugs, alcohol/tobacco, medical
  content, and other objectionable-content descriptors: **None** for expected app content. The AI
  feature uses a closed server-side style enum and safety controls, labels every result, and offers
  private in-app reporting.
* Confirm the calculated result in App Store Connect. Select **Kids Category, 5 & Under** only while
  that calculated rating remains eligible; do not override a different calculated result.

## App Review notes — AI safety

Splotch's optional image-to-image Gemini feature is disabled until a parent supplies an access code
or API key. Users cannot enter free-form prompts: the server accepts only a closed art-style enum
and constructs the full prompt. Every output is visibly labelled “AI-generated picture.” A grown-up
can report either an inappropriate picture or a possible false-positive refusal, review a
confirmation, follow the dedicated parental-gate policy, and privately send the evidence named
there. A refusal report contains the input drawing, resolved prompt, style, and timestamp; a picture
report also contains the output. A human reviews reports within 24 hours; evidence is automatically
deleted after 30 days. There is no browsing, chat, public sharing, or user-to-user distribution.

## Screenshots (this folder)

| Device slot | Files                        | Size                |
| ----------- | ---------------------------- | ------------------- |
| iPhone 6.9" | `screenshots/iphone69/01–05` | 1290×2796 portrait  |
| iPad 13"    | `screenshots/ipad13/01–05`   | 2732×2048 landscape |

Regenerate with `npm run gen:store-assets`. The App Store icon is **not** uploaded separately — App
Store Connect takes the 1024×1024 `AppIcon` from the binary's asset catalog
(`ios/App/App/Assets.xcassets`).

## Kids Category notes (review will check these)

* No third-party analytics or advertising — true, keep it that way.
* External links / purchases must sit behind a parental gate. The outbound links are in Settings'
  About section (GitHub, privacy policy); opening Settings is not proof of adulthood, so verify each
  link and gate the affected action before submission.
* The AI feature sends the child's own drawing for processing at an explicit tap, requires a parent
  to enable it first, allows no free-form prompt, visibly labels its output, and provides gated
  private reporting — use the review-note text above.
