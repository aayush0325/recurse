# Recurse

Agentic reverse engineering environment — a Ghidra-class desktop app in the spirit of
"Cursor for reverse engineering". Built with **Tauri 2** (React + TypeScript frontend) on top
of an existing RE toolchain: **[radare2](https://rada.re)** does all parsing, analysis,
disassembly, xrefs, strings and imports; **r2ghidra** (optional) provides decompilation.

## Features

- Cursor-style workspace: function list, disassembly/strings/imports tabs, and a chat
  agent sidebar (toggle with the Chat button or `Ctrl+L`)
- Live analysis session on any binary — including extension-less files
- LLM agent backed by an OpenAI-compatible endpoint (OpenRouter by default) with a
  model picker; drives the session directly (disasm, xrefs, strings, imports, decompile)
- Dark-first UI built with Tailwind CSS v4 + shadcn/ui

## Prerequisites

### 1. Core toolchains

| Tool     | Version (tested)   | Install                                                                 |
| -------- | ------------------ | ----------------------------------------------------------------------- |
| Node.js  | ≥ 20 (23.11 used)  | https://nodejs.org or `nvm`                                              |
| npm      | ≥ 10               | ships with Node.js                                                       |
| Rust     | ≥ 1.77 (1.97 used) | https://rustup.rs                                                         |
| cargo    | —                  | ships with Rust (rustup)                                                  |

Verify:

```bash
node --version && npm --version && rustc --version && cargo --version
```

### 2. radare2 (analysis engine)

`r2` must be on `PATH`. **Build from source** (recommended) — distro packages are often
outdated and incompatible with the r2pm plugin registry (see r2ghidra below):

```bash
# 1. Clone and install the latest radare2
git clone https://github.com/radareorg/radare2
cd radare2
./sys/install.sh

# 2. Confirm the install
r2 -v
```

For a quick non-recommended option, distro packages also exist:

```bash
sudo apt install -y radare2
```

### 3. Tauri Linux system dependencies

Debian/Ubuntu/Pop!_OS:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential \
  curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Other distros: follow the official
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

### 4. r2ghidra (optional — decompiler view)

If the previous step failed (e.g. the `r2pm` registry couldn't find plugins), it's because
the distro `radare2` is too old — rebuild from source as above, then install the plugin:

```bash
# From the radare2 repo directory (must be on the latest radare2 built from source):
r2pm -i          # update / initialize the plugin registry
r2pm -ci r2ghidra
```

Without it, the Decompile tab surfaces a graceful error; everything else works.

## Build

### Development

```bash
npm install
npm run tauri dev
```

This starts the Vite dev server and launches the Tauri window. First compile takes a
while (Rust build); subsequent ones are fast.

### Production binary

```bash
npm install
npm run tauri build
```

The bundle lands in `src-tauri/target/release/bundle/`:

- `.deb` / `.rpm` / `.AppImage` for Linux
- standalone binary at `src-tauri/target/release/recurse`

### Just the frontend (no desktop shell)

```bash
npm install
npm run build   # tsc typecheck + vite build → dist/
npm run preview # serve dist/ for a quick look
```

## Quality checks

```bash
npm run lint          # ESLint (flat config)
npm run format        # Prettier (tabs, 4-wide) + cargo fmt
npm run format:check  # verify formatting without writing
npm run build         # TypeScript + Vite build
cargo check           # Rust compile check (run in src-tauri/)
```

## Agent LLM

The agent chat panel runs on an OpenAI-compatible endpoint. Configure the API key and
model from the in-app model picker (persisted to `~/.recurse/config.json`), or via env:

```bash
export RECURSE_LLM_API_KEY=sk-or-...   # or OPENROUTER_API_KEY
export RECURSE_LLM_ENDPOINT=https://openrouter.ai/api/v1/chat/completions  # optional
export RECURSE_LLM_MODEL=openrouter/auto  # optional
```

Without credentials it falls back to an echo client so the wiring stays exercisable.

The agent sees live binary context (arch, bits, type) and can drive any radare2
command (disassembly, xrefs, strings, imports, decompilation) through the session.

## License

[MIT](./LICENSE) — © 2026 Aayush Khanna