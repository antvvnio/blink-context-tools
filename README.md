# Blink Context Tools

A VS Code extension that adds convenient Explorer actions for the Roblox [Blink](https://github.com/1Axen/blink) networking compiler.

## Features

### `.blink` files

Select one or more `.blink` files in the Explorer and right-click:

- **Blink: Generate** — runs `blink <file>` for every selected `.blink` file.
- **Blink: Watch** — runs `blink <file> --watch` for every selected `.blink` file.
- **Blink: Stop Watch** — stops active watchers for the selected `.blink` files.

### Folders

Right-click a folder:

- **Blink: Generate All** — recursively generates every `.blink` file under that folder.
- **Blink: Watch All** — recursively watches every `.blink` file under that folder.
- **Blink: Stop Watching All** — stops active Blink watchers under that folder.

## Requirements

Blink must already be installed and available as `blink` on your system `PATH`, for example through Rokit.

## Output and troubleshooting

Compiler output is written to **Output → Blink Context Tools**.

If the extension reports that Blink cannot be started, open a terminal in VS Code and verify that this works:

```sh
blink --help
```

## Privacy

This extension does not collect telemetry or send data to a remote service. It only starts the locally installed Blink CLI for files you explicitly choose from the VS Code Explorer.

## AI-assisted development

This extension was created with the assistance of AI. I originally made it for personal use because I only needed a small VS Code integration for Blink and did not have a practical reason to learn another language just to build it. I decided to publish it in case the same workflow is useful to other Roblox developers as well.

## Disclaimer

This community extension is not affiliated with or endorsed by the Blink project or its maintainers. Blink is a third-party project and is not bundled with this extension.
