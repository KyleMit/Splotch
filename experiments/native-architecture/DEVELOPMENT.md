# Drawing development checkpoint

This candidate is a runnable development slice. It does not select a migration framework or certify
Release builds. The shipping Capacitor app and its native smoke flow are separate.

The screen supports strokes, paint colors, Pencil and Marker, Undo, Clear, PNG sharing, and saving
and reopening pictures in app-private storage. Saved pictures survive an app restart. The native
renderer is `react-native-svg`; PNG export uses its raster `toDataURL` callback and Expo file and
sharing APIs.

## Local iOS development

Use Node24 and the Ruby version in `Gemfile`. Install JavaScript packages at the repository root
with `pnpm install --frozen-lockfile`. Run ordinary `bundle install` from this directory using an
isolated bundle path. On this host, Ruby/OpenSSL needs `SSL_CERT_FILE=/etc/ssl/cert.pem` to use the
system CA bundle; certificate verification stays enabled. CocoaPods must run with the same Ruby and
bundle environment. `nkf` and JSON below3 are explicit Gemfile compatibility requirements.

Select an available simulator with `xcrun simctl list devices available`. Choose an unused port with
`npm --silent run show:free-port`; the example uses5300. From this directory, start Metro:

```sh
node ../../node_modules/expo/bin/cli start --port 5300 --localhost --max-workers 2
```

In another terminal with the same package and Ruby environment, build and install:

```sh
NODE_BINARY="$(command -v node)" node ../../node_modules/expo/bin/cli run:ios \
  --device "$SIMULATOR_ID" --configuration Debug --port 5300
```

The maintained bundle recipe admits Debug and Release. Release retains its ambient override
refusals. Debug uses the supported React Native Metro route. An installed simulator app can be
launched directly when desktop GUI activation is unavailable:

```sh
xcrun simctl launch --terminate-running-process "$SIMULATOR_ID" art.splotch.migration.probe \
  -RCT_jsLocation localhost:5300
```

`RCT_jsLocation` is the installed React Native bundle provider's supported user-default key. Match
its value to the chosen Metro port. The Debug app needs Metro. Build a standalone Release app with
the same package and Ruby environment:

```sh
NODE_BINARY="$(command -v node)" node ../../node_modules/expo/bin/cli run:ios \
  --device "$SIMULATOR_ID" --configuration Release --no-bundler
```

Do not combine `--port` with `--no-bundler`; Expo refuses that combination. Launch the installed
Release app without `RCT_jsLocation` or Metro:

```sh
xcrun simctl launch --terminate-running-process "$SIMULATOR_ID" art.splotch.migration.probe
```

CocoaPods writes the project, workspace, lock, privacy manifest and generated dependency tree.
Preserve those development outputs separately from maintained template sources. The maintained
source checker continues to reject generated paths; do not feed a working CocoaPods tree into it as
accepted template input.

## Recorded scope

Browser and iOS simulator interactions are development evidence. A physical phone was unavailable at
the first checkpoint. Device signing, supported OS floors, optimized Android and iOS artifacts,
performance comparison and final migration acceptance remain separate requirements.
