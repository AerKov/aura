# 0038: Built-in llama.cpp and a local model chooser

- Status: accepted
- Date: 2026-10-30
- Phase: 37 (follow-up)

## Context

Running a model on your own computer meant installing Ollama or LM Studio, pulling a model by hand
and pointing Aura at it. For someone who wants free and private AI that is a lot of steps.

## Decision

- **Aura installs llama.cpp itself** (`llama-cpp` engine, Aura's own agent loop over its
  OpenAI-compatible server). The program comes only from the official `ggml-org/llama.cpp` releases:
  the latest release's asset for this system (Metal on a Mac; Vulkan, then CPU, on Windows and Linux
  x64; CPU on ARM). Download addresses outside that repository are dropped, and the archive's SHA-256
  stated by GitHub must match, or the install is refused. A GPU build that does not start on this
  computer (no driver) is replaced by the CPU build of the same release.
- **Models** come from Hugging Face GGUF repositories: a short curated list (Qwen3 4B and 8B, gpt-oss
  20B, Llama 3.2 3B, Liquid LFM2 1.2B) marked as fitting this computer's memory, with the best fit
  recommended, or any repository the user types (`owner/name:Q4_K_M`). The catalog names a repository
  and a quantization; the exact file, size and checksum are read from Hugging Face when the plan is made.
  Split and vision-projector files are not offered.
- **Approval first.** "Install" makes a plan: what is downloaded, from where, how big, how much disk is
  free. Nothing is fetched until the user says yes, and the server only runs a plan it made itself, so
  addresses never come from the client. A download goes to a `.part` file, is checked against its
  checksum and put in place only when whole.
- **Running.** `llama-server` starts on a model when a helper first uses it, on 127.0.0.1 with a random
  port and key (`--jinja` for tool calls), and stops after 20 minutes without use or when the model
  is changed or removed. Files live in `state/llama/` (outside git). The first successful install makes
  the model the engine's model and, if no other engine works, the default.

## Consequences

- Fully offline use becomes one click for people who do not want a cloud key; free services stay first
  (ADR 0037), and Ollama and LM Studio still work.
- Not verified here: the build environment reaches neither GitHub nor Hugging Face, so the flow is
  tested against fake servers (including a real archive unpacked with `tar`); asset names, repository
  names and file sizes of the catalog come from public conventions and are resolved at install time.
- Needs the system `tar` to unpack (Windows 10+, macOS and Linux have one).
