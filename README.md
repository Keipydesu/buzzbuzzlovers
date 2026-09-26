# buzzbuzzlovers

A HackGT 13 project by team **buzzbuzzlovers**: a small wearable that tracks slouching, paired with a mobile-first web dashboard for daily awareness, weekly history, and gamified progress.

**Status: planning.** This repository currently contains the MVP specification only. No application or firmware has been implemented. The earlier JavaScript prototype has been discarded.

## The idea

Long desk sessions can make it easy to lose awareness of how we sit. We want to help students notice their posture habits through measurable feedback and small, encouraging goals. This is a posture-awareness project, not a medical diagnostic tool; health benefits are not yet validated.

## Decisions so far

- Four-person team.
- ESP32-based wearable, with the exact board and posture sensor still to be selected.
- All posture calculations run locally on the ESP32.
- Bluetooth Low Energy (BLE) transfers calculated results to a nearby laptop browser.
- The web app displays and stores results; it does not classify raw sensor readings.
- Ruby on Rails is the preferred web framework.
- Mobile-first interface, with laptops used for the initial Bluetooth demo because the team does not have an Android phone.
- Daily slouch frequency and duration, weekly history, and simple gamification are the core app features.

## Proposed data flow

```text
Posture sensor
      |
      v
ESP32: calibration, posture classification, episode timing
      |
      | BLE: calculated results
      v
Laptop browser: connection and live display
      |
      v
Rails: session storage, daily summaries, weekly history, rewards
```

The BLE link is local. Whether Rails is hosted online or runs locally is still undecided; local Bluetooth does not by itself make the entire app offline.

Read [the MVP plan](docs/MVP.md) for scope, the demo flow, proposed workstreams, and open decisions. Read [the roadmap](docs/ROADMAP.md) for how that scope sequences into phases.

For the software work, read [the app plan](docs/APP_PLAN.md) and [the app API proposal](docs/app-api.md). The [BLE proposal](docs/ble-protocol.md) defines the wearable-to-browser boundary. These are planning documents, not implemented interfaces.

## Development

Use established, security-reviewed gems and other dependencies. Avoid brand-new packages and releases without substantial independent scrutiny, and review provenance, advisories, and transitive changes before adoption. See [the dependency safety policy](docs/dependency-safety.md) for required checks and review evidence.

There are no installation or run commands yet. Agree on the remaining hardware and software choices before scaffolding the Rails app or firmware.

## Browser constraint

Web Bluetooth requires a compatible browser and secure context. Plan to test the exact laptop OS/browser combination early. Chrome documents support on macOS, Windows, ChromeOS, and Android, with additional restrictions for Linux. Safari does not support Web Bluetooth, so a mobile-first layout does not imply iPhone Bluetooth support.

References: [Chrome Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth), [MDN compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility).
